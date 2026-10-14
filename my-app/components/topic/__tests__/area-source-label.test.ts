/**
 * Gate tests for areaSourceLabel (components/topic/SelectedAreas.tsx): what
 * the selected list and the review step say an area is. A unit picked by name
 * is one "admin" source in the request contract, so the level it shows has to
 * come from the feature's properties.
 */

import { describe, expect, it } from "vitest";
import type { AreaOfInterest } from "@/services/analysis/selection";
import { areaSourceLabel } from "../SelectedAreas";

function area(
  source: AreaOfInterest["source"],
  properties: Record<string, unknown> | null,
): Pick<AreaOfInterest, "source" | "feature"> {
  return {
    source,
    feature: { type: "Feature", geometry: { type: "Point", coordinates: [38, 0] }, properties },
  };
}

describe("areaSourceLabel", () => {
  it("names an admin area by its level", () => {
    expect(areaSourceLabel(area("admin", { adminId: "county:turkana", level: "county" }))).toBe(
      "County",
    );
    expect(areaSourceLabel(area("admin", { level: "subcounty" }))).toBe("Sub-county");
    expect(areaSourceLabel(area("admin", { level: "ward" }))).toBe("Ward");
  });

  it("falls back to 'By name' when the level is missing or unknown", () => {
    expect(areaSourceLabel(area("admin", null))).toBe("By name");
    expect(areaSourceLabel(area("admin", { level: "village" }))).toBe("By name");
  });

  it("ignores a level property on any other source", () => {
    expect(areaSourceLabel(area("shapefile", { level: "ward" }))).toBe("Shapefile");
    expect(areaSourceLabel(area("point", null))).toBe("Clicked point");
    expect(areaSourceLabel(area("drawn", null))).toBe("Drawn");
  });
});
