# run-history

The runs this browser has started, newest first, for the Overview's "Recent
runs" and the Reports page's per-topic list.

## Why it is local

The analysis service has no endpoint that lists runs: `contracts/backend-api.md`
version 1 has create, status and result. So the only honest list of recent runs
is the one the app keeps itself. Every entry is written once, by
`components/run/StartRun.tsx`, at the moment the service accepts a run, from
the service's own run id. The UI labels the list "Started in this browser" and
never implies it is everyone's runs.

The status of a run is never stored. A link opens the running route, which asks
the service and forwards to the result when the run has finished, so the list
cannot go stale about whether a run succeeded.

## Files

| File | What it owns |
| --- | --- |
| `history.ts` | Pure: the entry schema, `addRun` (newest first, de-duplicated, capped at 8), `parseHistory` (validates each row on its own, so one bad row cannot hide the rest), `runsForTopic`. |
| `store.ts` | localStorage under `dm.runs`, plus a subscription in the `useSyncExternalStore` shape (server snapshot empty, cross-tab updates through the `storage` event). Storage that throws is treated as empty. |

## Tests

- `__tests__/history.test.ts` (node lane): ordering, de-duplication, the cap,
  parsing garbage, other versions and bad rows.
- `__tests__/store.dom.test.ts` (dom lane): persistence across a reload,
  stable snapshots, subscribers, throwing storage.
- `evals/shell.spec.ts` S6: a run started through the UI against the stub
  service shows up on the Overview with a link back to it.
