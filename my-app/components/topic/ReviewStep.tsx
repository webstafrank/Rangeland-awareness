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
import { useRef, useState } from "react";
import RequestResult from "@/components/topic/RequestResult";
import RunAction from "@/components/topic/RunAction";
import StepShell from "@/components/topic/StepShell";
import { useWizard } from "@/components/topic/useWizard";
import { resetSelection } from "@/lib/analysis/selection-store";
import { stepHref } from "@/lib/analysis/steps";
import { formatArea } from "@/lib/geo/area";
import type { AnalysisRequest } from "@/lib/analysis/request";
import type { Topic, TopicSlug } from "@/lib/analysis/topics";
import type { UrlSelection } from "@/lib/analysis/url-state";

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
  const resultRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Keyed by the selection that produced it, so a payload on screen can never
  // disagree with the choices above it: change anything and it clears.
  const [submitted, setSubmitted] = useState<{
    key: string;
    request: AnalysisRequest;
  } | null>(null);

  const resetKey = [
    state.analysisType,
    state.modelId,
    state.areas.map((a) => a.id).join(","),
  ].join("|");

  const shownRequest =
    submitted !== null && submitted.key === resetKey ? submitted.request : null;

  const run = () => {
    if (!validation.ok) return;
    setSubmitted({ key: resetKey, request: validation.request });
    // Defer to the next frame so the section exists before scrolling to it.
    requestAnimationFrame(() =>
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
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

      <div ref={resultRef} className="mt-8 scroll-mt-6">
        <RequestResult request={shownRequest} />
      </div>
    </StepShell>
  );
}
