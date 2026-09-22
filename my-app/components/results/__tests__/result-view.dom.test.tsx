/**
 * Gate tests for the results view.
 *
 * `.dom.` in the filename is load-bearing, not decoration: `vitest.config.mts`
 * routes `*.dom.test.*` to the jsdom lane and the pure suites share one worker
 * with `isolate: false`, so a component test that landed in the node lane
 * would install globals under the pure services and fail something unrelated
 * in a different file.
 *
 * What is asserted here is the set of claims the screen makes about itself,
 * because those are the claims that can rot silently. A table that renders is
 * not the test; a table whose shares add to 100% is. Queries go through role
 * and accessible name throughout, so the assertions survive a restyle and fail
 * on an accessibility regression, which is exactly the trade a class-name
 * query gets backwards.
 *
 * The fixture is the contract's own worked example from
 * `contracts/backend-api.md` (run `r_8f3c21a9c4e1`, the five flood classes,
 * four breaks, five criteria), extended with the `grid`, `validPixels` and
 * `dateWindow` fields `overlay.py` actually returns. Numbers invented here
 * would only test this file against itself.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Route } from "next";

import type { RunResult } from "@/services/backend-api";
import { getTopic } from "@/services/analysis/topics";

import ResultView from "../ResultView";
import { classTableCsv, resultJson, areasGeoJson } from "../exports";
import { areaOutline, intervalLabel, shareSplit } from "../view-model";

/* ----------------------------------------------------------------- fixture */

const TOPIC = getTopic("flood-risk")!;

/**
 * Shares chosen so that independent rounding does NOT total 100%.
 *
 * 0.3105, 0.2049, 0.2049, 0.1399, 0.1398 sums to 1.0 exactly, and rounding
 * each to a tenth of a point on its own gives 31.1 + 20.5 + 20.5 + 14.0 + 14.0
 * = 100.1. A fixture whose naive rounding already worked would let the
 * apportionment regress without failing anything.
 */
const SHARES = [0.3105, 0.2049, 0.2049, 0.1399, 0.1398];

const AREA = {
  type: "Feature" as const,
  properties: { name: "Tana River" },
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [38.4332, -3.0731],
        [40.7316, -3.0731],
        [40.7316, -0.0154],
        [38.4332, -0.0154],
        [38.4332, -3.0731],
      ],
    ],
  },
};

const RESULT: RunResult = {
  runId: "r_8f3c21a9c4e1",
  config: {
    topic: "flood-risk",
    areas: [AREA],
    weights: {
      elevation: 0.25,
      slope: 0.15,
      dist_to_river: 0.35,
      rainfall: 0.2,
      landcover: 0.05,
    },
    targetCrs: "EPSG:32637",
    resolution: 30,
    dateWindow: { start: "2024-01-01", end: "2024-12-31" },
    publishLayers: false,
  },
  generatedAt: "2026-09-14T15:09:44Z",
  indicator: { id: "fhi", label: "Flood Hotspot Index" },
  breaks: [1.82, 2.41, 3.05, 3.76],
  classes: [
    { class: 1, label: "Very low", pixels: 412033, areaKm2: 370.8297, share: SHARES[0] },
    { class: 2, label: "Low", pixels: 271902, areaKm2: 244.7118, share: SHARES[1] },
    { class: 3, label: "Moderate", pixels: 271902, areaKm2: 244.7118, share: SHARES[2] },
    { class: 4, label: "High", pixels: 185639, areaKm2: 167.0751, share: SHARES[3] },
    { class: 5, label: "Very high", pixels: 185506, areaKm2: 166.9554, share: SHARES[4] },
  ],
  contribution: {
    dist_to_river: 0.38,
    elevation: 0.24,
    rainfall: 0.18,
    slope: 0.16,
    landcover: 0.04,
  },
  validPixels: 1326982,
  grid: { crs: "EPSG:32637", resolution: 30, width: 928, height: 922 },
  rasters: {
    index: "/srv/runs/r_8f3c21a9c4e1/index.tif",
    classes: "/srv/runs/r_8f3c21a9c4e1/classes.tif",
  },
  layers: [],
};

