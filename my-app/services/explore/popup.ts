/**
 * What a feature's popup says: a heading and its attributes as rows.
 *
 * Pure, so the rules are asserted in node rather than eyeballed on a map. The
 * map half (ExploreMapLibre) only turns these rows into DOM, as text.
 */

export interface PopupRow {
  key: string;
  value: string;
}

/**
 * Attributes that name a feature, most specific first. Real ones from the
 * Rangelands workspace: rivers and water bodies carry `name`, wards `ward`,
 * places `tname`, the GADM-style sub-counties `name_2` beside `name_1` (the
 * county) and `name_0` (the country), so the deepest admin level wins.
 */
const NAME_KEYS = ["name", "ward", "tname", "name_3", "name_2", "name_1", "label", "title"];

/** Bookkeeping columns that say nothing to an analyst. */
const HIDDEN_KEYS = new Set(["gid", "fid", "objectid", "objectid_1", "ogc_fid", "bbox"]);

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return JSON.stringify(value);
}

/** The feature's own name, when one of its attributes is a name. */
export function featureName(properties: Readonly<Record<string, unknown>>): string | null {
  for (const key of NAME_KEYS) {
    const text = asText(properties[key]);
    if (text !== null && !/^(yes|no)$/i.test(text)) return text;
  }
  return null;
}

/**
 * Every attribute worth showing, in the server's order: empty values and
 * bookkeeping ids dropped, numbers rounded to four places, the key kept as
 * GeoServer spells it so it can be matched against the database.
 */
export function popupRows(properties: Readonly<Record<string, unknown>>): PopupRow[] {
  const rows: PopupRow[] = [];
  for (const [key, raw] of Object.entries(properties)) {
    if (HIDDEN_KEYS.has(key.toLowerCase())) continue;
    const value = asText(raw);
    if (value === null) continue;
    rows.push({ key, value });
  }
  return rows;
}
