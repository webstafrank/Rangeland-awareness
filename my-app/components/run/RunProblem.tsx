/**
 * The screen for every reason there is no run to watch or read.
 *
 * One component rather than six, because the shape of the answer is the same
 * every time (what happened, what to do, where to go) and only the sentences
 * differ. The sentences are supplied by the caller, which is the part that
 * knows: services/run-flow names the planning refusals, services/backend-api
 * names the transport ones, services/handoff names the missing areas.
 *
 * `kind` decides the one sentence the caller does not write: what is true on
 * the service right now. Those are three different answers and they must not
 * share wording:
 *
 *   not-started   nothing was submitted, so nothing is running.
 *   unreachable   a run id exists, the service did not answer. The run may
 *                 well still be going; this page could not ask. Saying
 *                 "nothing is running" here would be false, and would send
 *                 the analyst off to start a second run.
 *   not-found     the service answered and has no run under this id.
 *
 * Deliberately not a client component. It holds no state, and the route renders
 * it directly for the cases it can decide on the server.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { Route } from "next";
import {
  ArrowClockwise20Regular,
  ArrowLeft20Regular,
  ErrorCircle20Regular,
  PlugDisconnected20Regular,
  QuestionCircle20Regular,
} from "@/components/ui/icons";
import { buttonClasses } from "@/components/ui/button-classes";
import { StateBlock } from "@/components/ui/StateBlock";
import { FRAME } from "@/components/shell/Page";
import { stepHref } from "@/services/analysis/steps";
import type { Topic } from "@/services/analysis/topics";

export type RunProblemKind = "not-started" | "unreachable" | "not-found";

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
  /** What is true on the service. Defaults to "not-started". */
  kind?: RunProblemKind;
  /**
   * The same page again, for `unreachable`: asking the service a second time
   * is the one useful thing to do when it did not answer the first.
   */
  retryHref?: Route;
}

const LOOK: Record<
  RunProblemKind,
  { tone: "danger" | "warn" | "neutral"; icon: ReactNode; status: string; state: string }
> = {
  "not-started": {
    tone: "danger",
    icon: <ErrorCircle20Regular />,
    status: "No run started",
    // Nothing was submitted, and saying so is the point. An analyst who has
    // just watched a run fail to start needs to know whether anything is
    // happening on a server somewhere before they press the button again.
    state: "Nothing was submitted, so nothing is running.",
  },
  unreachable: {
    tone: "warn",
    icon: <PlugDisconnected20Regular />,
    status: "Run status unknown",
    state:
      "This is the connection, not the run: the run has not failed. Its result is kept under its run id until the service answers again.",
  },
  "not-found": {
    tone: "neutral",
    icon: <QuestionCircle20Regular />,
    status: "Run not found",
    state: "The service answered and has no run under this id, so nothing is running for it.",
  },
};

export default function RunProblem({
  topic,
  title,
  message,
  query,
  receiptHref,
  kind = "not-started",
  retryHref,
}: RunProblemProps) {
  const look = LOOK[kind];
  const retry = kind === "unreachable" && retryHref !== undefined;

  return (
    <div className={`${FRAME} py-8 lg:py-10`}>
      <StateBlock
        tone={look.tone}
        icon={look.icon}
        title={title}
        className="mx-auto max-w-2xl"
        actions={
          <>
            {retry ? (
              <Link href={retryHref} className={buttonClasses({ appearance: "primary" })}>
                <ArrowClockwise20Regular aria-hidden="true" />
                Try again
              </Link>
            ) : null}
            <Link
              href={stepHref(topic.slug, "review", query)}
              className={buttonClasses({ appearance: retry ? "secondary" : "primary" })}
            >
              <ArrowLeft20Regular aria-hidden="true" />
              Back to review
            </Link>
            {kind === "unreachable" ? null : (
              <Link href={stepHref(topic.slug, "areas", query)} className={buttonClasses()}>
                Change the areas
              </Link>
            )}
            {receiptHref !== null && (
              <Link href={receiptHref} className={buttonClasses({ appearance: "subtle" })}>
                See the request
              </Link>
            )}
          </>
        }
      >
        <p
          className="type-caption1 font-semibold text-ink-faint"
          data-run-problem-kind={kind}
        >
          {look.status}
        </p>
        <p data-testid="run-problem" className="mt-1 break-words">
          {message}
        </p>
        <p className="mt-2 font-semibold text-ink">{look.state}</p>
      </StateBlock>
    </div>
  );
}
