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
import RunAction from "@/components/topic/RunAction";
import StepShell from "@/components/topic/StepShell";
import { useWizard } from "@/components/topic/useWizard";
import { resetSelection } from "@/services/analysis/selection-store";
import { stepHref, terminalHref } from "@/services/analysis/steps";
import { RUN_PARAM, requestId } from "@/services/analysis/request-id";
import { writeAreas } from "@/services/handoff/areas";
import { formatArea } from "@/services/geo/area";
import type { AnalysisRequest } from "@/services/analysis/request";
import type { Topic, TopicSlug } from "@/services/analysis/topics";
import type { UrlSelection } from "@/services/analysis/url-state";

/**
 * Hand the request over to the results route.
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
 * blocked. We navigate anyway: the results route already has a designed path
 * for absent areas, and that is strictly better than an exception thrown on
 * the way out of a form the analyst has just filled in.
 */
function handOff(
  request: AnalysisRequest,
  topic: Topic,
  query: string,
  router: ReturnType<typeof useRouter>,
) {
  const id = requestId(request);
  writeAreas(id, request.areas);

  // The wizard's own query (type, model) is threaded through so the results
  // page renders the same configuration the review page was showing, and so a
  // shared link carries it.
  const separator = query === "" ? "?" : "&";
  router.push(terminalHref(topic.slug, "results", `${query}${separator}${RUN_PARAM}=${id}`));
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
}: {
  topic: TopicSlug;
  query: string;
  label: string;
  value: string;
  detail: string;
  editStep: "scope" | "model" | "areas";
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-edge py-4 first:border-t-0 first:pt-0">
      <dt className="w-28 shrink-0 eyebrow">{label}</dt>
      <dd className="min-w-0 flex-1">
        <span className="text-[15px] font-semibold tracking-tight">{value}</span>
        <span className="ml-2 text-sm text-ink-muted">{detail}</span>
      </dd>
      <Link
        href={stepHref(topic, editStep, query)}
        className="rounded text-xs font-semibold text-accent hover:underline"
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
  ) => (
    <SummaryRow
      topic={topic.slug}
      query={query}
      label={label}
      value={value}
      detail={detail}
      editStep={editStep}
    />
  );

  return (
    <StepShell
      topic={topic}
      step="review"
      wizard={wizard}
      action={<RunAction validation={validation} onRun={run} />}
    >
      <dl
        data-testid="review-summary"
        className="rounded-2xl border border-edge bg-surface p-6 shadow-card lg:p-7"
      >
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
        )}
      </dl>

      {/*
        Start over. On the review step because this is where an analyst decides
        the whole request was wrong, and where the alternative is walking back
        to the areas step to press Clear all and then back again for the scope
        and the model.

        `replace`, not `push`: Back must not return to a review of a selection
        that no longer exists.

        This is the one control in the app that clears the selection and
        navigates in the same click, which makes it the one that notices when
        the URL sync in useWizard is writing history entries badly. It stayed
        on the review page, selection cleared, for as long as that sync passed
        `null` as the history state. The fix is in useWizard; this button is
        where it shows up, so if it ever regresses, look there first.
      */}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          data-testid="start-over"
          onClick={() => {
            resetSelection(topic.slug);
            router.replace(stepHref(topic.slug, "scope"));
          }}
          className="rounded text-xs font-semibold text-ink-faint underline hover:text-danger"
        >
          Start over
          <span className="sr-only"> and clear this topic&apos;s selection</span>
        </button>
      </div>

      {state.areas.length > 0 && (
        <ol
          data-testid="review-areas"
          className="mt-5 divide-y divide-edge overflow-hidden rounded-2xl border border-edge bg-surface shadow-card"
        >
          {state.areas.map((area, index) => (
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
      )}
    </StepShell>
  );
}
