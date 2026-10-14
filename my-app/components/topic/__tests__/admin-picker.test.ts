/**
 * Gate tests for the administrative picker's rules (components/topic/
 * admin-picker.ts): what each box lists for what was typed, how an option
 * says where it sits, the add action's label and refusals, and the draft a
 * unit becomes. Run against the real 1789-unit index, not a fixture, so a
 * data refresh that breaks a lookup the picker depends on fails here.
 */
import { describe, expect, it } from "vitest";
import type { MultiPolygon } from "geojson";

import {
  OPTION_CAP,
  addAction,
  adminDraft,
  choicePath,
  contextBeyond,
  findAdminArea,
  listAnnouncement,
  listFootnote,
  matchParts,
  pickerOptions,
  scopeForLevel,
} from "../admin-picker";
import {
  ADMIN_BY_ID,
  EMPTY_CHOICE,
  choose,
  type AdminChoice,
  type AdminUnit,
} from "@/services/geo/admin";
import type { AreaOfInterest } from "@/services/analysis/selection";

const unit = (id: string): AdminUnit => {
  const u = ADMIN_BY_ID.get(id);
  if (u === undefined) throw new Error(`no unit ${id}`);
  return u;
};

const TANA = unit("county:tana-river");
const BURA_SUB = unit("subcounty:tana-river:bura");
const BANGALE = unit("ward:tana-river:bura:bangale");
const TURKANA = unit("county:turkana");

const pick = (...units: AdminUnit[]): AdminChoice =>
  units.reduce<AdminChoice>((c, u) => choose(c, u.level, u, ADMIN_BY_ID), EMPTY_CHOICE);

const SQUARE: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [39.0, -1.0],
        [39.2, -1.0],
        [39.2, -0.8],
        [39.0, -0.8],
        [39.0, -1.0],
      ],
    ],
  ],
};

function area(id: string, adminId: string | null): AreaOfInterest {
  return {
    id,
    label: id,
    source: "admin",
    feature: {
      type: "Feature",
      geometry: SQUARE,
      properties: adminId === null ? null : { adminId },
    },
    bounds: [
      [-1, 39],
      [-0.8, 39.2],
    ],
    areaKm2: 490,
  };
}

describe("which options a box lists", () => {
  it("searches every ward in Kenya when no parent is chosen, and says where each one is", () => {
    const result = pickerOptions("ward", EMPTY_CHOICE, "Bangale");
    expect(result.options.map((o) => o.unit.id)).toContain(BANGALE.id);
    const option = result.options.find((o) => o.unit.id === BANGALE.id);
    expect(option?.context).toBe("Bura, Tana River");
    expect(result.widened).toBe(false);
  });

  it("tells three wards called Bura apart by their sub-county and county", () => {
    const result = pickerOptions("ward", EMPTY_CHOICE, "Bura");
    const buras = result.options.filter((o) => o.unit.name === "Bura");
    expect(buras.length).toBe(3);
    expect(new Set(buras.map((o) => o.context)).size).toBe(3);
    expect(buras.map((o) => o.context)).toContain("Bura, Tana River");
  });

  it("narrows wards to the chosen county, then to the chosen sub-county", () => {
    const inCounty = pickerOptions("ward", pick(TANA), "");
    expect(inCounty.total).toBe(15);
    expect(inCounty.options.every((o) => o.unit.county === "tana-river")).toBe(true);
    // The county is already in the box above, so only the sub-county is said.
    expect(inCounty.options.find((o) => o.unit.id === BANGALE.id)?.context).toBe("Bura");

    const inSub = pickerOptions("ward", pick(BURA_SUB), "");
    expect(inSub.options.every((o) => o.unit.subcounty === BURA_SUB.id)).toBe(true);
    expect(inSub.options.every((o) => o.context === "")).toBe(true);
  });

  it("narrows sub-counties to the chosen county, but never narrows the county list", () => {
    const subs = pickerOptions("subcounty", pick(TANA), "");
    expect(subs.total).toBe(3);
    expect(subs.options.every((o) => o.context === "")).toBe(true);

    const counties = pickerOptions("county", pick(BANGALE), "");
    expect(counties.total).toBe(47);
  });

  it("annotates a sub-county with its county when searched across Kenya", () => {
    const result = pickerOptions("subcounty", EMPTY_CHOICE, "Bura");
    expect(result.options.find((o) => o.unit.id === BURA_SUB.id)?.context).toBe("Tana River");
  });

  it("caps an open list and counts what it left out", () => {
    const result = pickerOptions("ward", EMPTY_CHOICE, "");
    expect(result.options).toHaveLength(OPTION_CAP);
    expect(result.total).toBe(1452);
    expect(listFootnote("ward", result, "")).toBe(
      "Showing 50 of 1,452 wards. Type to narrow.",
    );
    expect(listAnnouncement("ward", result)).toBe("1,452 wards match, first 50 shown.");
  });

  it("falls back to all of Kenya when the typed name is outside the chosen parents", () => {
    const result = pickerOptions("ward", pick(TURKANA), "Bangale");
    expect(result.widened).toBe(true);
    expect(result.options[0].unit.id).toBe(BANGALE.id);
    expect(result.options[0].context).toBe("Bura, Tana River");
    expect(listFootnote("ward", result, "Bangale")).toMatch(/across Kenya/);
    expect(listAnnouncement("ward", result)).toBe("1 ward matches across Kenya.");
  });

  it("says plainly when nothing anywhere matches", () => {
    const result = pickerOptions("ward", pick(TURKANA), "zzqx");
    expect(result.total).toBe(0);
    expect(result.widened).toBe(false);
    expect(listFootnote("ward", result, "zzqx")).toBe('No ward matches "zzqx".');
    expect(listAnnouncement("ward", result)).toBe("No ward matches.");
  });

  it("needs only three letters to bring a ward into the first few options", () => {
    const result = pickerOptions("ward", EMPTY_CHOICE, "Ban");
    expect(result.options.slice(0, 10).map((o) => o.unit.id)).toContain(BANGALE.id);
  });
});

