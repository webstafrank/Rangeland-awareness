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
import { ArrowLeft20Regular, ErrorCircle20Regular } from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/button-classes";
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
    <div className="mx-auto w-full max-w-band px-gutter py-10 lg:px-gutter-lg lg:py-16">
      <div className="card mx-auto max-w-xl p-6 lg:p-8">
        <div className="flex items-center gap-2">
          <ErrorCircle20Regular aria-hidden="true" className="text-danger" />
          <p className="type-caption1 font-semibold text-danger">No run started</p>
        </div>
        <h1 className="type-title3 mt-3 text-ink">{title}</h1>
        <p data-testid="run-problem" className="type-body1 mt-2 break-words text-ink-muted">
          {message}
        </p>

        {/*
          Nothing was submitted, and saying so is the point. An analyst who has
          just watched a run fail to start needs to know whether anything is
          happening on a server somewhere before they press the button again.
        */}
        <p className="type-body1 mt-2 font-semibold text-ink">
          Nothing was submitted, so nothing is running.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={stepHref(topic.slug, "review", query)}
            className={buttonClasses({ appearance: "primary" })}
          >
            <ArrowLeft20Regular aria-hidden="true" />
            Back to review
          </Link>
          <Link href={stepHref(topic.slug, "areas", query)} className={buttonClasses()}>
            Change the areas
          </Link>
          {receiptHref !== null && (
            <Link href={receiptHref} className={buttonClasses({ appearance: "subtle" })}>
              See the request
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