const LABELS: Readonly<Record<string, string>> = {
  elevation: "Elevation",
  slope: "Slope",
  dist_to_river: "Distance to river",
  rainfall: "Rainfall",
  // `landcover` is deliberately absent, so the id fallback is exercised.
};

function renderView(overrides: Partial<RunResult> = {}) {
  return render(
    <ResultView
      topic={TOPIC}
      result={{ ...RESULT, ...overrides }}
      criterionLabels={LABELS}
      reviewHref={"/topics/flood-risk/review" as Route}
      rerunHref={"/topics/flood-risk/review?rerun=r_8f3c21a9c4e1" as Route}
    />,
  );
}

/** The class table, found the way a reader finds it: by its caption. */
function classTableEl(): HTMLElement {
  return screen.getByRole("table", { name: /class table/i });
}

/* -------------------------------------------------------------- S2 classes */

describe("ResultView, the class table", () => {
  it("renders every class with its label, pixels, area and share", () => {
    renderView();
    const rows = within(classTableEl()).getAllByRole("row");

    // One header row, five class rows, one total row.
    expect(rows).toHaveLength(7);

    // 31.0, not the 31.1 an independent round would give: the largest-remainder
    // pass hands the four leftover tenths to the rows with the biggest
    // discarded fractions (.9, .9, .9, .8), and "Very low" (.5) is the row that
    // gives one up so the column can total 100.0.
    const expected = [
      { label: "Very low", pixels: "412,033", area: "370.8", share: "31.0%" },
      { label: "Low", pixels: "271,902", area: "244.7", share: "20.5%" },
      { label: "Moderate", pixels: "271,902", area: "244.7", share: "20.5%" },
      { label: "High", pixels: "185,639", area: "167.1", share: "14.0%" },
      { label: "Very high", pixels: "185,506", area: "167.0", share: "14.0%" },
    ];

    expected.forEach((want, index) => {
      const row = within(classTableEl()).getByRole("row", {
        name: new RegExp(`^${want.label}\\b`),
      });
      const cells = within(row).getAllByRole("cell");
      // rowheader is the label; the four cells are range, pixels, area, share.
      expect(within(row).getByRole("rowheader")).toHaveTextContent(want.label);
      expect(cells[1]).toHaveTextContent(want.pixels);
      expect(cells[2]).toHaveTextContent(want.area);
      expect(cells[3]).toHaveTextContent(want.share);
      expect(rows[index + 1]).toBe(row);
    });
  });

  it("shows shares that add to exactly 100%, and says so", () => {
    renderView();

    const shares = within(classTableEl())
      .getAllByRole("row")
      .slice(1, 6)
      .map((row) => within(row).getAllByRole("cell")[3].textContent ?? "");

    const total = shares.reduce((sum, text) => sum + Number(text.replace("%", "")), 0);
    // Exactly, not within a tolerance: the whole point of the apportionment is
    // that the column a reader adds up comes to 100.0.
    expect(Number(total.toFixed(1))).toBe(100);

    const totalRow = within(classTableEl()).getByRole("row", { name: /^Total\b/ });
    expect(within(totalRow).getAllByRole("cell")[3]).toHaveTextContent("100.0%");
  });

  it("shows the totals for pixels and area", () => {
    renderView();
    const totalRow = within(classTableEl()).getByRole("row", { name: /^Total\b/ });
    const cells = within(totalRow).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("1,326,982");
    expect(cells[2]).toHaveTextContent("1,194.3");
  });

  it("refuses to force 100% when the service's shares do not sum to one", () => {
    renderView({
      classes: RESULT.classes.map((row) => ({ ...row, share: 0.1 })),
    });
    expect(screen.getByTestId("share-sum-warning")).toHaveTextContent(
      /do not add to 100%/i,
    );
  });
});

/* --------------------------------------------------------------- S3 breaks */

