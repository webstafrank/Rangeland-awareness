import type { Feature } from "geojson";
import { describe, expect, it, vi } from "vitest";
import type { AreaOfInterest, DraftArea } from "@/lib/analysis/selection";

/**
 * The stateful half of the selection store.
 *
 * Its pure half (serialise, parse, applyUrlSelection) is graded in the node
 * lane beside every other pure module. This file exists because the half that
 * is NOT pure — the module singleton, `sessionStorage`, the subscriber set —
 * is where both of the store's first two bugs lived, and neither was reachable
 * from a pure test:
 *
 *  1. One storage key for the whole app, so opening a second topic destroyed
 *     the first topic's areas with nothing reporting the loss.
 *  2. `nextId` restored as `areas.length + 1`, which collides with an existing
 *     id the moment an area has been removed, so one Remove click deleted two
 *     rows.
 *
 * Both are regression-tested below, by name.
 *
 * Every test re-imports the module after `vi.resetModules()`, because the
 * store is a singleton on purpose (there is one analyst, in one tab, filling
 * in one request) and a test that inherited the previous test's state would
 * prove nothing.
 */

type Store = typeof import("@/lib/analysis/selection-store");

async function freshStore(): Promise<Store> {
  vi.resetModules();
  sessionStorage.clear();
  return import("@/lib/analysis/selection-store");
}

const feature = (lng: number, lat: number): Feature => ({
  type: "Feature",
  properties: null,
  geometry: { type: "Point", coordinates: [lng, lat] },
});

const draft = (label: string): DraftArea => ({
  label,
  source: "coordinate",
  feature: feature(37, 2),
  bounds: [
    [2, 37],
    [2, 37],
  ],
  areaKm2: null,
});

const stamped = (id: string): AreaOfInterest => ({ ...draft(id), id });

describe("loadSelection", () => {
  it("starts on the defaults when storage is empty", async () => {
    const store = await freshStore();
    store.loadSelection("flood-risk", {});
    const state = store.getSelectionSnapshot();
    expect(state.areas).toEqual([]);
    expect(state.analysisType).toBe("single");
    expect(state.modelId).toBe("random-forest");
  });

  it("applies the URL over the defaults on first load", async () => {
    const store = await freshStore();
    store.loadSelection("flood-risk", {
      analysisType: "comparison",
      modelId: "combined",
    });
    expect(store.getSelectionSnapshot().analysisType).toBe("comparison");
    expect(store.getSelectionSnapshot().modelId).toBe("combined");
  });

  it("is idempotent for the same topic and the same query", async () => {
    // Called during render by every step, so a second call has to be free and
    // must not re-run the reducer over state the user has since changed.
    const store = await freshStore();
    store.loadSelection("flood-risk", { modelId: "xgboost" });
    store.dispatchSelection({ type: "setModel", modelId: "combined" });
    store.loadSelection("flood-risk", { modelId: "xgboost" });
    expect(store.getSelectionSnapshot().modelId).toBe("combined");
  });

  it("applies a CHANGED query on a client-side navigation, not only on reload", async () => {
    // The contract is "a shared link wins over a session in progress". An
    // early return on `topic already loaded` made that true only of a full
    // page load, which is the one path a browser test is least likely to take.
    const store = await freshStore();
    store.loadSelection("flood-risk", {});
    store.dispatchSelection({ type: "addAreas", areas: [draft("a"), draft("b")] });

    store.loadSelection("flood-risk", { modelId: "xgboost" });
    expect(store.getSelectionSnapshot().modelId).toBe("xgboost");
    // And it did not discard the session it arrived into.
    expect(store.getSelectionSnapshot().areas).toHaveLength(1);
  });

  it("narrows the scope through the reducer, with the notice and the undo", async () => {
    const store = await freshStore();
    store.loadSelection("flood-risk", { analysisType: "comparison" });
    store.dispatchSelection({
      type: "addAreas",
      areas: [draft("Marsabit"), draft("Turkana"), draft("Wajir")],
    });
    expect(store.getSelectionSnapshot().areas).toHaveLength(3);

    // A link to ?type=single arriving at a three-area comparison must drop two
    // areas the SAME way clicking the radio does. Silently assigning the field
    // is the truncation bug selection.ts exists to prevent.
    store.loadSelection("flood-risk", { analysisType: "single" });
    const state = store.getSelectionSnapshot();
    expect(state.areas).toHaveLength(1);
    expect(state.notice).toMatch(/2 earlier areas were removed/i);
    expect(state.undo?.areas).toHaveLength(3);
  });

  // The "does nothing on the server" case is in the NODE lane
  // (selection-store.test.ts), not here. jsdom defines `window` as
  // non-configurable, so it can be neither deleted nor stubbed, and a faked
  // absence would be testing the fake. The node lane has no `window` to begin
  // with, which is the real condition.
});

