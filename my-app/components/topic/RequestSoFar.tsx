"use client";

/**
 * The request so far, as a side rail on the scope and model steps.
 *
 * Those two steps are one question and a few cards. In a 980px reading column
 * they left the right third of the band empty while the rail and the header
 * ran its full width. This fills that space with the thing an analyst checks
 * while deciding: what the request already says, and what this topic returns.
 *
 * Real state only: every row is read from the same wizard the footer receipt
 * reads, so the two can never disagree. Nothing here is a control except the
 * one link to the areas step.
 */

import Link from "next/link";
import { CountBadge } from "@/components/ui/CountBadge";
import { stepHref } from "@/services/analysis/steps";
import type { Topic } from "@/services/analysis/topics";
import type { Wizard } from "@/components/topic/useWizard";

export interface RequestSoFarProps {
  topic: Topic;
  wizard: Wizard;
}

/*
 * The same rows on every step that shows it, in the same order: the four
 * decisions, then what the topic returns and reads. A rail that changed its
 * contents from step to step read as a different panel each time.
 */
export default function RequestSoFar({ topic, wizard }: RequestSoFarProps) {
  const { spec, model, state, query } = wizard;
  const count = state.areas.length;

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-4 border-t border-edge py-2.5 first:border-t-0 first:pt-0">
      <dt className="eyebrow shrink-0">{label}</dt>
      <dd className="type-body1 min-w-0 text-right font-semibold text-ink">
        {value}
      </dd>
    </div>
  );

  return (
    <div className="card p-4">
      <p className="type-subtitle2 text-ink">This request</p>
      <dl className="mt-3">
        {row("Topic", topic.name)}
        {row("Scope", spec.label)}
        {row("Model", model.label)}
        {row(
          "Areas",
          <span className="inline-flex items-center gap-2">
            <CountBadge count={count} />
            <Link
              href={stepHref(topic.slug, "areas", query)}
              className="type-caption1 rounded-fluent-small font-semibold text-accent-link hover:underline"
            >
              {count === 0 ? "Choose areas" : "Edit areas"}
            </Link>
          </span>,
        )}
      </dl>

      {/* What this topic actually returns. On the first step it is the last
          chance to notice the wrong topic before spending four screens on
          it; on the others it is what the decisions above are for. */}
      <dl className="mt-4 space-y-3 border-t border-edge pt-4">
        <div>
          <dt className="eyebrow">What comes back</dt>
          <dd className="type-caption1 mt-1 text-ink-muted">{topic.output}</dd>
        </div>
        <div>
          <dt className="eyebrow">Model inputs</dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">
            {topic.inputs.map((input) => (
              <span
                key={input}
                className="type-caption1 rounded-fluent-medium border border-edge bg-surface-subtle px-2 py-0.5 text-ink-muted"
              >
                {input}
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}
