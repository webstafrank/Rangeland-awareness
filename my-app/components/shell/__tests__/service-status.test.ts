import { describe, expect, it } from "vitest";
import {
  CHECKING,
  readHealth,
  timingNote,
  tooltipFor,
} from "@/components/shell/service-status";

describe("readHealth", () => {
  it("is online only when the route says ok and the backend is reachable", () => {
    expect(readHealth({ status: "ok", backend: { reachable: true } }).state).toBe("online");
  });

  it("is degraded when the backend answers but something upstream does not", () => {
    const reading = readHealth({ status: "degraded", backend: { reachable: true } });
    expect(reading.state).toBe("degraded");
    expect(reading.label).toBe("Service degraded");
  });

  it("is offline when the backend does not answer, and says why", () => {
    const reading = readHealth({
      status: "degraded",
      backend: { reachable: false, detail: "The analysis service did not answer in time." },
    });
    expect(reading.state).toBe("offline");
    expect(reading.detail).toContain("did not answer in time");
  });

  it("carries the probe's own timing when the route reports it, and only a sane one", () => {
    expect(readHealth({ status: "ok", elapsedMs: 41.6, backend: { reachable: true } }).responseMs).toBe(42);
    expect(readHealth({ status: "ok", elapsedMs: -3, backend: { reachable: true } }).responseMs).toBeUndefined();
    expect(readHealth({ status: "ok", elapsedMs: "fast", backend: { reachable: true } }).responseMs).toBeUndefined();
  });

  it("never reads a malformed body as online", () => {
    for (const body of [null, undefined, {}, "ok", { status: "ok" }, { backend: { reachable: "yes" } }]) {
      expect(readHealth(body).state, JSON.stringify(body)).not.toBe("online");
    }
  });
});

describe("the tooltip's timing", () => {
  const at = () => "14:42";
  const online = readHealth({ status: "ok", elapsedMs: 41.6, backend: { reachable: true } });

  it("says how fast the service answered and when it was checked", () => {
    expect(timingNote({ ...online, checkedAt: 0 }, at)).toBe("Responded in 42 ms, checked at 14:42.");
    expect(tooltipFor({ ...online, checkedAt: 0 }, at)).toBe(
      `${online.detail} Responded in 42 ms, checked at 14:42.`,
    );
  });

  it("says only what it knows", () => {
    expect(timingNote(online, at)).toBe("Responded in 42 ms.");
    expect(timingNote({ ...CHECKING, checkedAt: 0 }, at)).toBe("Checked at 14:42.");
  });

  it("adds nothing while checking", () => {
    expect(timingNote(CHECKING, at)).toBe("");
    expect(tooltipFor(CHECKING, at)).toBe(CHECKING.detail);
  });
});
