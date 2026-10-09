"use client";

/**
 * Step 4: read it back, then run.
 *
 * The step the split earns. On the single page the run button sat in a sticky
 * bar under a map, so the last thing an analyst saw before submitting was the
 * thing they had just been fiddling with. Here the last thing they see is the
 * request: every decision restated in words, every area listed, and then the
 * button.
 *
 * Deep-linking this URL with nothing selected is allowed on purpose. It
 * renders the summary with the gaps visible and Run disabled with its reason,
 * which tells the analyst what is missing; a redirect back to step one would
 * throw away the address they typed and explain nothing.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowCounterclockwise16Regular,
  CheckmarkCircle16Regular,
  Warning16Regular,
} from "@/components/ui/icons";
import RunAction, { RunBlockedReason } from "@/components/topic/RunAction";
import { Button } from "@/components/ui/Button";
import StepShell from "@/components/topic/StepShell";
import { useWizard } from "@/components/topic/useWizard";
import { resetSelection } from "@/services/analysis/selection-store";
import { stepHref, terminalHref } from "@/services/analysis/steps";
import { REQUEST_PARAM, requestId } from "@/services/analysis/request-id";
import { isOverlayTopic } from "@/services/criteria";
import { writeAreas } from "@/services/handoff/areas";
import { formatArea } from "@/services/geo/area";
import type { AnalysisRequest } from "@/services/analysis/request";
import { SOURCE_LABEL } from "@/components/topic/SelectedAreas";
import type { Topic, TopicSlug } from "@/services/analysis/topics";
import type { UrlSelection } from "@/services/analysis/url-state";

/**
 * Hand the request over to whichever route can actually do something with it.
 *
 * The split is deliberate and is the one services/handoff exists to express: the
 * configuration goes in the URL, where it is shareable, and the areas go to
 * sessionStorage, because one drawn polygon is kilobytes of coordinates.
 *
 * The id ties the two halves together. Edit the query string and the id no
 * longer matches what the areas were stored under, so `readAreas` reports a
 * mismatch instead of pairing a previous selection with a new configuration.
 * That pairing would render confidently and be wrong, which is worse than
 * rendering nothing.
 *
 * `writeAreas` returns false rather than throwing when storage is full or
 * blocked. We navigate anyway: both destinations already have a designed path
 * for absent areas, and that is strictly better than an exception thrown on
 * the way out of a form the analyst has just filled in.
 *
 * WHERE it navigates depends on whether the topic has a method behind it, and
 * that question is answered here, locally, from the same criteria registry the
 * backend's artifact is generated from:
 *
 *   overlay topic   /running, which creates the run and watches it. Today that
 *                   is flood risk and only flood risk.
 *   model topic     /results, which shows the validated request and says
 *                   plainly that nothing has been computed. Unchanged.
 *
 * Asking the service instead would be more authoritative and would cost a round
 * trip inside a click handler, with a spinner on the Run button while it
 * resolved. The registry and the service cannot disagree (export-sync.test.ts
 * fails when contracts/criteria.json drifts from this registry), and the
 * running screen re-checks with the service anyway: a topic the service says it
 * cannot run falls back to the receipt with the service's own sentence.
 */
function handOff(
  request: AnalysisRequest,
  topic: Topic,
  query: string,
  router: ReturnType<typeof useRouter>,
) {
  const id = requestId(request);
  writeAreas(id, request.areas);

  // The wizard's own query (type, model) is threaded through so the next page
  // renders the same configuration the review page was showing, and so a
  // shared link carries it.
  const separator = query === "" ? "?" : "&";
  const search = `${query}${separator}${REQUEST_PARAM}=${id}`;

  router.push(
    isOverlayTopic(topic.slug)
      ? terminalHref(topic.slug, "running", search)
      : terminalHref(topic.slug, "results", search),
  );
}

export interface ReviewStepProps {
  topic: Topic;
  initial: UrlSelection;
}

/**
 * One summary row: what was decided, and a link back to where to change it.
 *
 * Module scope, not defined inside ReviewStep. A component declared during
 * render is a new type on every render, so React unmounts and remounts the
 * whole subtree each time — which here would mean the four rows losing focus
 * mid-tab. eslint's react-hooks/static-components catches it.
 */
function SummaryRow({
  topic,
  query,
  label,
  value,
  detail,
  editStep,
  children,
}: {
  topic: TopicSlug;
  query: string;
  label: string;
  value: string;
  detail: string;
  editStep: "scope" | "model" | "areas";
  /** Extra content under the decision, e.g. the list of areas. */
  children?: ReactNode;
}) {
  /*
   * A three-column row of one grid: the term, the decision, the way back to
   * it. On a phone the term sits above the decision and Change stays on the
   * right, so the row is still one scan wide. `contents` is not used: a dt/dd
   * pair inside a div is valid HTML for a dl, and the div is what draws the
   * hairline between rows.
   */
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-0.5 border-t border-edge px-4 py-3.5 first:border-t-0 sm:grid-cols-[8rem_minmax(0,1fr)_auto] lg:px-5">
      <dt className="eyebrow col-start-1 sm:pt-0.5">{label}</dt>
      <dd className="col-start-1 min-w-0 sm:col-start-2 sm:row-start-1">
        <span className="type-body1 block font-semibold text-ink">{value}</span>
        <span className="type-caption1 mt-0.5 block text-ink-muted">{detail}</span>
        {children}
      </dd>
      <Link
        href={stepHref(topic, editStep, query)}
        className="type-body1 col-start-2 row-span-2 row-start-1 self-center rounded-fluent-small font-semibold text-accent-link hover:underline sm:col-start-3 sm:row-span-1"
      >
        Change
        <span className="sr-only"> {label.toLowerCase()}</span>
      </Link>
    </div>
  );
}

