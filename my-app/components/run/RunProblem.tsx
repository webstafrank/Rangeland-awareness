/**
 * The screen for every reason a run did not start.
 *
 * One component rather than six, because the shape of the answer is the same
 * every time (what happened, what to do, where to go) and only the sentences
 * differ. The sentences are supplied by the caller, which is the part that
 * knows: services/run-flow names the planning refusals, services/backend-api
 * names the transport ones, services/handoff names the missing areas.
 *
 * Deliberately not a client component. It holds no state, and the route renders
 * it directly for the cases it can decide on the server.
 */

import Link from "next/link";
import type { Route } from "next";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { stepHref } from "@/services/analysis/steps";
import type { Topic } from "@/services/analysis/topics";

export interface RunProblemProps {
  topic: Topic;
  /** One line, the heading. States the problem, not an apology. */
  title: string;
  /** What happened and what to do about it. */
  message: string;
  /** The wizard query, so every link keeps the analyst's configuration. */
  query: string;
  /**
   * Where the validated request can still be read, when there is one worth
   * offering. Null when there is not: a run refused for a bad configuration has
   * no receipt worth reading, and a link to one would be a dead end dressed as
   * a next step.
   */
  receiptHref: Route | null;
}

export default function RunProblem({
  topic,
  title,
  message,
  query,
  receiptHref,
}: RunProblemProps) {
  return (
    <div className="mx-auto w-full max-w-band px-gutter py-16 lg:px-gutter-lg">
      <div className="mx-auto max-w-xl rounded-2xl border border-edge bg-surface p-8 shadow-card">
        <Eyebrow>No run started</Eyebrow>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
        <p
          data-testid="run-problem"
          className="mt-3 text-sm leading-relaxed text-ink-muted"
        >
          {message}
        </p>

        {/*
          Nothing was submitted, and saying so is the point. An analyst who has
          just watched a run fail to start needs to know whether anything is
          happening on a server somewhere before they press the button again.
        */}
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Nothing was submitted, so nothing is running.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={stepHref(topic.slug, "review", query)}
            className="rounded-lg bg-action px-5 py-2.5 text-sm font-semibold text-white shadow-card transition-colors hover:bg-action-hover"
          >
            Back to review
          </Link>
          <Link
            href={stepHref(topic.slug, "areas", query)}
            className="rounded-lg border border-edge-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            Change the areas
          </Link>
          {receiptHref !== null && (
            <Link
              href={receiptHref}
              className="rounded-lg border border-edge-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              See the request
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
