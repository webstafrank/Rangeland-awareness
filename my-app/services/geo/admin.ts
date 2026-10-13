/**
 * Kenya's administrative units, for picking an analysis area by name.
 *
 * Three levels: 47 counties, 290 sub-counties (the IEBC units, which are what
 * wards nest inside) and 1452 wards. The index is small and loaded eagerly;
 * the boundaries are fetched one county at a time, only when an analyst adds a
 * unit from that county. Built by scripts/build-admin.mjs.
 *
 * Search and cascade are pure functions here so they are proved in node; the
 * picker component only renders what they return.
 */

import type { MultiPolygon } from "geojson";

import { ADMIN_GEOMETRY_LOADERS } from "./data/admin-geometry.generated";
import { ADMIN_UNIT_ROWS } from "./data/admin-index.generated";

export const ADMIN_LEVELS = ["county", "subcounty", "ward"] as const;
export type AdminLevel = (typeof ADMIN_LEVELS)[number];

export const ADMIN_LEVEL_LABEL: Record<AdminLevel, string> = {
  county: "County",
  subcounty: "Sub-county",
  ward: "Ward",
};

export interface AdminUnit {
  /** `county:<c>`, `subcounty:<c>:<s>` or `ward:<c>:<s>:<w>`. Stable across builds. */
  readonly id: string;
  readonly name: string;
  readonly level: AdminLevel;
  /** The county slug, the same id as the county overview map uses. */
  readonly county: string;
  /** The parent sub-county's id, for a ward; null otherwise. */
  readonly subcounty: string | null;
}

/** An id's level and parents, read straight off it. Null for a malformed id. */
export function parseUnitId(id: string, name: string): AdminUnit | null {
  const parts = id.split(":");
  if (parts[0] === "county" && parts.length === 2) {
    return { id, name, level: "county", county: parts[1], subcounty: null };
  }
  if (parts[0] === "subcounty" && parts.length === 3) {
    return { id, name, level: "subcounty", county: parts[1], subcounty: null };
  }
  if (parts[0] === "ward" && parts.length === 4) {
    return {
      id,
      name,
      level: "ward",
      county: parts[1],
      subcounty: `subcounty:${parts[1]}:${parts[2]}`,
    };
  }
  return null;
}

/** Every county, sub-county and ward, sorted by level then name. */
export const ADMIN_UNITS: readonly AdminUnit[] = ADMIN_UNIT_ROWS.map(([id, name]) => {
  const unit = parseUnitId(id, name);
  if (unit === null) throw new Error(`malformed admin unit id ${id}`);
  return unit;
});

export const ADMIN_BY_ID: ReadonlyMap<string, AdminUnit> = new Map(
  ADMIN_UNITS.map((u) => [u.id, u]),
);

/**
 * A unit's boundary. Loads its county's file (one request per county; the
 * bundler caches the module after the first), then picks the unit out of it.
 */
export async function loadAdminGeometry(unit: AdminUnit): Promise<MultiPolygon> {
  const load = ADMIN_GEOMETRY_LOADERS[unit.county];
  if (load === undefined) throw new Error(`no boundary file for county ${unit.county}`);
  const file = await load();
  const geometry = file[unit.id];
  if (geometry === undefined) throw new Error(`no boundary for ${unit.name} (${unit.id})`);
  return geometry;
}

/** Which units are in scope, given the parents already chosen. */
export interface AdminScope {
  /** A `county:` id, or null for all of Kenya. */
  county: string | null;
  /** A `subcounty:` id, or null. */
  subcounty: string | null;
}

/** `county:turkana` -> `turkana`. */
export const countySlugOf = (countyId: string) => countyId.slice("county:".length);

