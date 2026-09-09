import { describe, expect, it } from "vitest";
import {
  HANDOFF_MESSAGE,
  clearAreas,
  readAreas,
  writeAreas,
} from "@/lib/handoff/areas";
import type { RequestArea } from "@/lib/analysis/request";

/**
 * A Storage that behaves like the real one, including the parts that matter:
 * getItem returns null for a missing key rather than undefined, and values are
 * strings. The failure modes get their own subclasses below, because "storage
 * that throws" is the case this module exists to survive and a mock that never
 * throws would test none of it.
 */
class FakeStorage implements Storage {
  protected map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

/** Private browsing with a full quota: reads work, writes throw. */
class WriteThrowsStorage extends FakeStorage {
  override setItem(): void {
    throw new DOMException("QuotaExceededError");
  }
}

/** Site data blocked: even reading throws. */
class ReadThrowsStorage extends FakeStorage {
  override getItem(): string | null {
    throw new DOMException("SecurityError");
  }
}

function area(id: string, label = `Area ${id}`): RequestArea {
  return {
    id,
    label,
    source: "drawn",
    feature: {
      type: "Feature",
      properties: null,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [36.8, -1.3],
            [36.9, -1.3],
            [36.9, -1.2],
            [36.8, -1.2],
            [36.8, -1.3],
          ],
        ],
      },
    },
    bounds: [
      [-1.3, 36.8],
      [-1.2, 36.9],
    ],
    areaKm2: 123.4,
  };
}

describe("writeAreas / readAreas round trip", () => {
  it("returns the areas it stored, for the run that stored them", () => {
    const store = new FakeStorage();
    const areas = [area("aoi-1"), area("aoi-2")];

    expect(writeAreas("run-abc", areas, store)).toBe(true);
    expect(readAreas("run-abc", store)).toEqual({ ok: true, areas });
  });

  it("preserves geometry exactly, because the map flies to it", () => {
    const store = new FakeStorage();
    const original = area("aoi-1");
    writeAreas("run-abc", [original], store);

    const result = readAreas("run-abc", store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.areas[0].feature.geometry).toEqual(original.feature.geometry);
    expect(result.areas[0].bounds).toEqual(original.bounds);
    expect(result.areas[0].areaKm2).toBe(123.4);
  });

  it("does not alias the caller's array", () => {
    // The caller keeps editing its selection after handing it over; that must
    // not rewrite what was stored for this run.
    const store = new FakeStorage();
    const areas = [area("aoi-1")];
    writeAreas("run-abc", areas, store);
    areas.push(area("aoi-2"));

    const result = readAreas("run-abc", store);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.areas).toHaveLength(1);
  });
});

describe("readAreas failure modes", () => {
  it("reports missing when nothing was ever stored", () => {
    expect(readAreas("run-abc", new FakeStorage())).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("reports mismatch when the config in the URL changed", () => {
    // This is the one that matters. Pairing yesterday's areas with today's
    // config would render confidently and be wrong.
    const store = new FakeStorage();
    writeAreas("run-abc", [area("aoi-1")], store);

    expect(readAreas("run-different", store)).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("reports corrupt for a non-JSON payload", () => {
    const store = new FakeStorage();
    store.setItem("ra.run.areas.v1", "{not json");
    expect(readAreas("run-abc", store)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("reports corrupt for JSON of the wrong shape", () => {
    const store = new FakeStorage();
    store.setItem("ra.run.areas.v1", JSON.stringify({ runId: 7, areas: [] }));
    expect(readAreas("run-abc", store)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("reports corrupt for an area missing its geometry", () => {
    // Would reach Leaflet as undefined and throw a long way from here.
    const store = new FakeStorage();
    store.setItem(
      "ra.run.areas.v1",
      JSON.stringify({
        runId: "run-abc",
        areas: [{ id: "a", label: "A", bounds: [[0, 0], [1, 1]], feature: {} }],
      }),
    );
    expect(readAreas("run-abc", store)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("reports corrupt for bounds of the wrong arity", () => {
    const store = new FakeStorage();
    store.setItem(
      "ra.run.areas.v1",
      JSON.stringify({
        runId: "run-abc",
        areas: [
          {
            id: "a",
            label: "A",
            bounds: [[0, 0]],
            feature: { geometry: { type: "Point", coordinates: [0, 0] } },
          },
        ],
      }),
    );
    expect(readAreas("run-abc", store)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("reports corrupt rather than ok for a stored empty selection", () => {
    // Zero areas cannot produce a result, so handing them on would render an
    // answer for nothing at all.
    const store = new FakeStorage();
    store.setItem(
      "ra.run.areas.v1",
      JSON.stringify({ runId: "run-abc", areas: [] }),
    );
    expect(readAreas("run-abc", store)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("checks shape before run id, so a corrupt payload is not called a mismatch", () => {
    const store = new FakeStorage();
    store.setItem("ra.run.areas.v1", JSON.stringify({ runId: 7, areas: "no" }));
    expect(readAreas("run-abc", store)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("reports unavailable when reading throws", () => {
    expect(readAreas("run-abc", new ReadThrowsStorage())).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("writeAreas failure modes", () => {
  it("returns false instead of throwing when the quota is full", () => {
    // The analyst has just filled in a form; an exception on the way out of it
    // is strictly worse than the results page taking its designed "missing"
    // path.
    expect(() =>
      writeAreas("run-abc", [area("aoi-1")], new WriteThrowsStorage()),
    ).not.toThrow();
    expect(writeAreas("run-abc", [area("aoi-1")], new WriteThrowsStorage())).toBe(
      false,
    );
  });
});

describe("clearAreas", () => {
  it("removes a stored handoff", () => {
    const store = new FakeStorage();
    writeAreas("run-abc", [area("aoi-1")], store);
    clearAreas(store);
    expect(readAreas("run-abc", store)).toEqual({ ok: false, reason: "missing" });
  });

  it("is silent when there is nothing to clear", () => {
    expect(() => clearAreas(new FakeStorage())).not.toThrow();
  });
});

describe("HANDOFF_MESSAGE", () => {
  it("has a non-empty message for every failure reason", () => {
    // A new failure mode must be a compile error at the table, not a silent
    // fallthrough to a generic string.
    for (const [reason, message] of Object.entries(HANDOFF_MESSAGE)) {
      expect(message.length, reason).toBeGreaterThan(0);
    }
    expect(Object.keys(HANDOFF_MESSAGE).sort()).toEqual([
      "corrupt",
      "mismatch",
      "missing",
      "unavailable",
    ]);
  });
});