export default function ReviewStep({ topic, initial }: ReviewStepProps) {
  const wizard = useWizard(topic.slug, initial);
  const { state, spec, model, validation, query } = wizard;
  const router = useRouter();

  const run = () => {
    if (!validation.ok) return;
    handOff(validation.request, topic, query, router);
  };

  /** Bound once, so the four rows below read as a table rather than as plumbing. */
  const row = (
    label: string,
    value: string,
    detail: string,
    editStep: "scope" | "model" | "areas",
    children?: ReactNode,
  ) => (
    <SummaryRow
      topic={topic.slug}
      query={query}
      label={label}
      value={value}
      detail={detail}
      editStep={editStep}
    >
      {children}
    </SummaryRow>
  );

  return (
    <StepShell
      topic={topic}
      step="review"
      // The band width, like every other step: at the 980px reading width the
      // summary stopped short of the rail and the footer above and below it.
      width="band"
      wizard={wizard}
      action={<RunAction validation={validation} onRun={run} />}
      actionNote={
        <RunBlockedReason
          validation={validation}
          areaCount={state.areas.length}
          spec={spec}
        />
      }
    >
      <div className="card overflow-hidden">
        {/*
          The card's header: whether this request can run, in words and an
          icon as well as a colour, and the way to throw it all away.
        */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-edge bg-surface-subtle px-4 py-2 lg:px-5">
          {validation.ok ? (
            <p className="type-body1 inline-flex items-center gap-1.5 font-semibold text-success">
              <CheckmarkCircle16Regular aria-hidden="true" />
              Ready to run
            </p>
          ) : (
            <p className="type-body1 inline-flex items-center gap-1.5 font-semibold text-warn">
              <Warning16Regular aria-hidden="true" />
              Not ready yet
            </p>
          )}

          {/*
            Start over. On the review step because this is where an analyst
            decides the whole request was wrong, and where the alternative is
            walking back to the areas step to press Clear all and then back
            again for the scope and the model.

            `replace`, not `push`: Back must not return to a review of a
            selection that no longer exists.

            This is the one control in the app that clears the selection and
            navigates in the same click, which makes it the one that notices
            when the URL sync in useWizard is writing history entries badly. It
            stayed on the review page, selection cleared, for as long as that
            sync passed `null` as the history state. The fix is in useWizard;
            this button is where it shows up, so if it ever regresses, look
            there first.
          */}
          <Button
            type="button"
            variant="subtle"
            size="sm"
            data-testid="start-over"
            icon={<ArrowCounterclockwise16Regular />}
            onClick={() => {
              resetSelection(topic.slug);
              router.replace(stepHref(topic.slug, "scope"));
            }}
          >
            Start over
            <span className="sr-only"> and clear this topic&apos;s selection</span>
          </Button>
        </div>

        <dl data-testid="review-summary">
          {row("Topic", topic.name, topic.question, "scope")}
          {row("Scope", spec.label, spec.description, "scope")}
          {row("Model", model.label, model.tradeoff, "model")}
          {row(
            "Areas",
            state.areas.length === 1 ? "1 area" : `${state.areas.length} areas`,
            state.areas.length === 0
              ? "Nothing selected yet."
              : `${spec.minAreas} needed, up to ${spec.maxAreas}.`,
            "areas",
            state.areas.length > 0 && (
              <ol
                data-testid="review-areas"
                aria-label="Selected areas for this request"
                className="mt-2.5 divide-y divide-edge overflow-hidden rounded-fluent-medium border border-edge"
              >
                {state.areas.map((area, index) => (
                  <li
                    key={area.id}
                    className="flex min-h-9 items-center gap-3 px-3 py-1.5"
                  >
                    <span
                      aria-hidden="true"
                      className="type-caption1 w-5 shrink-0 font-mono tabular-nums text-ink-faint"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="type-body1 min-w-0 flex-1 truncate font-semibold text-ink">
                      {area.label}
                    </span>
                    <span className="type-caption1 shrink-0 tabular-nums text-ink-faint">
                      {SOURCE_LABEL[area.source]} &middot; {formatArea(area.areaKm2)}
                    </span>
                  </li>
                ))}
              </ol>
            ),
          )}
        </dl>
      </div>
    </StepShell>
  );
}
