import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HISTORY_STORAGE_KEY,
  getRunHistoryServerSnapshot,
  getRunHistorySnapshot,
  recordRun,
  resetRunHistoryForTests,
  subscribeRunHistory,
} from "@/services/run-history";

const entry = {
  runId: "r_1",
  topic: "flood-risk" as const,
  startedAt: "2026-10-09T08:00:00+03:00",
  query: "?type=single",
};

beforeEach(() => {
  localStorage.clear();
  resetRunHistoryForTests();
});
afterEach(() => vi.restoreAllMocks());

describe("run history store", () => {
  it("is empty on the server", () => {
    expect(getRunHistoryServerSnapshot()).toEqual([]);
  });

  it("records a run, persists it and tells subscribers", () => {
    const heard = vi.fn();
    subscribeRunHistory(heard);
    recordRun(entry);
    expect(getRunHistorySnapshot()).toEqual([entry]);
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toContain("r_1");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("reads what an earlier page load stored", () => {
    recordRun(entry);
    resetRunHistoryForTests();
    expect(getRunHistorySnapshot()).toEqual([entry]);
  });

  it("returns the same snapshot until something changes", () => {
    recordRun(entry);
    expect(getRunHistorySnapshot()).toBe(getRunHistorySnapshot());
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getRunHistorySnapshot()).toEqual([]);
    expect(() => recordRun(entry)).not.toThrow();
    expect(getRunHistorySnapshot()).toEqual([entry]);
  });
});