describe("ResultView, the Jenks breaks", () => {
  it("states every break as a number", () => {
    renderView();
    const list = screen.getByTestId("breaks-list");
    for (const value of ["1.82", "2.41", "3.05", "3.76"]) {
      expect(within(list).getByText(value)).toBeInTheDocument();
    }
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  });

  it("says the breaks came from this run's own distribution", () => {
    renderView();
    expect(
      screen.getByText(/computed from this run's own distribution rather than from a fixed scale/i),
    ).toBeInTheDocument();
  });

  it("turns the breaks into each class's index range", () => {
    renderView();
    const rangeOf = (label: string) =>
      within(
        within(classTableEl()).getByRole("row", { name: new RegExp(`^${label}\\b`) }),
      ).getAllByRole("cell")[0];

    expect(rangeOf("Very low")).toHaveTextContent("below 1.82");
    expect(rangeOf("Moderate")).toHaveTextContent("2.41 to 3.05");
    expect(rangeOf("Very high")).toHaveTextContent("3.76 and above");
  });
});

/* --------------------------------------------------------- S4 contribution */

describe("ResultView, per-criterion contribution", () => {
  it("is labelled as mean(risk) x weight, normalised", () => {
    renderView();
    const panel = screen.getByRole("heading", { name: /per-criterion contribution/i });
    expect(panel).toBeInTheDocument();
    expect(screen.getByText(/mean\(risk\) × weight, normalised/i)).toBeInTheDocument();
  });

  it("carries the sentence that it is not feature importance", () => {
    renderView();
    expect(
      screen.getByText(
        /this is not feature importance and it is not a sensitivity analysis/i,
      ),
    ).toBeInTheDocument();
  });

  it("uses the criterion labels, and falls back to the id when one is missing", () => {
    renderView();
    const list = screen.getByTestId("contribution-list");
    expect(within(list).getByText("Distance to river")).toBeInTheDocument();
    expect(within(list).getByText("Elevation")).toBeInTheDocument();
    // No label was supplied for `landcover`, so the id itself is shown.
    expect(within(list).getByText("landcover")).toBeInTheDocument();
  });

  it("shows each criterion's weight beside its contribution", () => {
    renderView();
    const list = screen.getByTestId("contribution-list");
    const rows = within(list).getAllByRole("listitem");
    // Sorted by contribution, descending: dist_to_river (0.38) leads.
    expect(rows[0]).toHaveTextContent("Distance to river");
    expect(rows[0]).toHaveTextContent("38.0%");
    expect(rows[0]).toHaveTextContent("weight 35.0%");
    expect(rows[0]).toHaveTextContent(/3\.0 points above its weight/);
  });
});

/* ------------------------------------------------------------- S5 the method */

describe("ResultView, the method", () => {
  it("names the weighted overlay on the page", () => {
    renderView();
    expect(
      screen.getByText(/this is a weighted overlay, not a model/i),
    ).toBeInTheDocument();
  });

  it("never renders model vocabulary", () => {
    const { container } = renderView();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/AUC|R²|prediction|forecast/i);
  });

  it("keeps model vocabulary out of every export too", () => {
    const banned = /AUC|R²|prediction|forecast/i;
    expect(classTableCsv(RESULT, LABELS)).not.toMatch(banned);
    expect(resultJson(RESULT)).not.toMatch(banned);
    expect(areasGeoJson(RESULT) ?? "").not.toMatch(banned);
  });
});

/* -------------------------------------------------------------- provenance */