describe("what an option sets in bold", () => {
  it("bolds the start of each name word a typed word matched", () => {
    expect(matchParts("Bangale", "ban")).toEqual([
      { text: "Ban", match: true },
      { text: "gale", match: false },
    ]);
    expect(matchParts("Kapsoya Chepkorio", "kap ch")).toEqual([
      { text: "Kap", match: true },
      { text: "soya ", match: false },
      { text: "Ch", match: true },
      { text: "epkorio", match: false },
    ]);
  });

  it("bolds nothing for an empty query, and never loses a character", () => {
    expect(matchParts("Baringo Central", "")).toEqual([
      { text: "Baringo Central", match: false },
    ]);
    const name = "Kisumu Central/North-West";
    expect(matchParts(name, "nor we").map((p) => p.text).join("")).toBe(name);
  });
});

describe("scope and context", () => {
  it("scopes a level only by its own parents", () => {
    const choice = pick(BANGALE);
    expect(scopeForLevel("county", choice)).toEqual({ county: null, subcounty: null });
    expect(scopeForLevel("subcounty", choice)).toEqual({ county: TANA.id, subcounty: null });
    expect(scopeForLevel("ward", choice)).toEqual({ county: TANA.id, subcounty: BURA_SUB.id });
  });

  it("gives a county no context", () => {
    expect(contextBeyond(TANA, { county: null, subcounty: null })).toBe("");
  });

  it("lists the chosen path broadest first", () => {
    expect(choicePath(pick(BANGALE)).map((u) => u.name)).toEqual(["Tana River", "Bura", "Bangale"]);
    expect(choicePath(EMPTY_CHOICE)).toEqual([]);
  });
});

describe("the add action", () => {
  it("refuses with a stated reason when nothing is chosen", () => {
    const action = addAction(EMPTY_CHOICE, [], 1);
    expect(action.disabledReason).toMatch(/choose a county, sub-county or ward/i);
  });

  it("names the level it will add", () => {
    expect(addAction(pick(BANGALE), [], 1).label).toBe("Add ward");
    expect(addAction(pick(BURA_SUB), [], 1).label).toBe("Add sub-county");
    expect(addAction(pick(TANA), [], 1).label).toBe("Add county");
  });

  it("shows a unit already in the list instead of adding it twice", () => {
    const existing = area("aoi-3", BANGALE.id);
    const action = addAction(pick(BANGALE), [area("aoi-1", null), existing], 12);
    expect(action.existing?.id).toBe("aoi-3");
    expect(action.label).toBe("Show ward");
    expect(action.disabledReason).toBeNull();
    expect(findAdminArea([existing], TANA.id)).toBeUndefined();
  });

  it("refuses at a comparison's cap, and says how to make room", () => {
    const full = Array.from({ length: 12 }, (_, i) => area(`aoi-${i + 1}`, null));
    const action = addAction(pick(TANA), full, 12);
    expect(action.disabledReason).toMatch(/12 areas.*Remove one to add Tana River/);
  });

  it("never refuses at a single-location cap: a new area replaces the old one", () => {
    expect(addAction(pick(TANA), [area("aoi-1", null)], 1).disabledReason).toBeNull();
  });
});

describe("a unit as a draft area", () => {
  it("is labelled with the name, sourced as admin with its level, and carries its id", () => {
    const draft = adminDraft(BANGALE, SQUARE);
    expect(draft?.label).toBe("Bangale");
    expect(draft?.source).toBe("admin");
    expect(draft?.feature.properties).toEqual({ adminId: BANGALE.id, level: "ward" });
    expect(draft?.areaKm2).toBeGreaterThan(0);
  });
});
