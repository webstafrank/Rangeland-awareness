/**
 * Gate tests for Kenya's administrative hierarchy (services/geo/admin.ts and
 * the files build-admin.mjs generates).
 *
 * The hierarchy is assembled by geometry from three releases that never
 * reference each other, so the strongest check available is an outside one:
 * IEBC's own counts. Every county's constituency count must match exactly.
 * Ward counts are pinned too, with the six counties where the ward release
 * itself differs from IEBC listed by name, so a data refresh that moves a
 * single ward fails here.
 */
import { describe, expect, it } from "vitest";

import {
  ADMIN_BY_ID,
  ADMIN_UNITS,
  EMPTY_CHOICE,
  choose,
  loadAdminGeometry,
  mostSpecific,
  normaliseQuery,
  parseUnitId,
  searchUnits,
  unitContext,
  unitsInScope,
  type AdminUnit,
} from "../admin";
import { COUNTIES } from "../data/counties.generated";

/** IEBC: [constituencies, wards] per county. 290 and 1450 in total. */
const IEBC: Record<string, [number, number]> = {
  mombasa: [6, 30], kwale: [4, 20], kilifi: [7, 35], "tana-river": [3, 15], lamu: [2, 10],
  "taita-taveta": [4, 20], garissa: [6, 30], wajir: [6, 30], mandera: [6, 30], marsabit: [4, 20],
  isiolo: [2, 10], meru: [9, 45], tharaka: [3, 15], embu: [4, 20], kitui: [8, 40],
  machakos: [8, 40], makueni: [6, 30], nyandarua: [5, 25], nyeri: [6, 30], kirinyaga: [4, 20],
  muranga: [7, 35], kiambu: [12, 60], turkana: [6, 30], "west-pokot": [4, 20], samburu: [3, 15],
  "trans-nzoia": [5, 25], "uasin-gishu": [6, 30], "elgeyo-marakwet": [4, 20], nandi: [6, 30],
  baringo: [6, 30], laikipia: [3, 15], nakuru: [11, 55], narok: [6, 30], kajiado: [5, 25],
  kericho: [6, 30], bomet: [5, 25], kakamega: [12, 60], vihiga: [5, 25], bungoma: [9, 45],
  busia: [7, 35], siaya: [6, 30], kisumu: [7, 35], "homa-bay": [8, 40], migori: [8, 40],
  kisii: [9, 45], nyamira: [4, 20], nairobi: [17, 85],
};

/**
 * Where the ward release (1452 wards) itself differs from IEBC's 1450: two
 * names it lists twice (Mwiki in Nairobi, Tarakwa in Uasin Gishu) and two
 * places where it splits the ground differently from IEBC.
 */
const WARD_RELEASE_DELTA: Record<string, number> = {
  nairobi: +1,
  "uasin-gishu": +1,
  kwale: +1,
  "taita-taveta": -1,
  nakuru: +1,
  kiambu: -1,
};

const byLevel = (level: AdminUnit["level"]) => ADMIN_UNITS.filter((u) => u.level === level);
const named = (name: string, level: AdminUnit["level"]) =>
  ADMIN_UNITS.find((u) => u.name === name && u.level === level)!;

describe("the hierarchy", () => {
  it("has every county, sub-county and ward of the releases", () => {
    expect(byLevel("county")).toHaveLength(47);
    expect(byLevel("subcounty")).toHaveLength(290);
    expect(byLevel("ward")).toHaveLength(1452);
  });

  it("uses the county overview map's county ids", () => {
    expect(byLevel("county").map((u) => u.county).sort()).toEqual(COUNTIES.map((c) => c.id).sort());
  });

  it("has unique ids that round-trip through parseUnitId", () => {
    expect(ADMIN_BY_ID.size).toBe(ADMIN_UNITS.length);
    for (const u of ADMIN_UNITS) expect(parseUnitId(u.id, u.name)).toEqual(u);
  });

  it("gives every ward a sub-county that exists, in the same county", () => {
    for (const ward of byLevel("ward")) {
      const sub = ADMIN_BY_ID.get(ward.subcounty!);
      expect(sub, ward.id).toBeDefined();
      expect(sub!.county).toBe(ward.county);
    }
  });

  it.each(Object.entries(IEBC))("files %s's constituencies and wards as IEBC does", (county, [subs, wards]) => {
    const scope = { county: `county:${county}`, subcounty: null };
    expect(unitsInScope(ADMIN_UNITS, "subcounty", scope)).toHaveLength(subs);
    expect(unitsInScope(ADMIN_UNITS, "ward", scope)).toHaveLength(wards + (WARD_RELEASE_DELTA[county] ?? 0));
  });

  it("files known wards where they are", () => {
    // Points a person can check on a map.
    expect(named("Bangale", "ward").subcounty).toBe("subcounty:tana-river:bura");
    expect(named("Laini Saba", "ward").county).toBe("nairobi");
    expect(named("Litein", "ward").county).toBe("kericho"); // Bureti, not Bomet
    expect(named("Kibra", "subcounty").county).toBe("nairobi");
  });
});

