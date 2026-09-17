/**
 * The key the selected areas are stored under between pages.
 *
 * There is a chicken and egg in the obvious design. The natural key is the run
 * id, but `runId()` hashes the FULL config, areas included, so a page that has
 * only the query string cannot compute it until it has already read the areas
 * it is trying to look up.
 *
 * So the key is the config's other identity: its canonical query string, with
 * the topic in front because the topic travels in the path rather than the
 * query. `buildRunQuery` emits a fixed key order, so the same configuration
 * always produces the same string and two links to one configuration compare
 * equal.
 *
 * This keeps exactly the property the handoff exists for. Edit any parameter in
 * the address bar and the key changes, so `readAreas` reports a mismatch rather
 * than pairing the previous selection with the new configuration. Getting that
 * wrong would render a confident result for areas the analyst never chose for
 * these settings.
 */

import { buildRunQuery } from "@/services/run";
import type { PartialRunConfig } from "@/services/run";

export function handoffKey(topic: string, config: PartialRunConfig): string {
  return `${topic}?${buildRunQuery(config)}`;
}
