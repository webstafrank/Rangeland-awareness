"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronRight16Regular, Clock20Regular } from "@/components/ui/icons";
import TopicIcon from "@/components/topic/TopicIcon";
import { StateBlock } from "@/components/ui/StateBlock";
import { buttonClasses } from "@/components/ui/button-classes";
import { getTopic } from "@/services/analysis/topics";
import { runningHref } from "@/services/run-flow/links";
import {
  getRunHistoryServerSnapshot,
  getRunHistorySnapshot,
  subscribeRunHistory,
} from "@/services/run-history";

/**
 * The runs this browser started, newest first, at most five.
 *
 * There is no run list on the service, so this is the local history that
 * StartRun records when the service accepts a run, and the card says so
 * ("Started in this browser") rather than implying a team-wide feed. Each
 * row opens the running screen for that run, which forwards to the results
 * once the run has finished.
 *
 * Three states:
 * - before hydration: skeleton rows. The server snapshot is empty, and
 *   showing "no runs" for a frame to someone who has runs would be a lie.
 * - no runs: the empty state, with a way to start one.
 * - runs: one row each, topic and how long ago it started.
 */

const SHOWN = 5;
const TICK_MS = 30_000;

const noop = () => () => {};

/** True on the client after hydration, false on the server and during it. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** The clock, rounded to 30s so the snapshot is stable between ticks. */
function subscribeClock(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, TICK_MS);
  return () => window.clearInterval(timer);
}
const readClock = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
const serverClock = () => 0;

const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
const ABSOLUTE = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** "just now", "12 minutes ago", "yesterday", "3 days ago". */
export function startedAgo(startedAt: string, now: number): string {
  const abs = Math.abs(Math.round((Date.parse(startedAt) - now) / 1000));
  // Rounded on the magnitude, then made past: Math.round(-1.5) is -1, so
  // rounding the signed value read a run from 90 minutes ago as "1 hour ago".
  const ago = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    RELATIVE.format(-Math.round(value), unit);
  if (abs < 60) return "just now";
  if (abs < 3600) return ago(abs / 60, "minute");
  if (abs < 86_400) return ago(abs / 3600, "hour");
  return ago(abs / 86_400, "day");
}

export function RecentRuns() {
  const hydrated = useHydrated();
  const runs = useSyncExternalStore(
    subscribeRunHistory,
    getRunHistorySnapshot,
    getRunHistoryServerSnapshot,
  );
  const now = useSyncExternalStore(subscribeClock, readClock, serverClock);
  const shown = runs.slice(0, SHOWN);

  return (
    <section
      aria-labelledby="recent-runs-title"
      data-testid="recent-runs"
      className="card flex flex-col p-4 lg:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id="recent-runs-title" className="type-subtitle2 text-ink">
          Recent runs
        </h3>
        <p className="type-caption1 text-ink-faint">Started in this browser</p>
      </div>

      {!hydrated ? (
        <ul aria-hidden="true" className="mt-3 divide-y divide-edge">
          {[0, 1, 2].map((row) => (
            <li key={row} className="flex items-center gap-3 py-2.5">
              <span className="skeleton block h-8 w-8 rounded-fluent-medium" />
              <span className="skeleton block h-3 w-40 rounded-fluent-medium" />
            </li>
          ))}
        </ul>
      ) : shown.length === 0 ? (
        <StateBlock
          inset
          headingLevel={3}
          icon={<Clock20Regular />}
          title="No runs started in this browser yet"
          actions={
            <Link href="/#topics" className={buttonClasses()}>
              Choose a topic
            </Link>
          }
          className="flex-1 justify-center py-6"
        >
          Each run the analysis service accepts is listed here, newest first.
        </StateBlock>
      ) : (
        <ul className="mt-2 divide-y divide-edge">
          {shown.map((run) => {
            const topic = getTopic(run.topic);
            const name = topic?.name ?? run.topic;
            return (
              <li key={run.runId}>
                <Link
                  href={runningHref(run.topic, run.query, { runId: run.runId })}
                  className="group -mx-2 flex min-h-12 items-center gap-3 rounded-fluent-medium px-2 py-1.5 transition-colors duration-150 hover:bg-surface-subtle"
                >
                  <TopicIcon slug={run.topic} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="type-body1 block font-semibold text-ink">{name}</span>
                    <time
                      dateTime={run.startedAt}
                      title={ABSOLUTE.format(new Date(run.startedAt))}
                      className="type-caption1 block text-ink-muted"
                    >
                      Started {startedAgo(run.startedAt, now)}
                    </time>
                  </span>
                  <span className="type-caption1 font-semibold text-accent-link group-hover:underline">
                    Open
                  </span>
                  <ChevronRight16Regular aria-hidden="true" className="shrink-0 text-ink-faint group-hover:text-accent" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