describe("loadAdminGeometry", () => {
  /*
   * Every one of the 1789 units, through the real loader, so it imports all 47
   * county files (about 4.5s on an idle machine, nearly all of it Vite turning
   * the JSON into modules). The files load concurrently, and the test has its
   * own 30s budget: at the 5s default it failed the pre-commit gate whenever
   * the eval suite was running beside it. A hang still fails it.
   */
  it("loads a boundary for every unit, as closed rings inside Kenya", { timeout: 30_000 }, async () => {
    // Problems collected in plain code and asserted once: an expect() per
    // coordinate took this test past five seconds.
    const problems: string[] = [];
    const geometries = await Promise.all(ADMIN_UNITS.map((unit) => loadAdminGeometry(unit)));
    for (const [i, unit] of ADMIN_UNITS.entries()) {
      const g = geometries[i];
      if (g.type !== "MultiPolygon" || g.coordinates.length === 0) problems.push(`${unit.id}: empty`);
      for (const polygon of g.coordinates) {
        for (const ring of polygon) {
          const [first, last] = [ring[0], ring[ring.length - 1]];
          if (ring.length < 4 || first[0] !== last[0] || first[1] !== last[1]) {
            problems.push(`${unit.id}: open or degenerate ring`);
          }
          if (ring.some(([lon, lat]) => lon < 33.5 || lon > 42.5 || lat < -5.5 || lat > 5.5)) {
            problems.push(`${unit.id}: point outside Kenya`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("refuses a unit whose county has no file", async () => {
    await expect(
      loadAdminGeometry({ id: "county:atlantis", name: "Atlantis", level: "county", county: "atlantis", subcounty: null }),
    ).rejects.toThrow(/no boundary file/);
  });
});

describe("searchUnits", () => {
  const wards = byLevel("ward");

  it("finds a ward from three letters, name-start matches first", () => {
    const hits = searchUnits(wards, "ban");
    expect(hits[0].name.toLowerCase().startsWith("ban")).toBe(true);
    expect(hits.map((u) => u.name)).toContain("Bangale");
  });

  it("matches the start of any word, every word required", () => {
    const hits = searchUnits(wards, "dandora ii");
    expect(hits.map((u) => u.name)).toEqual(expect.arrayContaining(["Dandora Area Ii", "Dandora Area Iii"]));
    expect(hits.every((u) => /dandora/i.test(u.name))).toBe(true);
  });

  it("ignores case, punctuation and accents", () => {
    expect(normaliseQuery("  Mugumo-Ini ")).toBe("mugumo ini");
    expect(searchUnits(wards, "MUGUMO ini").map((u) => u.name)).toContain("Mugumo-Ini");
    expect(normaliseQuery("Murang’a")).toBe("murang a");
  });

  it("returns everything for an empty query and nothing for nonsense", () => {
    expect(searchUnits(wards, "  ")).toHaveLength(wards.length);
    expect(searchUnits(wards, "zzqx")).toEqual([]);
  });
});

describe("cascade", () => {
  const tana = ADMIN_BY_ID.get("county:tana-river")!;
  const bura = ADMIN_BY_ID.get("subcounty:tana-river:bura")!;
  const bangale = ADMIN_BY_ID.get("ward:tana-river:bura:bangale")!;
  const garissa = ADMIN_BY_ID.get("county:garissa")!;

  it("narrows sub-counties and wards to the chosen parents", () => {
    const subs = unitsInScope(ADMIN_UNITS, "subcounty", { county: tana.id, subcounty: null });
    expect(subs.every((u) => u.county === "tana-river")).toBe(true);
    const wardsOfBura = unitsInScope(ADMIN_UNITS, "ward", { county: tana.id, subcounty: bura.id });
    expect(wardsOfBura.every((u) => u.subcounty === bura.id)).toBe(true);
    expect(wardsOfBura.length).toBeGreaterThan(0);
  });

  it("searches all of Kenya when no parent is chosen", () => {
    const all = unitsInScope(ADMIN_UNITS, "ward", { county: null, subcounty: null });
    expect(all).toHaveLength(1452);
  });

  it("fills the parents when a ward is chosen first", () => {
    const next = choose(EMPTY_CHOICE, "ward", bangale, ADMIN_BY_ID);
    expect(next).toEqual({ county: tana, subcounty: bura, ward: bangale });
    expect(mostSpecific(next)).toBe(bangale);
  });

  it("keeps children that still fit a new parent, and drops those that do not", () => {
    const full = choose(EMPTY_CHOICE, "ward", bangale, ADMIN_BY_ID);
    expect(choose(full, "county", tana, ADMIN_BY_ID)).toEqual(full);
    expect(choose(full, "county", garissa, ADMIN_BY_ID)).toEqual({ county: garissa, subcounty: null, ward: null });
  });

  it("clears downwards", () => {
    const full = choose(EMPTY_CHOICE, "ward", bangale, ADMIN_BY_ID);
    expect(choose(full, "ward", null, ADMIN_BY_ID)).toEqual({ county: tana, subcounty: bura, ward: null });
    expect(choose(full, "subcounty", null, ADMIN_BY_ID)).toEqual({ county: tana, subcounty: null, ward: null });
    expect(choose(full, "county", null, ADMIN_BY_ID)).toEqual(EMPTY_CHOICE);
    expect(mostSpecific(EMPTY_CHOICE)).toBeNull();
  });

  it("names where a unit sits", () => {
    expect(unitContext(bangale, ADMIN_BY_ID)).toBe("Bura, Tana River");
    expect(unitContext(bura, ADMIN_BY_ID)).toBe("Tana River");
    expect(unitContext(tana, ADMIN_BY_ID)).toBe("");
  });
});
