"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ChevronRight16Regular } from "@/components/ui/icons";
import type { TopicSlug } from "@/services/analysis/topics";
import { runningHref } from "@/services/run-flow/links";
import {
  getRunHistoryServerSnapshot,
  getRunHistorySnapshot,
  runsForTopic,
  subscribeRunHistory,
} from "@/services/run-history";

const STARTED = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

/**
 * The runs of one topic that this browser started, newest first, each
 * linking back to its run (the running route forwards to the results once
 * the run has finished).
 *
 * Read from services/run-history, which StartRun writes when the service
 * accepts a run. There is no backend list of runs, so this says plainly that
 * it is this browser's, and says so again when there are none.
 *
 * The server snapshot is empty, so the server renders the empty line and the
 * browser swaps in its own list after hydration. The skeleton renders this
 * same component (invisibly) to size itself, so the two stay the same height
 * whatever the list holds (evals/reports.spec.ts R10, R11).
 */
export function TopicRuns({ slug, name }: { slug: TopicSlug; name: string }) {
  const history = useSyncExternalStore(
    subscribeRunHistory,
    getRunHistorySnapshot,
    getRunHistoryServerSnapshot,
  );
  const runs = runsForTopic(history, slug);

  return (
    <section
      aria-labelledby={`runs-${slug}`}
      className="border-b border-edge px-4 py-3 lg:px-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id={`runs-${slug}`} className="type-subtitle2 text-ink">
          Runs for {name.toLowerCase()}
        </h3>
        <p className="type-caption1 text-ink-faint">Started in this browser</p>
      </div>
      {runs.length === 0 ? (
        <p className="type-body1 mt-1 text-ink-muted">
          No {name.toLowerCase()} runs started in this browser yet.
        </p>
      ) : (
        <ul className="-mx-2 mt-1.5">
          {runs.map((run) => (
            <li key={run.runId}>
              <Link
                href={runningHref(slug, run.query, { runId: run.runId })}
                className="flex min-h-10 items-center gap-3 rounded-fluent-medium px-2 py-2 transition-colors duration-150 hover:bg-surface-subtle"
              >
                <span className="type-body1 min-w-0 flex-1 text-ink">
                  Run started {STARTED.format(new Date(run.startedAt))}
                </span>
                <span className="type-caption1 shrink-0 font-mono text-ink-faint">
                  {run.runId.slice(0, 8)}
                </span>
                <ChevronRight16Regular aria-hidden="true" className="shrink-0 text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