describe("two topics", () => {
  it("keeps a separate selection per topic, in memory and in storage", async () => {
    // The bug: one storage key for the app. Opening a second topic to check
    // something overwrote the first topic's areas, and nothing reported it.
    // Drawn polygons cannot be re-derived, so the loss was permanent.
    const store = await freshStore();

    store.loadSelection("flood-risk", {});
    store.dispatchSelection({ type: "addAreas", areas: [draft("Isiolo")] });

    store.loadSelection("drought-monitoring", {});
    expect(store.getSelectionSnapshot().areas).toEqual([]);
    store.dispatchSelection({ type: "addAreas", areas: [draft("Garissa")] });

    store.loadSelection("flood-risk", {});
    const back = store.getSelectionSnapshot();
    expect(back.areas).toHaveLength(1);
    expect(back.areas[0].label).toBe("Isiolo");
  });

  it("survives a reload, which is a fresh module registry", async () => {
    const store = await freshStore();
    store.loadSelection("flood-risk", {});
    store.dispatchSelection({ type: "addAreas", areas: [draft("Isiolo")] });

    // Same sessionStorage, brand new module instance: exactly what F5 does.
    vi.resetModules();
    const reloaded: Store = await import("@/lib/analysis/selection-store");
    reloaded.loadSelection("flood-risk", {});
    expect(reloaded.getSelectionSnapshot().areas[0].label).toBe("Isiolo");
  });

  it("writes each topic under its own key", async () => {
    const store = await freshStore();
    store.loadSelection("flood-risk", {});
    store.dispatchSelection({ type: "addAreas", areas: [draft("Isiolo")] });
    store.loadSelection("drought-monitoring", {});
    store.dispatchSelection({ type: "addAreas", areas: [draft("Garissa")] });

    expect(sessionStorage.getItem(store.storageKey("flood-risk"))).toContain(
      "Isiolo",
    );
    expect(
      sessionStorage.getItem(store.storageKey("drought-monitoring")),
    ).toContain("Garissa");
  });
});

