import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  addRun,
  parseHistory,
  runsForTopic,
  serialiseHistory,
  type RunHistoryEntry,
} from "@/services/run-history/history";

const run = (runId: string, topic: RunHistoryEntry["topic"] = "flood-risk"): RunHistoryEntry => ({
  runId,
  topic,
  startedAt: "2026-10-09T08:00:00+03:00",
  query: "?type=single&model=xgboost",
});

describe("addRun", () => {
  it("puts the newest run first", () => {
    expect(addRun([run("a")], run("b")).map((r) => r.runId)).toEqual(["b", "a"]);
  });

  it("moves a repeated id to the front instead of listing it twice", () => {
    expect(addRun([run("a"), run("b")], run("b")).map((r) => r.runId)).toEqual(["b", "a"]);
  });

  it("keeps at most the limit", () => {
    let runs: RunHistoryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 3; i += 1) runs = addRun(runs, run(`r${i}`));
    expect(runs).toHaveLength(HISTORY_LIMIT);
    expect(runs[0].runId).toBe(`r${HISTORY_LIMIT + 2}`);
  });
});

describe("parseHistory", () => {
  it("round-trips what serialiseHistory wrote", () => {
    const runs = [run("a"), run("b", "food-security")];
    expect(parseHistory(serialiseHistory(runs))).toEqual(runs);
  });

  it("reads nothing, garbage and another version as an empty history", () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory("not json")).toEqual([]);
    expect(parseHistory(JSON.stringify({ version: 99, runs: [run("a")] }))).toEqual([]);
  });

  it("drops a bad row without hiding the good ones", () => {
    const raw = JSON.stringify({
      version: 1,
      runs: [run("a"), { runId: "b", topic: "not-a-topic" }, run("c")],
    });
    expect(parseHistory(raw).map((r) => r.runId)).toEqual(["a", "c"]);
  });
});

describe("runsForTopic", () => {
  it("keeps one topic's runs in order", () => {
    const runs = [run("a"), run("b", "drought-monitoring"), run("c")];
    expect(runsForTopic(runs, "flood-risk").map((r) => r.runId)).toEqual(["a", "c"]);
  });
});
