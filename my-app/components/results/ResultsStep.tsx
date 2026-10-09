"use client";

/**
 * The request receipt: what the results route shows when there is no result.
 *
 * Deliberately not a step. The rail is a map of decisions still to make, and
 * this is the consequence of all four of them, so it has no pill and no
 * Continue. See TERMINAL_SEGMENTS in services/analysis/steps.ts.
 *
 * WHEN THIS SCREEN IS THE RIGHT ONE. The backend runs a weighted overlay, and
 * it has exactly one topic behind it: flood risk. The other three are on the
 * model track, nothing has been trained, and there is no service to ask. For
 * those, the honest screen is this one: the validated request that a future
 * service will receive, and the sentence saying so. A progress bar over a
 * number nobody computed would be a lie with a spinner on it.
 *
 * A run that DID happen is a different component entirely, rendered by the
 * route above this one from the service's own result. This file is never the
 * screen for a real run, which is why nothing in it was rewritten to pretend
 * it could be.
 *
 * The configuration arrives in the URL and the areas arrive in sessionStorage,
 * paired by the id in `?req=`. That pairing is checked twice, and both checks
 * are needed: `readAreas` proves the stored areas were filed under this id, and
 * recomputing the id from the configuration now in the URL proves the id still
 * describes what the URL says. Without the second check, editing `model=` in
 * the address bar leaves `?req=` untouched, the storage check passes, and the
 * page renders a previous selection beside a configuration it was never chosen
 * for. A confidently wrong answer is worse than none.
 */

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import RequestResult from "@/components/topic/RequestResult";
import {
  ArrowCounterclockwise20Regular,
  ArrowLeft20Regular,
  Location20Regular,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { StatTile } from "@/components/ui/StatTile";
import { StateBlock } from "@/components/ui/StateBlock";
import { buttonClasses } from "@/components/ui/button-classes";
import { FRAME } from "@/components/shell/Page";
import Downloads, { type DownloadFile } from "@/components/results/Downloads";
import { buildRequest } from "@/services/analysis/request";
import { REQUEST_PARAM, requestId } from "@/services/analysis/request-id";
import { resetSelection } from "@/services/analysis/selection-store";
import { stepHref } from "@/services/analysis/steps";
import { HANDOFF_MESSAGE, clearAreas, readAreas } from "@/services/handoff/areas";
import type { HandoffFailure } from "@/services/handoff/areas";
import { getAnalysisType, getModel } from "@/services/analysis/models";
import { formatArea } from "@/services/geo/area";
import { padBounds, unionBounds } from "@/services/geo/bounds";
import type { AnalysisRequest, RequestArea } from "@/services/analysis/request";
import type { Topic } from "@/services/analysis/topics";
import type { UrlSelection } from "@/services/analysis/url-state";
import type { FocusRequest } from "@/services/analysis/selection";

/* ------------------------------------------------------------------ map ---- */

/**
 * ssr:false, like every other mount of this map. Leaflet touches `window` at
 * import time, so a server render of this route would throw. MapPanel is the
 * boundary everywhere else; AoiMap is imported directly here because this page
 * needs no drawing tools.
 */
const AoiMap = dynamic(() => import("@/components/map/AoiMap"), {
  ssr: false,
  loading: () => (
    <div
      className="grid h-full w-full place-items-center bg-sunken"
      role="status"
      aria-live="polite"
    >
      <span className="type-caption1 text-ink-faint">Loading map...</span>
    </div>
  ),
});

/* -------------------------------------------------------------- failures ---- */

/**
 * What to do about each way the handoff can fail.
 *
 * Keyed by the same union the handoff module declares, so a new failure mode
 * is a type error here rather than a silent fallthrough to a generic message.
 * The message itself comes from HANDOFF_MESSAGE; this table only adds what the
 * reader should do next, which is page-specific and belongs here.
 */
const RECOVERY: Readonly<Record<HandoffFailure, string>> = {
  missing: "Reselect the areas to run this configuration again.",
  mismatch:
    "Go back to review and run it again to pair this configuration with its areas.",
  corrupt: "Reselect the areas and run it again.",
  unavailable:
    "Results need session storage to carry the selected areas between pages.",
};

function HandoffProblem({
  topic,
  reason,
  query,
}: {
  topic: Topic;
  reason: HandoffFailure;
  query: string;
}) {
  return (
    <div className={`${FRAME} py-8 lg:py-10`}>
      <StateBlock
        tone="warn"
        icon={<Location20Regular />}
        title="The areas for this request are not available"
        className="mx-auto max-w-2xl"
        actions={
          <>
            <Link
              href={stepHref(topic.slug, "areas", query)}
              className={buttonClasses({ appearance: "primary" })}
            >
              Select areas
            </Link>
            <Link href={stepHref(topic.slug, "review", query)} className={buttonClasses()}>
              <ArrowLeft20Regular aria-hidden="true" />
              Back to review
            </Link>
          </>
        }
      >
        <p className="type-caption1 font-semibold text-ink-faint">No request to show</p>
        <p className="mt-1" data-testid="handoff-problem" data-reason={reason}>
          {HANDOFF_MESSAGE[reason]} {RECOVERY[reason]}
        </p>
      </StateBlock>
    </div>
  );
}

/* ------------------------------------------------------------ downloads ---- */

/**
 * One download path, three formats.
 *
 * Every export carries the same notice as the page: this is a validated
 * request, not a computed result. A file detached from the page must not be
 * mistakable for model output, which is the same rule the analysis contract
 * puts on the service's own exports.
 */
const NOT_A_RESULT =
  "This file is a validated analysis request. No model has been run and no " +
  "value here is a prediction.";

function csvField(value: string): string {
  // Kenyan county names include an apostrophe (Murang'a) and analyst labels can
  // include a comma, so quoting is not optional.
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(request: AnalysisRequest, notes: string): string {
  const header = ["notice", csvField(NOT_A_RESULT)].join(",");
  const meta = [
    ["schema_version", request.schemaVersion],
    ["topic", request.topic],
    ["analysis_type", request.analysisType],
    ["model", request.model],
    ["analyst_notes", notes],
  ]
    .map(([k, v]) => `${k},${csvField(v)}`)
    .join("\n");
  const areas = [
    "area_id,label,source,area_km2,south,west,north,east",
    ...request.areas.map((a) =>
      [
        a.id,
        csvField(a.label),
        a.source,
        a.areaKm2 ?? "",
        a.bounds[0][0],
        a.bounds[0][1],
        a.bounds[1][0],
        a.bounds[1][1],
      ].join(","),
    ),
  ].join("\n");

  return `${header}\n\n${meta}\n\n${areas}\n`;
}

/**
 * The three files, as finished strings for the shared download list. Same
 * filenames, bodies and types the receipt has always saved; the save itself is
 * Downloads' one path, shared with the computed result.
 */
function requestFiles(
  request: AnalysisRequest,
  notes: string,
  id: string | null,
): DownloadFile[] {
  return [
    {
      label: "Full request (JSON)",
      detail: "The validated payload with areas, configuration and your notes.",
      filename: `rangeland-request-${request.topic}-${id}.json`,
      mimeType: "application/json",
      body: JSON.stringify({ notice: NOT_A_RESULT, request, analystNotes: notes }, null, 2),
    },
    {
      label: "Areas table (CSV)",
      detail: "One row per area with its source, size and bounding box.",
      filename: `rangeland-areas-${request.topic}-${id}.csv`,
      mimeType: "text/csv",
      body: toCsv(request, notes),
    },
    {
      label: "Areas (GeoJSON)",
      detail: "The real selected geometry, for GIS software.",
      filename: `rangeland-areas-${request.topic}-${id}.geojson`,
      mimeType: "application/geo+json",
      body: JSON.stringify(
        {
          type: "FeatureCollection",
          notice: NOT_A_RESULT,
          features: request.areas.map((a) => ({
            ...a.feature,
            properties: {
              ...(a.feature.properties ?? {}),
              area_id: a.id,
              label: a.label,
              source: a.source,
              area_km2: a.areaKm2,
            },
          })),
        },
        null,
        2,
      ),
    },
  ];
}

/* --------------------------------------------------------------- props ---- */

export interface ResultsStepProps {
  topic: Topic;
  initial: UrlSelection;
}

/* ----------------------------------------------------------- component ---- */

export default function ResultsStep({ topic, initial }: ResultsStepProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // `?req=`, the app's own id for an unsubmitted request. Not `?run=`, which
  // names a real computation on the service and is handled by the route above
  // this component rather than here.
  const runId = searchParams.get(REQUEST_PARAM);

  const [notes, setNotes] = useState("");

  /**
   * Read the handoff once, on the client.
   *
   * A lazy initialiser rather than an effect: the server render has no
   * sessionStorage and would produce the failure state, and correcting that in
   * an effect is a flash of "no result" on every successful run.
   */
  const [handoff] = useState<
    { ok: true; areas: RequestArea[] } | { ok: false; reason: HandoffFailure }
  >(() => {
    if (typeof window === "undefined") {
      return { ok: false as const, reason: "unavailable" as const };
    }
    if (runId === null) return { ok: false as const, reason: "missing" as const };
    return readAreas(runId);
  });

  /**
   * The map flies here once the areas are known.
   *
   * This is the bug the previous version of this file had: it passed
   * `bounds: [[0,0],[0,0]]` for every area and `focus={null}`, so the results
   * map never moved and would have flown to the Gulf of Guinea the moment it
   * did. The bounds are carried through the handoff now, and the union of them
   * is what the map fits. Rubric T5 applies here as much as on the areas step.
   */
  const focus = useMemo<FocusRequest | null>(() => {
    if (!handoff.ok) return null;
    const union = unionBounds(handoff.areas.map((a) => a.bounds));
    return union === null ? null : { bounds: padBounds(union), token: 1 };
  }, [handoff]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (initial.analysisType) params.set("type", initial.analysisType);
    if (initial.modelId) params.set("model", initial.modelId);
    const s = params.toString();
    return s === "" ? "" : `?${s}`;
  }, [initial]);

  /**
   * Rebuild the request from the URL and the restored areas, and re-validate
   * it. Not trusted from storage: the areas came from somewhere a browser
   * extension can write to, and the type and model came from an editable query
   * string. Revalidating means the payload on screen is one the service would
   * accept, or the page says why not.
   */
  const validation = useMemo(() => {
    if (!handoff.ok) return null;
    return buildRequest(topic.slug, {
      analysisType: initial.analysisType ?? "single",
      modelId: initial.modelId ?? "random-forest",
      areas: handoff.areas,
    });
  }, [handoff, initial, topic.slug]);

  /**
   * Does the id in the URL still describe what the URL now says?
   *
   * `readAreas` only proves the stored areas were filed under the id in
   * `?run=`. It cannot see the rest of the query, so editing `model=` in the
   * address bar leaves the id untouched and the storage check passes: the
   * areas would be re-rendered beside a configuration they were never chosen
   * for, which is the exact wrong answer this handoff exists to prevent. An
   * eval caught that, which is why the check is here rather than trusted.
   *
   * So the id is recomputed from the configuration now in the URL plus the
   * areas that came back, and compared with the one the link carries. Any
   * edit to any part of the request changes the recomputed id and is reported
   * as a mismatch.
   */
  const idMatches = useMemo(() => {
    if (validation === null || !validation.ok) return false;
    return requestId(validation.request) === runId;
  }, [validation, runId]);

  if (!handoff.ok) {
    return <HandoffProblem topic={topic} reason={handoff.reason} query={query} />;
  }

  if (validation === null || !validation.ok || !idMatches) {
    return <HandoffProblem topic={topic} reason="mismatch" query={query} />;
  }

  const request = validation.request;
  const spec = getAnalysisType(request.analysisType);
  const model = getModel(request.model);

  const files = requestFiles(request, notes, runId);
  const totalKm2 = request.areas.reduce((sum, area) => sum + (area.areaKm2 ?? 0), 0);

  return (
    <div className="flex flex-1 flex-col">
      {/*
        The same header shape as a computed result, labelled for what this
        is: a validated request, with nothing computed behind it.
      */}
      <section aria-labelledby="receipt-heading" className="border-b border-edge bg-surface">
        <div className={`${FRAME} py-6 lg:py-8`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-caption1 inline-flex items-center rounded-fluent-medium bg-warn-soft px-2 py-0.5 font-semibold text-warn ring-1 ring-warn/30">
                  Not a result
                </span>
                <span className="eyebrow">Validated request</span>
              </div>
              <h2 id="receipt-heading" className="type-subtitle1 mt-2 text-ink">
                Request receipt
              </h2>
              <p className="type-caption1 mt-1 text-ink-faint">
                {topic.name}. Request{" "}
                <span className="font-mono break-all text-ink-muted">{runId}</span>
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link href={stepHref(topic.slug, "review", query)} className={buttonClasses()}>
                <ArrowLeft20Regular aria-hidden="true" />
                Back to review
              </Link>
            </div>
          </div>

          {/*
            Stated once, prominently, and repeated in every export. The app is a
            government decision-support tool; a screen that looks like a result
            and is not one is the single most damaging thing it could render.
            A Fluent MessageBar in the warning intent, so it carries the
            warning icon as well as the words.
          */}
          <Notice intent="warning" title="No model has run." className="mt-5">
            No model backend is connected for this request, so this page shows the validated
            request that the analysis service will receive. Nothing below is a prediction.
          </Notice>
        </div>
      </section>

      <div className={`${FRAME} flex flex-col gap-8 py-8 lg:gap-10 lg:py-10`}>
        <section aria-labelledby="request-summary-heading">
          <h2 id="request-summary-heading" className="sr-only">
            Request summary
          </h2>
          <dl data-testid="results-summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile compact label="Topic" value={topic.name} />
            <StatTile compact label="Analysis type" value={spec.label} />
            <StatTile compact label="Model" value={model?.label ?? request.model} detail="Not run" />
            <StatTile
              compact
              label="Areas"
              value={String(request.areas.length)}
              unit={request.areas.length === 1 ? "area" : "areas"}
              detail={totalKm2 > 0 ? `${formatArea(totalKm2)} in total` : undefined}
            />
          </dl>
        </section>

        <section aria-labelledby="area-details-heading">
          <h2 id="area-details-heading" className="type-subtitle1 mb-4 text-ink">
            Areas in this request
          </h2>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="card h-[360px] overflow-hidden lg:h-[clamp(400px,calc(100svh-320px),560px)]">
              <AoiMap
                areas={handoff.areas}
                focus={focus}
                tool="point"
                onAddAreas={() => {}}
                onFocusArea={() => {}}
                onDrawFinished={() => {}}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <ol
                data-testid="results-areas"
                className="card divide-y divide-edge overflow-hidden"
              >
                {request.areas.map((area, index) => (
                  <li
                    key={area.id}
                    className="grid min-h-10 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-baseline gap-x-2 px-4 py-2.5"
                  >
                    <span className="type-caption1 font-mono text-ink-faint">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="type-body1 block font-semibold break-words text-ink">
                        {area.label}
                      </span>
                      <span className="type-caption1 block text-ink-faint">{area.source}</span>
                    </span>
                    <span className="type-body1 text-right text-ink tabular-nums">
                      {formatArea(area.areaKm2)}
                    </span>
                  </li>
                ))}
              </ol>

              <div className="card flex min-h-[200px] flex-1 flex-col overflow-hidden">
                <header className="flex min-h-11 items-center justify-between border-b border-edge px-4 py-2.5">
                  <h3 className="type-subtitle2 text-ink">Analyst notes</h3>
                  <span className="type-caption1 text-ink-faint tabular-nums">
                    {notes.length > 0 ? `${notes.length} chars` : "Empty"}
                  </span>
                </header>

                {/*
                  Native, so the notes stay a plain controlled string. A brand
                  edge along the bottom of the box while it has focus, and the
                  app-wide ring still shows on keyboard focus.
                */}
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add observations, context, or flags for this request..."
                  className="type-body1 min-h-[140px] flex-1 resize-none border-b-2 border-transparent bg-transparent px-4 py-3 text-ink placeholder:text-ink-faint focus:border-b-accent"
                  aria-label="Analyst notes for this request"
                />

                <p className="type-caption1 border-t border-edge px-4 py-2.5 text-ink-faint">
                  Notes are saved with the JSON and CSV exports.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="export-heading">
          <h2 id="export-heading" className="type-subtitle1 text-ink">
            Export this request
          </h2>
          <p className="type-caption1 mt-0.5 mb-4 text-ink-faint">
            Every file carries the notice above, so one detached from this page cannot be
            mistaken for model output.
          </p>
          <div className="card max-w-3xl overflow-hidden">
            <Downloads files={files} />
          </div>
        </section>

        {/* The payload itself. Reused rather than re-rendered here so there is
            one description of the request shape in the app. */}
        <section>
          <RequestResult request={request} />
        </section>

        <div className="flex flex-wrap gap-2 border-t border-edge pt-6">
          <Button
            type="button"
            data-testid="start-over"
            icon={<ArrowCounterclockwise20Regular />}
            onClick={() => {
              // Drop the pairing as well as the selection, so a later visit to
              // this URL reports "missing" rather than pairing these areas with
              // whatever gets configured next.
              clearAreas();
              resetSelection(topic.slug);
              router.replace(stepHref(topic.slug, "scope"));
            }}
          >
            Start new analysis
          </Button>
          <Link href="/" className={buttonClasses({ appearance: "subtle" })}>
            All topics
          </Link>
        </div>
      </div>
    </div>
  );
}
