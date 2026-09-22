/**
 * The URLs the run flow navigates between.
 *
 * A plain module with no "use client", and that is the whole reason it exists
 * as a file. These helpers were first written inside StartRun.tsx, which is a
 * client component, and the running route imported `resultHref` from there. It
 * typechecked, it built, and every request to /running?run=... answered 500:
 *
 *   Attempted to call resultHref() from the server but resultHref is on the
 *   client.
 *
 * Caught by rendering the page against a real finished run, not by any test:
 * the boundary between server and client is not in the type system, so nothing
 * before a real request could see it. A pure module both sides may import is
 * the fix, and keeping the run flow's URLs in one place is worth a file anyway.
 */

import type { Route } from "next";
import { REQUEST_PARAM, RUN_PARAM } from "@/services/analysis/request-id";
import { terminalHref } from "@/services/analysis/steps";
import type { TopicSlug } from "@/services/analysis/topics";

/** Append to a wizard query that may be empty or may already have params. */
function join(query: string, extra: string): string {
  return `${query}${query === "" ? "?" : "&"}${extra}`;
}

/** Where a finished run is read. Carries the service's id, never the request id. */
export function resultHref(topic: TopicSlug, query: string, runId: string): Route {
  return terminalHref(topic, "results", join(query, `${RUN_PARAM}=${runId}`));
}

/** Where a run is watched, once the service has given it an id. */
export function runningHref(
  topic: TopicSlug,
  query: string,
  ids: { request?: string; runId?: string },
): Route {
  const parts: string[] = [];
  if (ids.request) parts.push(`${REQUEST_PARAM}=${ids.request}`);
  if (ids.runId) parts.push(`${RUN_PARAM}=${ids.runId}`);
  return terminalHref(topic, "running", join(query, parts.join("&")));
}

/** The request receipt: the validated payload, for a topic with no method yet. */
export function receiptHref(topic: TopicSlug, query: string, request: string): Route {
  return terminalHref(topic, "results", join(query, `${REQUEST_PARAM}=${request}`));
}
