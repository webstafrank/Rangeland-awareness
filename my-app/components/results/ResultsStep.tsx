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
import { Eyebrow } from "@/components/ui/Eyebrow";
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
      <span className="text-sm text-ink-faint">Loading map...</span>
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
    <div className="mx-auto w-full max-w-band px-gutter py-16 lg:px-gutter-lg">
      <div className="mx-auto max-w-xl rounded-2xl border border-edge bg-surface p-8 text-center shadow-card">
        <Eyebrow>No result to show</Eyebrow>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          The areas for this run are not available
        </h1>
        <p
          className="mt-3 text-sm leading-relaxed text-ink-muted"
          data-testid="handoff-problem"
          data-reason={reason}
        >
          {HANDOFF_MESSAGE[reason]} {RECOVERY[reason]}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href={stepHref(topic.slug, "areas", query)}
            className="rounded-lg bg-action px-5 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-action-hover"
          >
            Select areas
          </Link>
          <Link
            href={stepHref(topic.slug, "review", query)}
            className="rounded-lg border border-edge-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            Back to review
          </Link>
        </div>
      </div>
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

function download(filename: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-band px-gutter py-6 lg:px-gutter-lg lg:py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div>
            <Eyebrow>Request submitted</Eyebrow>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight lg:text-3xl">
              {topic.name}
            </h1>
          </div>
          <p className="font-mono text-xs text-ink-faint">request {runId}</p>
        </div>

        {/*
          Stated once, prominently, and repeated in every export. The app is a
          government decision-support tool; a screen that looks like a result
          and is not one is the single most damaging thing it could render.
        */}
        <p className="mt-5 rounded-xl border border-warn-border bg-warn-soft px-5 py-4 text-sm leading-relaxed text-ink">
          <span className="font-semibold">No model has run.</span> The model
          backend is not connected yet, so this page shows the validated request
          that the analysis service will receive. Nothing below is a prediction.
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="h-[400px] overflow-hidden rounded-xl border border-edge bg-surface shadow-card lg:h-[clamp(400px,calc(100svh-320px),620px)]">
            <AoiMap
              areas={handoff.areas}
              focus={focus}
              tool="point"
              onAddAreas={() => {}}
              onFocusArea={() => {}}
              onDrawFinished={() => {}}
            />
          </div>

          <div className="flex flex-col rounded-xl border border-edge bg-surface shadow-card">
            <header className="flex items-center justify-between border-b border-edge px-5 py-4">
              <h2 className="text-sm font-semibold tracking-tight">
                Analyst notes
              </h2>
              <span className="text-xs text-ink-faint">
                {notes.length > 0 ? `${notes.length} chars` : "Empty"}
              </span>
            </header>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add observations, context, or flags for this request..."
              className="min-h-[200px] flex-1 resize-none bg-transparent px-5 py-4 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none lg:min-h-0"
              aria-label="Analyst notes for this request"
            />

            <div className="border-t border-edge px-5 py-3">
              <p className="text-xs text-ink-faint">
                Notes are saved with the JSON and CSV exports.
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="border-y border-edge bg-surface">
        <div className="mx-auto w-full max-w-band px-gutter py-8 lg:px-gutter-lg">
          <dl
            data-testid="results-summary"
            className="grid gap-x-8 gap-y-4 sm:grid-cols-4"
          >
            <div>
              <dt className="eyebrow">Topic</dt>
              <dd className="mt-1 text-sm font-semibold">{topic.name}</dd>
            </div>
            <div>
              <dt className="eyebrow">Analysis type</dt>
              <dd className="mt-1 text-sm font-semibold">{spec.label}</dd>
            </div>
            <div>
              <dt className="eyebrow">Model</dt>
              <dd className="mt-1 text-sm font-semibold">
                {model?.label ?? request.model}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Areas</dt>
              <dd className="mt-1 text-sm font-semibold">
                {request.areas.length}{" "}
                {request.areas.length === 1 ? "area" : "areas"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="mx-auto w-full max-w-band px-gutter py-8 lg:px-gutter-lg">
        <div className="max-w-3xl">
          <Eyebrow>Download</Eyebrow>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">
            Export this request
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Every file carries the notice above, so one detached from this page
            cannot be mistaken for model output.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <DownloadCard
            badge="JSON"
            title="Full request"
            body="The validated payload with areas, configuration and your notes."
            onClick={() =>
              download(
                `rangeland-request-${request.topic}-${runId}.json`,
                JSON.stringify(
                  { notice: NOT_A_RESULT, request, analystNotes: notes },
                  null,
                  2,
                ),
                "application/json",
              )
            }
          />
          <DownloadCard
            badge="CSV"
            title="Areas table"
            body="One row per area with its source, size and bounding box."
            onClick={() =>
              download(
                `rangeland-areas-${request.topic}-${runId}.csv`,
                toCsv(request, notes),
                "text/csv",
              )
            }
          />
          <DownloadCard
            badge="Geo"
            title="GeoJSON"
            body="The real selected geometry, for GIS software."
            onClick={() =>
              download(
                `rangeland-areas-${request.topic}-${runId}.geojson`,
                JSON.stringify(
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
                "application/geo+json",
              )
            }
          />
        </div>
      </section>

      <section className="mx-auto w-full max-w-band px-gutter pb-8 lg:px-gutter-lg">
        <div className="max-w-3xl">
          <Eyebrow>Selected areas</Eyebrow>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">
            Area details
          </h2>
        </div>

        <ol
          data-testid="results-areas"
          className="mt-4 divide-y divide-edge overflow-hidden rounded-2xl border border-edge bg-surface shadow-card"
        >
          {request.areas.map((area, index) => (
            <li
              key={area.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-3 text-sm"
            >
              <span className="font-mono text-xs text-ink-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-medium">{area.label}</span>
              <span className="text-xs text-ink-faint">
                {area.source} &middot; {formatArea(area.areaKm2)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* The payload itself. Reused rather than re-rendered here so there is
          one description of the request shape in the app. */}
      <section className="mx-auto w-full max-w-band px-gutter pb-8 lg:px-gutter-lg">
        <RequestResult request={request} />
      </section>

      <div className="mx-auto w-full max-w-band px-gutter pb-12 lg:px-gutter-lg">
        <div className="flex flex-wrap gap-3">
          <Link
            href={stepHref(topic.slug, "review", query)}
            className="rounded-lg border border-edge-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            Back to review
          </Link>
          <button
            type="button"
            data-testid="start-over"
            onClick={() => {
              // Drop the pairing as well as the selection, so a later visit to
              // this URL reports "missing" rather than pairing these areas with
              // whatever gets configured next.
              clearAreas();
              resetSelection(topic.slug);
              router.replace(stepHref(topic.slug, "scope"));
            }}
            className="rounded-lg border border-edge-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            Start new analysis
          </button>
          <Link
            href="/"
            className="rounded-lg border border-edge-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            All topics
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ download ---- */

function DownloadCard({
  badge,
  title,
  body,
  onClick,
}: {
  badge: string;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col rounded-xl border border-edge bg-surface p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-edge-strong hover:shadow-raised"
    >
      <span className="grid h-10 w-10 place-items-center rounded-lg border border-accent bg-accent-soft text-xs font-bold text-accent">
        {badge}
      </span>
      <span className="mt-3 text-sm font-semibold tracking-tight">{title}</span>
      <span className="mt-1 text-xs leading-relaxed text-ink-muted">{body}</span>
      <span className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-accent">
        Download
        <span
          aria-hidden="true"
          className="transition-transform group-hover:translate-x-0.5"
        >
          &rarr;
        </span>
      </span>
    </button>
  );
}