describe("restored ids", () => {
  it("never mints an id an existing area already has", async () => {
    /*
     * The bug, in full. Ids are monotonic and never reused, so removing the
     * FIRST of three leaves aoi-2 and aoi-3 — a gap. `areas.length + 1` then
     * restores nextId as 3, the next area is stamped aoi-3, two rows share an
     * id, and pressing Remove on either deletes both. React logs nothing,
     * because the duplicate keys live in the reducer's array rather than in
     * one render's children.
     *
     * The node-lane test that was written first only ever restored a
     * contiguous [aoi-1, aoi-2, aoi-3], so it passed while this was live.
     */
    const store = await freshStore();
    sessionStorage.setItem(
      store.storageKey("flood-risk"),
      JSON.stringify({
        version: store.STORAGE_VERSION,
        topic: "flood-risk",
        analysisType: "comparison",
        modelId: "random-forest",
        areas: [stamped("aoi-2"), stamped("aoi-3")],
      }),
    );

    store.loadSelection("flood-risk", {});
    store.dispatchSelection({ type: "addAreas", areas: [draft("new")] });

    const ids = store.getSelectionSnapshot().areas.map((a) => a.id);
    expect(ids).toEqual(["aoi-2", "aoi-3", "aoi-4"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("removes exactly one row when ids were restored from a gapped set", async () => {
    // The user-visible half of the same bug, stated as behaviour.
    const store = await freshStore();
    sessionStorage.setItem(
      store.storageKey("flood-risk"),
      JSON.stringify({
        version: store.STORAGE_VERSION,
        topic: "flood-risk",
        analysisType: "comparison",
        modelId: "random-forest",
        areas: [stamped("aoi-2"), stamped("aoi-3")],
      }),
    );
    store.loadSelection("flood-risk", {});
    store.dispatchSelection({ type: "addAreas", areas: [draft("new")] });

    const target = store.getSelectionSnapshot().areas[2].id;
    store.dispatchSelection({ type: "removeArea", id: target });
    expect(store.getSelectionSnapshot().areas).toHaveLength(2);
  });

  it("survives an id that does not parse, rather than minting NaN", async () => {
    const store = await freshStore();
    sessionStorage.setItem(
      store.storageKey("flood-risk"),
      JSON.stringify({
        version: store.STORAGE_VERSION,
        topic: "flood-risk",
        analysisType: "comparison",
        modelId: "random-forest",
        areas: [stamped("not-an-aoi-id")],
      }),
    );
    store.loadSelection("flood-risk", {});
    store.dispatchSelection({ type: "addAreas", areas: [draft("new")] });
    expect(store.getSelectionSnapshot().areas[1].id).toBe("aoi-1");
  });
});

describe("subscription", () => {
  it("notifies every subscriber once per real change", async () => {
    const store = await freshStore();
    store.loadSelection("flood-risk", {});

    const seen: number[] = [];
    const unsubscribe = store.subscribeSelection(() => seen.push(1));

    store.dispatchSelection({ type: "setModel", modelId: "xgboost" });
    expect(seen).toHaveLength(1);

    // A dispatch the reducer answers with the same state is not a change, and
    // notifying on it would re-render every step for nothing.
    store.dispatchSelection({ type: "setModel", modelId: "xgboost" });
    expect(seen).toHaveLength(1);

    unsubscribe();
    store.dispatchSelection({ type: "setModel", modelId: "combined" });
    expect(seen).toHaveLength(1);
  });

  it("returns a stable snapshot between changes", async () => {
    // useSyncExternalStore re-renders forever if getSnapshot returns a fresh
    // object each call.
    const store = await freshStore();
    store.loadSelection("flood-risk", {});
    expect(store.getSelectionSnapshot()).toBe(store.getSelectionSnapshot());
  });
});

describe("resetSelection", () => {
  it("clears one topic and leaves the others alone", async () => {
    const store = await freshStore();
    store.loadSelection("flood-risk", {});
    store.dispatchSelection({ type: "addAreas", areas: [draft("Isiolo")] });
    store.loadSelection("drought-monitoring", {});
    store.dispatchSelection({ type: "addAreas", areas: [draft("Garissa")] });

    store.resetSelection("flood-risk");
    expect(sessionStorage.getItem(store.storageKey("flood-risk"))).toBeNull();
    expect(
      sessionStorage.getItem(store.storageKey("drought-monitoring")),
    ).not.toBeNull();

    store.loadSelection("flood-risk", {});
    expect(store.getSelectionSnapshot().areas).toEqual([]);
  });

  it("notifies subscribers, so the screen showing the cleared topic updates", async () => {
    const store = await freshStore();
    store.loadSelection("flood-risk", {});
    store.dispatchSelection({ type: "addAreas", areas: [draft("Isiolo")] });

    let notified = 0;
    store.subscribeSelection(() => {
      notified += 1;
    });
    store.resetSelection("flood-risk");
    expect(notified).toBe(1);
  });
});

describe("storage that refuses to work", () => {
  it("falls back to a fresh selection rather than throwing", async () => {
    // Private mode, blocked site data, or a full quota. The flow still has to
    // work in this tab; only a reload loses the selection.
    const store = await freshStore();
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    try {
      expect(() => store.loadSelection("flood-risk", {})).not.toThrow();
      expect(() =>
        store.dispatchSelection({ type: "addAreas", areas: [draft("Isiolo")] }),
      ).not.toThrow();
      // And the selection still works in memory.
      expect(store.getSelectionSnapshot().areas).toHaveLength(1);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
