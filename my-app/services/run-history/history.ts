/**
 * The runs this browser has started, newest first. Pure: no storage here.
 *
 * There is no endpoint that lists runs (contracts/backend-api.md has create,
 * status and result only), so the only honest "recent runs" the app can show
 * is the ones it started itself. Each entry is recorded at the moment the
 * service accepts a run, from the service's own run id; nothing is invented.
 * Its status is never stored: the running and results routes ask the
 * service, so a list entry cannot go stale about whether a run finished.
 */

import { z } from "zod";
import { TOPIC_SLUGS, type TopicSlug } from "@/services/analysis/topics";

export const HISTORY_VERSION = 1;
export const HISTORY_LIMIT = 8;

export const RunHistoryEntrySchema = z.object({
  runId: z.string().min(1).max(64),
  topic: z.enum(TOPIC_SLUGS),
  /** ISO timestamp, when the service accepted the run. */
  startedAt: z.iso.datetime({ offset: true }),
  /** The query string the run was started with, so its links reopen it. */
  query: z.string().max(4000),
});

export type RunHistoryEntry = z.infer<typeof RunHistoryEntrySchema>;

const StoredSchema = z.object({
  version: z.literal(HISTORY_VERSION),
  runs: z.array(z.unknown()),
});

/** Adds a run at the front, dropping an older copy of the same id and the overflow. */
export function addRun(
  runs: readonly RunHistoryEntry[],
  entry: RunHistoryEntry,
  limit = HISTORY_LIMIT,
): RunHistoryEntry[] {
  return [entry, ...runs.filter((run) => run.runId !== entry.runId)].slice(0, limit);
}

export function serialiseHistory(runs: readonly RunHistoryEntry[]): string {
  return JSON.stringify({ version: HISTORY_VERSION, runs });
}

/**
 * Reads what storage held. Anything unreadable is an empty history rather
 * than an error, and each entry is validated on its own, so one bad row
 * (hand-edited, or from a later version) cannot hide the good ones.
 */
export function parseHistory(raw: string | null): RunHistoryEntry[] {
  if (!raw) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  const stored = StoredSchema.safeParse(json);
  if (!stored.success) return [];
  return stored.data.runs
    .map((run) => RunHistoryEntrySchema.safeParse(run))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)
    .slice(0, HISTORY_LIMIT);
}

/** The runs for one topic, for the Reports page. */
export function runsForTopic(
  runs: readonly RunHistoryEntry[],
  topic: TopicSlug,
): RunHistoryEntry[] {
  return runs.filter((run) => run.topic === topic);
}
