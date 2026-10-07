import { describe, expect, it } from "vitest";
import { featureName, popupRows } from "@/services/explore";

describe("featureName", () => {
  it("finds the name in each Rangelands layer's own attribute", () => {
    expect(featureName({ objectid_1: null, name: "Kyanyiki", label: "YES" })).toBe("Kyanyiki");
    expect(featureName({ constituency: "Galole", ward: "Mikinduni" })).toBe("Mikinduni");
    expect(featureName({ tname: "Hola", type: "Town" })).toBe("Hola");
    expect(featureName({ name_0: "Kenya", name_1: "Tana River", name_2: "Galole" })).toBe("Galole");
  });

  it("is null when nothing names the feature, and never a YES/NO flag", () => {
    expect(featureName({ id: 0, shape_area: 12.5 })).toBeNull();
    expect(featureName({ label: "YES" })).toBeNull();
    expect(featureName({ name: "  " })).toBeNull();
  });
});

describe("popupRows", () => {
  it("keeps the server's order and spelling, and drops empty values and ids", () => {
    expect(
      popupRows({
        objectid_1: null,
        id: 0,
        name: "Kyanyiki",
        length: 0,
        label: "",
        type: null,
        shape_length: 37860.3128716873,
      }),
    ).toEqual([
      { key: "id", value: "0" },
      { key: "name", value: "Kyanyiki" },
      { key: "length", value: "0" },
      { key: "shape_length", value: "37860.3129" },
    ]);
  });

  it("writes booleans as words and anything structured as JSON", () => {
    expect(popupRows({ active: true, tags: ["a", "b"] })).toEqual([
      { key: "active", value: "Yes" },
      { key: "tags", value: '["a","b"]' },
    ]);
  });
});
