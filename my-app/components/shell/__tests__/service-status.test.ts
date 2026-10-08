import { describe, expect, it } from "vitest";
import { readHealth } from "@/components/shell/service-status";

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

  it("never reads a malformed body as online", () => {
    for (const body of [null, undefined, {}, "ok", { status: "ok" }, { backend: { reachable: "yes" } }]) {
      expect(readHealth(body).state, JSON.stringify(body)).not.toBe("online");
    }
  });
});