/** Lowercase, accents and punctuation folded to spaces, single-spaced. */
export function normaliseQuery(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Units of one level that fit the chosen parents. */
export function unitsInScope(
  units: readonly AdminUnit[],
  level: AdminLevel,
  scope: AdminScope,
): AdminUnit[] {
  return units.filter((u) => {
    if (u.level !== level) return false;
    if (scope.county !== null && u.county !== countySlugOf(scope.county)) return false;
    if (level === "ward" && scope.subcounty !== null && u.subcounty !== scope.subcounty) return false;
    return true;
  });
}

/**
 * Filter by a typed query, best matches first.
 *
 * Every word must match the start of a word in the name ("kap ch" finds
 * "Kapsoya Chepkorio"), so a three-letter query is already selective across
 * 1452 wards. Names that start with the query rank above names that only
 * contain a word starting with it; ties keep alphabetical order.
 */
export function searchUnits(units: readonly AdminUnit[], query: string): AdminUnit[] {
  const words = normaliseQuery(query).split(" ").filter(Boolean);
  if (words.length === 0) return units.slice();
  const ranked: { unit: AdminUnit; rank: number; order: number }[] = [];
  units.forEach((unit, order) => {
    const nameWords = normaliseQuery(unit.name).split(" ");
    if (!words.every((w) => nameWords.some((n) => n.startsWith(w)))) return;
    const rank = normaliseQuery(unit.name).startsWith(words.join(" ")) ? 0 : 1;
    ranked.push({ unit, rank, order });
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.order - b.order).map((r) => r.unit);
}

/**
 * Where a unit sits, for a list row: "Bura, Tana River" for a ward,
 * "Tana River" for a sub-county, "" for a county.
 */
export function unitContext(unit: AdminUnit, byId: ReadonlyMap<string, AdminUnit>): string {
  const county = byId.get(`county:${unit.county}`)?.name ?? unit.county;
  if (unit.level === "county") return "";
  if (unit.level === "subcounty") return county;
  const sub = unit.subcounty !== null ? byId.get(unit.subcounty)?.name : undefined;
  return sub === undefined ? county : `${sub}, ${county}`;
}

/** The parents a choice implies: picking a ward fills its sub-county and county. */
export function scopeFor(unit: AdminUnit): AdminScope {
  return {
    county: `county:${unit.county}`,
    subcounty: unit.level === "ward" ? unit.subcounty : unit.level === "subcounty" ? unit.id : null,
  };
}

/**
 * The selection after choosing (or clearing, with null) the unit at `level`.
 *
 * Choosing fills the parents it implies. Changing a parent clears the
 * children that no longer belong to it, and keeps those that still do.
 */
export interface AdminChoice {
  county: AdminUnit | null;
  subcounty: AdminUnit | null;
  ward: AdminUnit | null;
}

export const EMPTY_CHOICE: AdminChoice = { county: null, subcounty: null, ward: null };

export function choose(
  current: AdminChoice,
  level: AdminLevel,
  unit: AdminUnit | null,
  byId: ReadonlyMap<string, AdminUnit>,
): AdminChoice {
  if (unit === null) {
    if (level === "county") return EMPTY_CHOICE;
    if (level === "subcounty") return { ...current, subcounty: null, ward: null };
    return { ...current, ward: null };
  }
  const county = byId.get(`county:${unit.county}`) ?? null;
  if (unit.level === "county") {
    const keep = (u: AdminUnit | null) => (u !== null && u.county === unit.county ? u : null);
    return { county: unit, subcounty: keep(current.subcounty), ward: keep(current.ward) };
  }
  if (unit.level === "subcounty") {
    const ward = current.ward !== null && current.ward.subcounty === unit.id ? current.ward : null;
    return { county, subcounty: unit, ward };
  }
  const subcounty = unit.subcounty !== null ? (byId.get(unit.subcounty) ?? null) : null;
  return { county, subcounty, ward: unit };
}

/** The most specific unit chosen: what "Add" adds. */
export function mostSpecific(choice: AdminChoice): AdminUnit | null {
  return choice.ward ?? choice.subcounty ?? choice.county;
}

/** A unit's boundary, as loaded from its county's geometry file. */
export type AdminGeometry = MultiPolygon;
