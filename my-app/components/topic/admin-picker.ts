/**
 * The administrative picker's rules, kept out of the component so they are
 * proved without a browser.
 *
 * Search and cascade themselves live in services/geo/admin.ts. What is here is
 * the picker's own layer on top: which options a box shows for what was
 * typed, what each option says about where it sits, how the add action is
 * named and when it refuses, and what adding a unit does when it is already
 * in the list.
 */

import type { MultiPolygon } from "geojson";
import {
  ADMIN_BY_ID,
  ADMIN_LEVEL_LABEL,
  ADMIN_UNITS,
  type AdminChoice,
  type AdminLevel,
  type AdminScope,
  type AdminUnit,
  mostSpecific,
  normaliseQuery,
  searchUnits,
  unitsInScope,
} from "@/services/geo/admin";
import {
  draftAreaFromGeometry,
  type AreaOfInterest,
  type DraftArea,
} from "@/services/analysis/selection";

/**
 * At most this many options in an open list. 1452 wards as DOM options is a
 * long first paint and a list nobody scrolls; three typed letters already
 * narrow any level to a handful (searchUnits matches word starts).
 */
export const OPTION_CAP = 50;

export const LEVEL_PLURAL: Record<AdminLevel, string> = {
  county: "counties",
  subcounty: "sub-counties",
  ward: "wards",
};

/** "ward", "sub-county", "county": the level inside a sentence. */
export const levelWord = (level: AdminLevel) => ADMIN_LEVEL_LABEL[level].toLowerCase();

export interface PickerOption {
  unit: AdminUnit;
  /**
   * Where it sits, less what the boxes above already say: "Bura, Tana River"
   * for a ward searched across Kenya, "Bura" once the county is chosen, ""
   * once the sub-county is too.
   */
  context: string;
}

export interface PickerOptions {
  options: PickerOption[];
  /** Every match, before the cap. */
  total: number;
  /**
   * True when nothing in the chosen parents matched and the list fell back
   * to all of Kenya. Picking from it moves the parents to fit.
   */
  widened: boolean;
}

/** The parents a level's list is narrowed by. A county list never is. */
export function scopeForLevel(level: AdminLevel, choice: AdminChoice): AdminScope {
  if (level === "county") return { county: null, subcounty: null };
  return {
    county: choice.county?.id ?? null,
    subcounty: level === "ward" ? (choice.subcounty?.id ?? null) : null,
  };
}

/** A unit's place, leaving out the parents its list is already scoped to. */
export function contextBeyond(
  unit: AdminUnit,
  scope: AdminScope,
  byId: ReadonlyMap<string, AdminUnit> = ADMIN_BY_ID,
): string {
  if (unit.level === "county") return "";
  const parts: string[] = [];
  if (unit.level === "ward" && scope.subcounty === null && unit.subcounty !== null) {
    const sub = byId.get(unit.subcounty);
    if (sub !== undefined) parts.push(sub.name);
  }
  if (scope.county === null) {
    parts.push(byId.get(`county:${unit.county}`)?.name ?? unit.county);
  }
  return parts.join(", ");
}

/**
 * The options one box shows for what was typed, best match first, capped.
 *
 * A typed name with no match inside the chosen parents is searched across
 * Kenya instead, rather than answering "no match": the analyst who types
 * "Bangale" with Turkana still chosen wants Bangale, and choosing it moves the
 * county and sub-county to fit (choose() in admin.ts).
 */
export function pickerOptions(
  level: AdminLevel,
  choice: AdminChoice,
  query: string,
  units: readonly AdminUnit[] = ADMIN_UNITS,
  byId: ReadonlyMap<string, AdminUnit> = ADMIN_BY_ID,
  cap: number = OPTION_CAP,
): PickerOptions {
  let scope = scopeForLevel(level, choice);
  let matches = searchUnits(unitsInScope(units, level, scope), query);
  let widened = false;
  const scoped = scope.county !== null || scope.subcounty !== null;
  if (matches.length === 0 && scoped && query.trim() !== "") {
    scope = { county: null, subcounty: null };
    matches = searchUnits(unitsInScope(units, level, scope), query);
    widened = matches.length > 0;
  }
  return {
    options: matches.slice(0, cap).map((unit) => ({
      unit,
      context: contextBeyond(unit, scope, byId),
    })),
    total: matches.length,
    widened,
  };
}

/**
 * A name split into the parts the typed words matched and the rest, so an
 * option can set the match in bold: "Ban" in "Bangale". Mirrors searchUnits'
 * rule, a query word matches the start of a name word, so what is bold is
 * exactly why the option is in the list.
 */