describe("ResultView, provenance and actions", () => {
  it("shows the run id, the timestamp, the grid, the valid pixels and the window", () => {
    renderView();
    expect(screen.getAllByText("r_8f3c21a9c4e1").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/14 Sep 2026, 15:09 UTC/).length).toBeGreaterThan(0);
    expect(screen.getByText(/EPSG:32637, 30 m, 928 × 922 px/)).toBeInTheDocument();
    expect(screen.getByText(/1,326,982 of 1,326,982 classified/)).toBeInTheDocument();
    expect(screen.getByText(/1 Jan 2024 to 31 Dec 2024/)).toBeInTheDocument();
  });

  it("offers exactly one forward control and a way back to review", () => {
    renderView();
    expect(
      screen.getByRole("link", { name: /run this configuration again/i }),
    ).toHaveAttribute("href", "/topics/flood-risk/review?rerun=r_8f3c21a9c4e1");
    expect(screen.getByRole("link", { name: /back to review/i })).toHaveAttribute(
      "href",
      "/topics/flood-risk/review",
    );
  });

  it("offers the three downloads as buttons", () => {
    renderView();
    for (const name of [/class table \(CSV\)/i, /full result \(JSON\)/i, /areas \(GeoJSON\)/i]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("draws the areas as an outline and says no class raster is drawn", () => {
    renderView();
    const figure = screen.getByRole("img", { name: /outline of the 1 area this run covered/i });
    expect(figure.querySelectorAll("path")).toHaveLength(1);
    expect(
      screen.getByText(/the classified raster is written to the service's own filesystem/i),
    ).toBeInTheDocument();
  });

  it("never puts a server-side raster path on the page", () => {
    const { container } = renderView();
    expect(container.textContent ?? "").not.toContain("/srv/runs/");
  });
});

/* ------------------------------------------------------------ the exports */

describe("the export payloads", () => {
  it("carry the run id, the configuration and the method note", () => {
    const csv = classTableCsv(RESULT, LABELS);
    expect(csv).toContain("r_8f3c21a9c4e1");
    expect(csv).toContain("EPSG:32637");
    expect(csv).toContain("weighted overlay");
    expect(csv).toContain("not feature importance");
    expect(csv).toContain('"Very low","412033"');

    const json = JSON.parse(resultJson(RESULT));
    expect(json.runId).toBe("r_8f3c21a9c4e1");
    expect(json.config.targetCrs).toBe("EPSG:32637");
    expect(json.notice).toMatch(/weighted overlay/i);
    // The service's own file paths are not the reader's business, and shipping
    // them in a file people email around is a small disclosure for no gain.
    expect(json.rasters).toBeUndefined();
    expect(json.rastersNote).toMatch(/Omitted/);

    const geo = JSON.parse(areasGeoJson(RESULT)!);
    expect(geo.type).toBe("FeatureCollection");
    expect(geo.features[0].properties.runId).toBe("r_8f3c21a9c4e1");
    expect(geo.features[0].properties.content).toMatch(/not a result/i);
  });
});

/* ------------------------------------------------------- the view model */

describe("the view model", () => {
  it("apportions by largest remainder and totals exactly 1000 tenths", () => {
    const split = shareSplit(SHARES);
    expect(split.apportioned).toBe(true);
    expect(split.percents.reduce((sum, p) => sum + p * 10, 0)).toBe(1000);
    // No row moves by more than a tenth of a point from its own value.
    split.percents.forEach((percent, index) => {
      expect(Math.abs(percent - SHARES[index] * 100)).toBeLessThanOrEqual(0.1);
    });
  });

  it("refuses to apportion outside the rubric's ±0.001", () => {
    const split = shareSplit([0.5, 0.4]);
    expect(split.withinTolerance).toBe(false);
    expect(split.apportioned).toBe(false);
  });

  it("reports classes the breaks never separated", () => {
    // `natural_breaks` returns fewer breaks than classes - 1 on a surface with
    // fewer distinct values than classes. Those classes are empty, and saying
    // "no break computed" beats rendering an empty range that looks like a bug.
    expect(intervalLabel(1, [2.5])).toBe("below 2.5");
    expect(intervalLabel(2, [2.5])).toBe("2.5 and above");
    expect(intervalLabel(4, [2.5])).toBe("no break computed");
    expect(intervalLabel(3, [])).toBe("whole range, no break computed");
  });

  it("projects an area outline and returns null when there is nothing to draw", () => {
    const outline = areaOutline([AREA]);
    expect(outline?.paths).toHaveLength(1);
    expect(outline?.bounds).toEqual([38.4332, -3.0731, 40.7316, -0.0154]);
    // Longitude is scaled by cos(mean latitude), so a box 2.2984° wide and
    // 3.0577° tall stays taller than it is wide rather than being stretched.
    const [, , width, height] = (outline?.viewBox ?? "").split(" ").map(Number);
    expect(width).toBeLessThan(height);

    expect(areaOutline([])).toBeNull();
    expect(areaOutline([{ type: "Point", coordinates: [1, 2] }])).toBeNull();
  });
});