export function matchParts(name: string, query: string): { text: string; match: boolean }[] {
  const words = normaliseQuery(query).split(" ").filter(Boolean);
  const parts: { text: string; match: boolean }[] = [];
  const push = (text: string, match: boolean) => {
    if (text === "") return;
    const last = parts[parts.length - 1];
    if (last !== undefined && last.match === match) last.text += text;
    else parts.push({ text, match });
  };
  for (const token of name.match(/[A-Za-z0-9]+|[^A-Za-z0-9]+/g) ?? []) {
    const lower = token.toLowerCase();
    const hit = words
      .filter((w) => lower.startsWith(w))
      .reduce((longest, w) => Math.max(longest, w.length), 0);
    push(token.slice(0, hit), true);
    push(token.slice(hit), false);
  }
  return parts;
}

/** "1,452", the way the list counts. */
const count = (n: number) => n.toLocaleString("en-GB");

/**
 * The one line under an open list, or null when the list says it all:
 * "Showing 50 of 1,452 wards. Type to narrow." or "No ward matches "zz".".
 */
export function listFootnote(
  level: AdminLevel,
  result: PickerOptions,
  query: string,
): string | null {
  const typed = query.trim();
  if (result.total === 0) {
    return typed === ""
      ? `No ${LEVEL_PLURAL[level]} here.`
      : `No ${levelWord(level)} matches "${typed}".`;
  }
  if (result.widened) {
    return `None in the chosen area. Showing matches across Kenya.`;
  }
  if (result.total > result.options.length) {
    return `Showing ${result.options.length} of ${count(result.total)} ${LEVEL_PLURAL[level]}. Type to narrow.`;
  }
  return null;
}

/** What a screen reader hears as the list changes: "3 wards match." */
export function listAnnouncement(level: AdminLevel, result: PickerOptions): string {
  if (result.total === 0) return `No ${levelWord(level)} matches.`;
  const noun = result.total === 1 ? levelWord(level) : LEVEL_PLURAL[level];
  const shown =
    result.total > result.options.length ? `, first ${result.options.length} shown` : "";
  const where = result.widened ? " across Kenya" : "";
  return `${count(result.total)} ${noun} match${result.total === 1 ? "es" : ""}${where}${shown}.`;
}

/** The chosen path, broadest first: [Tana River, Bura, Bangale]. */
export function choicePath(choice: AdminChoice): AdminUnit[] {
  return [choice.county, choice.subcounty, choice.ward].filter(
    (u): u is AdminUnit => u !== null,
  );
}

/** The area already in the list for this unit, if it was added before. */
export function findAdminArea(
  areas: readonly AreaOfInterest[],
  unitId: string,
): AreaOfInterest | undefined {
  return areas.find((a) => a.feature.properties?.adminId === unitId);
}

/**
 * The add action's label and, when it cannot act, the reason it says out
 * loud beside it. The level is in the label ("Add ward") so the analyst knows
 * which of the three boxes is about to be added before pressing it.
 */
export interface AddAction {
  label: string;
  /** Null when the action is available. */
  disabledReason: string | null;
  /** Already in the list: the action shows it rather than adding it again. */
  existing: AreaOfInterest | null;
}

export function addAction(
  choice: AdminChoice,
  areas: readonly AreaOfInterest[],
  maxAreas: number,
): AddAction {
  const unit = mostSpecific(choice);
  if (unit === null) {
    return {
      label: "Add",
      disabledReason: "Choose a county, sub-county or ward to add it.",
      existing: null,
    };
  }
  const existing = findAdminArea(areas, unit.id) ?? null;
  if (existing !== null) {
    return { label: `Show ${levelWord(unit.level)}`, disabledReason: null, existing };
  }
  if (maxAreas > 1 && areas.length >= maxAreas) {
    return {
      label: `Add ${levelWord(unit.level)}`,
      disabledReason: `${maxAreas} areas is the most a comparison takes. Remove one to add ${unit.name}.`,
      existing: null,
    };
  }
  return { label: `Add ${levelWord(unit.level)}`, disabledReason: null, existing: null };
}

/**
 * A unit's boundary as a draft area. Labelled with the bare name: the level
 * shows beside it ("Ward", from the level in the properties; see
 * areaSourceLabel), and the id rides in the properties
 * so a second add of the same unit finds the first.
 */
export function adminDraft(unit: AdminUnit, geometry: MultiPolygon): DraftArea | null {
  return draftAreaFromGeometry(geometry, "admin", unit.name, {
    adminId: unit.id,
    level: unit.level,
  });
}
