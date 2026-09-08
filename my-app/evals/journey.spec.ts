import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bareShp,
  makePointShapefileZip,
  makePolygonShapefileZip,
  makeZip,
  rect,
} from "../lib/geo/__tests__/fixtures/make-shapefile";
import { TOPICS } from "../lib/analysis/topics";
import { MODELS } from "../lib/analysis/models";

/**
 * The journey eval.
 *
 * Scored against the frozen rubric written before any of this was built. The
 * gate lane (vitest) proves the pure rules; this lane proves the three area
 * selection methods actually work in a browser, that a selection moves the
 * viewport, and that the whole flow fits the stated budget.
 *
 * Every locator here is a role or an accessible name, not a CSS class, so this
 * file is also the DOM contract: it fails if a control loses its label, which
 * is the same thing that would break a screen reader.
 */

/** Where in Kenya the map is clicked. Roughly central, inside the initial view. */
const CLICK_FRACTION = { x: 0.5, y: 0.45 };

let fixtureDir: string;
let counties: string;
let singleCounty: string;
let pointsOnly: string;
let notAShapefile: string;
let corruptZip: string;
let bareShapefile: string;

test.beforeAll(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), "ra-eval-"));

  const write = (name: string, bytes: Buffer) => {
    const path = join(fixtureDir, name);
    writeFileSync(path, bytes);
    return path;
  };

  // Five named boxes across northern Kenya, so the comparison path has real
  // multi-feature input rather than a single polygon repeated.
  counties = write(
    "counties.zip",
    makePolygonShapefileZip({
      base: "counties",
      polygons: [
        rect(37.9, 2.2, 38.4, 2.7),
        rect(35.5, 3.0, 36.1, 3.6),
        rect(39.5, 1.0, 40.1, 1.6),
        rect(36.8, 0.4, 37.3, 0.9),
        rect(40.2, -0.6, 40.8, 0.0),
      ],
      rows: [
        { NAME: "Marsabit" },
        { NAME: "Turkana" },
        { NAME: "Wajir" },
        { NAME: "Laikipia" },
        { NAME: "Garissa" },
      ],
    }),
  );

  singleCounty = write(
    "isiolo.zip",
    makePolygonShapefileZip({
      base: "isiolo",
      polygons: [rect(37.4, 0.2, 38.0, 0.8)],
      rows: [{ NAME: "Isiolo" }],
    }),
  );

  pointsOnly = write(
    "boreholes.zip",
    makePointShapefileZip([
      [37.9, 2.2],
      [35.5, 3.0],
    ]),
  );

  notAShapefile = write("rainfall.csv", Buffer.from("station,mm\nMarsabit,212\n"));

  // The input that used to hang the parser. See lib/geo/zip.ts.
  corruptZip = write("corrupt.zip", Buffer.from("PK and then nothing valid at all"));

  bareShapefile = write("block.shp", bareShp([rect(37.9, 2.2, 38.1, 2.4)]));

  // Referenced so an unused-import lint cannot quietly drop the helper.
  expect(makeZip({ "a.txt": "x" }).length).toBeGreaterThan(0);
});

/** Fail the test on any console error or unhandled rejection (rubric: auto-fail). */
function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

/** The map's own centre/zoom readout, which is real user-facing output. */
async function readView(page: Page) {
  const readout = page.getByTestId("map-view");
  await expect(readout).toBeVisible();
  return {
    lat: Number(await readout.getAttribute("data-lat")),
    lng: Number(await readout.getAttribute("data-lng")),
    zoom: Number(await readout.getAttribute("data-zoom")),
  };
}

/**
 * Click inside the map canvas at a fraction of its box.
 *
 * locator.click with a position, not page.mouse.click with page coordinates:
 * the locator API scrolls the element into view first and treats the position
 * as element-relative, so this cannot silently miss when the page is scrolled.
 */
async function clickMap(page: Page, fraction = CLICK_FRACTION) {
  const map = page.getByTestId("aoi-map");
  await expect(map).toBeVisible();
  const box = await map.boundingBox();
  if (!box) throw new Error("map has no bounding box");
  await map.click({
    position: { x: box.width * fraction.x, y: box.height * fraction.y },
  });
}

const selectedAreas = (page: Page) =>
  page.getByRole("region", { name: /selected areas/i });

const areaRows = (page: Page) => selectedAreas(page).getByRole("listitem");

async function gotoTopic(page: Page, slug: string) {
  await page.goto(`/topics/${slug}`);
  // The map is dynamically imported, so wait for it rather than for load.
  await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });
}

/* ------------------------------------------------------------------ homepage */

test.describe("homepage", () => {
  test("H1, H2, H3: names the app, links all four topics, says what each answers", async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /rangeland awareness/i,
    );

    for (const topic of TOPICS) {
      const link = page.getByRole("link", { name: new RegExp(topic.name, "i") });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `/topics/${topic.slug}`);
      // H3: the card carries the question, not only the name.
      await expect(link).toContainText(topic.question);
    }

    expect(problems).toEqual([]);
  });

  test("H4: every topic is keyboard reachable and activates on Enter", async ({
    page,
  }) => {
    await page.goto("/");

    const reached: string[] = [];
    // Walk the tab order and collect the topic links found, rather than
    // assuming a fixed number of tab stops before them.
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press("Tab");
      const href = await page.evaluate(
        () => document.activeElement?.getAttribute("href") ?? "",
      );
      if (href.startsWith("/topics/") && !reached.includes(href)) reached.push(href);
      if (reached.length === TOPICS.length) break;
    }
    expect(reached.sort()).toEqual(TOPICS.map((t) => `/topics/${t.slug}`).sort());

    // And Enter on a focused topic link navigates.
    await page.goto("/");
    await page.getByRole("link", { name: /flood risk/i }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/topics\/flood-risk$/);
  });

  test("H5: no horizontal scroll at 360px", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "narrow viewport only");
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

/* ----------------------------------------------------------------- topic page */

test.describe("topic page", () => {
  test("T1: every topic slug is a real, reloadable URL titled with its topic", async ({
    page,
  }) => {
    for (const topic of TOPICS) {
      await gotoTopic(page, topic.slug);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        topic.name,
      );
      await expect(page).toHaveTitle(new RegExp(topic.name, "i"));
    }
  });

  test("C4: an unknown topic slug is a 404, not a blank page", async ({ page }) => {
    const response = await page.goto("/topics/not-a-real-topic");
    expect(response?.status()).toBe(404);
    await expect(page.locator("body")).toContainText(/not found/i);
  });

  test("T2: analysis type is selectable and changes what the page permits", async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await gotoTopic(page, "drought-monitoring");

    const single = page.getByRole("radio", { name: /single location/i });
    const comparison = page.getByRole("radio", { name: /multiple location/i });
    await expect(single).toBeChecked();

    // Single caps at one area: a second click replaces rather than accumulates.
    await clickMap(page);
    await expect(areaRows(page)).toHaveCount(1);
    await clickMap(page, { x: 0.35, y: 0.6 });
    await expect(areaRows(page)).toHaveCount(1);

    // Comparison accumulates.
    await comparison.click();
    await expect(comparison).toBeChecked();
    await clickMap(page, { x: 0.65, y: 0.35 });
    await expect(areaRows(page)).toHaveCount(2);

    expect(problems).toEqual([]);
  });

  test("T3: exactly one model is active, and all three are offered", async ({
    page,
  }) => {
    await gotoTopic(page, "flood-risk");

    for (const model of MODELS) {
      await expect(
        page.getByRole("radio", { name: new RegExp(model.label, "i") }),
      ).toBeVisible();
    }

    const xgboost = page.getByRole("radio", { name: /xgboost/i });
    await xgboost.click();
    await expect(xgboost).toBeChecked();
    await expect(page.getByRole("radio", { name: /random forest/i })).not.toBeChecked();
    await expect(
      page.getByRole("radio", { name: /combined model/i }),
    ).not.toBeChecked();
  });

  test("T4a and T5: clicking the map selects a point and zooms to it", async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await gotoTopic(page, "flood-risk");

    const before = await readView(page);
    await clickMap(page);

    await expect(areaRows(page)).toHaveCount(1);

    // T5, the most-cited requirement: the viewport must actually move.
    await expect
      .poll(async () => (await readView(page)).zoom, { timeout: 10_000 })
      .toBeGreaterThan(before.zoom);

    const after = await readView(page);
    expect(after.zoom).toBeGreaterThan(before.zoom);
    // And it must have zoomed to a sane level, not slammed to max.
    expect(after.zoom).toBeLessThanOrEqual(14);

    expect(problems).toEqual([]);
  });

  test("T4b: drawing a box selects the drawn area and zooms to it", async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await gotoTopic(page, "rangeland-dynamics");

    const before = await readView(page);
    await page.getByRole("radio", { name: /draw a box/i }).click();

    // Two corners, which is how geoman's Rectangle tool completes. Driven
    // through clickMap so that on a touch device these dispatch taps, not
    // mouse events that Leaflet's touch path would ignore.
    await clickMap(page, { x: 0.35, y: 0.35 });
    await clickMap(page, { x: 0.6, y: 0.62 });

    await expect(areaRows(page)).toHaveCount(1);
    await expect
      .poll(async () => (await readView(page)).zoom, { timeout: 10_000 })
      .toBeGreaterThan(before.zoom);

    // The drawn area reports a real area, so the geometry survived the round trip.
    await expect(areaRows(page).first()).toContainText(/km2/);

    expect(problems).toEqual([]);
  });

  test("T4c and T5: uploading a shapefile renders and zooms to it", async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await gotoTopic(page, "food-security");

    const before = await readView(page);
    await page.getByLabel(/upload shapefile/i).setInputFiles(singleCounty);

    await expect(areaRows(page)).toHaveCount(1);
    // The name comes from the .dbf attribute table, proving it was really parsed.
    await expect(areaRows(page).first()).toContainText("Isiolo");

    await expect
      .poll(async () => (await readView(page)).zoom, { timeout: 10_000 })
      .toBeGreaterThan(before.zoom);

    expect(problems).toEqual([]);
  });

  test("T4c: a multi-feature shapefile fills a comparison in one upload", async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await gotoTopic(page, "drought-monitoring");

    await page.getByRole("radio", { name: /multiple location/i }).click();
    await page.getByLabel(/upload shapefile/i).setInputFiles(counties);

    await expect(areaRows(page)).toHaveCount(5);
    await expect(selectedAreas(page)).toContainText("Marsabit");
    await expect(selectedAreas(page)).toContainText("Garissa");

    expect(problems).toEqual([]);
  });

  test("T6: every selected area is individually removable", async ({ page }) => {
    await gotoTopic(page, "drought-monitoring");
    await page.getByRole("radio", { name: /multiple location/i }).click();
    await page.getByLabel(/upload shapefile/i).setInputFiles(counties);
    await expect(areaRows(page)).toHaveCount(5);

    await areaRows(page)
      .filter({ hasText: "Wajir" })
      .getByRole("button", { name: /remove/i })
      .click();

    await expect(areaRows(page)).toHaveCount(4);
    await expect(selectedAreas(page)).not.toContainText("Wajir");
    // The others survive.
    await expect(selectedAreas(page)).toContainText("Marsabit");
  });

  test("T7: comparison to single tells the user what it dropped", async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await gotoTopic(page, "flood-risk");

    await page.getByRole("radio", { name: /multiple location/i }).click();
    await page.getByLabel(/upload shapefile/i).setInputFiles(counties);
    await expect(areaRows(page)).toHaveCount(5);

    await page.getByRole("radio", { name: /single location/i }).click();

    // One area kept, and an explicit notice naming the loss. Silent truncation
    // is the failure this checks for.
    await expect(areaRows(page)).toHaveCount(1);
    const notice = page.getByTestId("selection-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/4 earlier areas were removed/i);
    await expect(notice).toContainText(/kept/i);

    // The loss is reversible, and the button names what comes back rather
    // than just saying "Undo".
    const restore = notice.getByRole("button", { name: /restore 4 areas/i });
    await expect(restore).toBeVisible();
    await restore.click();

    await expect(areaRows(page)).toHaveCount(5);
    await expect(
      page.getByRole("radio", { name: /multiple location/i }),
    ).toBeChecked();
    await expect(page.getByTestId("selection-notice")).toBeHidden();

    // Restored in the original build order, so a comparison is not reordered.
    await expect(areaRows(page).first()).toContainText("Marsabit");
    await expect(areaRows(page).last()).toContainText("Garissa");

    expect(problems).toEqual([]);
  });

  test("T7: the pre-warning is announced, not only shown", async ({ page }) => {
    await gotoTopic(page, "flood-risk");
    await page.getByRole("radio", { name: /multiple location/i }).click();
    await page.getByLabel(/upload shapefile/i).setInputFiles(counties);
    await expect(areaRows(page)).toHaveCount(5);

    // The consequence has to reach a screen reader before the click, which
    // means the unselected radio must be described by the warning text.
    const single = page.getByRole("radio", { name: /single location/i });
    const describedBy = await single.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    const described = await page.evaluate(
      (ids) =>
        (ids ?? "")
          .split(" ")
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" "),
      describedBy,
    );
    expect(described).toMatch(/removes 4 of your 5 selected areas/i);
  });

  test("T8: run is disabled with a stated reason until the request is complete", async ({
    page,
  }) => {
    await gotoTopic(page, "flood-risk");

    const run = page.getByRole("button", { name: /run analysis/i });
    await expect(run).toBeDisabled();
    // The reason must be on the page, not only in a tooltip.
    await expect(page.getByTestId("run-blocked-reason")).toContainText(
      /click the map|select an area/i,
    );

    await clickMap(page);
    await expect(areaRows(page)).toHaveCount(1);
    await expect(run).toBeEnabled();

    // Comparison needs two, so switching back to an incomplete state re-blocks.
    await page.getByRole("radio", { name: /multiple location/i }).click();
    await expect(run).toBeDisabled();
    await expect(page.getByTestId("run-blocked-reason")).toContainText(
      /at least 2 areas/i,
    );
  });

  test("T8: running emits a validated request carrying every choice", async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await gotoTopic(page, "rangeland-dynamics");

    await page.getByRole("radio", { name: /xgboost/i }).click();
    await clickMap(page);
    await expect(areaRows(page)).toHaveCount(1);

    await page.getByRole("button", { name: /run analysis/i }).click();

    const payload = page.getByTestId("analysis-request");
    await expect(payload).toBeVisible();

    const request = JSON.parse((await payload.textContent()) ?? "{}");
    expect(request).toMatchObject({
      schemaVersion: "1.0.0",
      topic: "rangeland-dynamics",
      analysisType: "single",
      model: "xgboost",
    });
    expect(request.areas).toHaveLength(1);
    expect(request.areas[0].source).toBe("point");
    expect(request.areas[0].bounds).toHaveLength(2);

    expect(problems).toEqual([]);
  });

  test("T9: a bad upload explains itself and keeps prior selections", async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await gotoTopic(page, "flood-risk");

    // Establish a selection that must survive every failed upload below.
    await page.getByRole("radio", { name: /multiple location/i }).click();
    await page.getByLabel(/upload shapefile/i).setInputFiles(singleCounty);
    await expect(areaRows(page)).toHaveCount(1);

    const upload = page.getByLabel(/upload shapefile/i);
    // By test id, not by role: Next injects its own role="alert" route
    // announcer into every page, so getByRole("alert") is ambiguous.
    const alert = page.getByTestId("shapefile-error");

    // Wrong file type entirely.
    await upload.setInputFiles(notAShapefile);
    await expect(alert).toContainText(/not a shapefile/i);
    await expect(areaRows(page)).toHaveCount(1);

    // The zip that used to hang the parser. It must fail fast, not freeze.
    const started = Date.now();
    await upload.setInputFiles(corruptZip);
    await expect(alert).toContainText(/not a zip archive/i);
    expect(Date.now() - started).toBeLessThan(15_000);
    await expect(areaRows(page)).toHaveCount(1);

    // Points where polygons are needed.
    await upload.setInputFiles(pointsOnly);
    await expect(alert).toContainText(/polygon/i);
    await expect(areaRows(page)).toHaveCount(1);

    // And the page is still usable afterwards. Six, not five: the Isiolo area
    // selected before the three failures is still there, which is the whole
    // point of this test.
    await upload.setInputFiles(counties);
    await expect(areaRows(page)).toHaveCount(6);
    await expect(selectedAreas(page)).toContainText("Isiolo");

    expect(problems).toEqual([]);
  });

  test("T9: a bare .shp is read, with a warning that it has no names", async ({
    page,
  }) => {
    await gotoTopic(page, "flood-risk");
    await page.getByLabel(/upload shapefile/i).setInputFiles(bareShapefile);

    await expect(areaRows(page)).toHaveCount(1);
    await expect(page.getByRole("status").filter({ hasText: /geometry only/i })).toBeVisible();
  });

  test("T10: the route renders server-side without Leaflet touching window", async ({
    request,
  }) => {
    // Fetched without a browser runtime, so an SSR crash shows up as a 500.
    const response = await request.get("/topics/flood-risk");
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain("Flood risk");

    // Leaflet must not have rendered on the server. Asserted on Leaflet's own
    // container class rather than on the test id: the test id sits on a plain
    // wrapper that IS server-rendered, and only the Leaflet subtree inside it
    // is ssr:false. leaflet-container is the class Leaflet adds when it
    // initialises, so its absence is the real signal.
    expect(html).not.toContain("leaflet-container");
    // The loading fallback is what stands in for it server-side.
    expect(html).toContain("Loading map");
  });

  test("T11: every control has an accessible name", async ({ page }) => {
    await gotoTopic(page, "flood-risk");

    // Radio groups are named, so a screen reader announces what the choice is.
    await expect(
      page.getByRole("radiogroup", { name: /analysis type/i }),
    ).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: /model/i })).toBeVisible();
    await expect(
      page.getByRole("radiogroup", { name: /map tool/i }),
    ).toBeVisible();

    // No control anywhere on the page is left unnamed.
    const unnamed = await page.evaluate(() => {
      const controls = Array.from(
        document.querySelectorAll("button, input, select, textarea, a[href]"),
      );
      return controls
        .filter((el) => {
          const element = el as HTMLElement;
          if (element.offsetParent === null && element.tagName !== "INPUT") {
            return false;
          }
          const text = (element.textContent ?? "").trim();
          const label =
            element.getAttribute("aria-label") ??
            element.getAttribute("title") ??
            (element.id
              ? document.querySelector(`label[for="${element.id}"]`)?.textContent
              : null) ??
            element.closest("label")?.textContent ??
            "";
          return text === "" && (label ?? "").trim() === "";
        })
        .map((el) => `${el.tagName}.${(el as HTMLElement).className}`);
    });
    expect(unnamed).toEqual([]);
  });

  test("T11: the flow completes with the keyboard, without touching the map", async ({
    page,
  }) => {
    await gotoTopic(page, "flood-risk");

    // Upload is the keyboard-accessible selection path, so it must be enough
    // on its own to reach a runnable request.
    await page.getByLabel(/upload shapefile/i).setInputFiles(singleCounty);
    await expect(areaRows(page)).toHaveCount(1);

    await page.getByRole("radio", { name: /combined model/i }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("radio", { name: /combined model/i })).toBeChecked();

    const run = page.getByRole("button", { name: /run analysis/i });
    await run.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("analysis-request")).toBeVisible();
  });

  test("T4d and T11: a typed coordinate adds a real polygon and zooms to it", async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await gotoTopic(page, "flood-risk");

    const before = await readView(page);

    // Pasted in the one-string form coordinates actually arrive in, then
    // Enter, so the whole path is keyboard only.
    await page.getByLabel(/^coordinates$/i).fill("2.4512, 36.8203");
    await page.getByLabel(/radius km/i).fill("15");
    await page.getByLabel(/^coordinates$/i).press("Enter");

    await expect(areaRows(page)).toHaveCount(1);
    const row = areaRows(page).first();
    await expect(row).toContainText("2.4512N 36.8203E +15km");
    // A real polygon, so it reports an area rather than reading as a point.
    await expect(row).toContainText(/km2/);
    await expect(row).toContainText(/coordinates/i);

    await expect
      .poll(async () => (await readView(page)).zoom, { timeout: 10_000 })
      .toBeGreaterThan(before.zoom);

    expect(problems).toEqual([]);
  });

  test("T9: a bad coordinate explains itself and adds nothing", async ({ page }) => {
    await gotoTopic(page, "flood-risk");

    await page.getByLabel(/^coordinates$/i).fill("Marsabit");
    await page.getByLabel(/^coordinates$/i).press("Enter");

    await expect(page.getByTestId("coordinate-error")).toContainText(
      /could not read/i,
    );
    await expect(areaRows(page)).toHaveCount(0);
  });

  test("a coordinate outside Kenya warns but is still accepted", async ({
    page,
  }) => {
    await gotoTopic(page, "flood-risk");

    // A cross-border catchment is a real analysis, so this must not be blocked.
    await page.getByLabel(/^coordinates$/i).fill("9.03, 38.74");
    await page.getByLabel(/^coordinates$/i).press("Enter");

    await expect(areaRows(page)).toHaveCount(1);
    await expect(
      page.getByRole("status").filter({ hasText: /outside Kenya/i }),
    ).toBeVisible();
  });

  test("T1: type and model round trip through the URL for bookmarking", async ({
    page,
  }) => {
    // A bookmarked configuration must be correct on the first paint, not after
    // a flash of the defaults.
    await page.goto("/topics/drought-monitoring?type=comparison&model=combined");
    await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole("radio", { name: /multiple location/i }),
    ).toBeChecked();
    await expect(page.getByRole("radio", { name: /combined model/i })).toBeChecked();

    // And changing a choice updates the URL without adding history entries.
    await page.getByRole("radio", { name: /xgboost/i }).click();
    await expect(page).toHaveURL(/model=xgboost/);
    await page.goBack();
    // Back leaves the topic rather than walking through each radio click.
    await expect(page).not.toHaveURL(/\/topics\/drought-monitoring/);
  });

  test("T1: a stale bookmark with unknown values still opens on the defaults", async ({
    page,
  }) => {
    await page.goto("/topics/flood-risk?type=both&model=catboost");
    await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole("radio", { name: /single location/i })).toBeChecked();
    await expect(
      page.getByRole("radio", { name: /random forest/i }),
    ).toBeChecked();
  });

  test("the receipt restates the whole request at any scroll position", async ({
    page,
  }) => {
    await gotoTopic(page, "food-security");
    await page.getByRole("radio", { name: /multiple location/i }).click();
    await page.getByRole("radio", { name: /xgboost/i }).click();
    await page.getByLabel(/upload shapefile/i).setInputFiles(counties);
    await expect(areaRows(page)).toHaveCount(5);

    const receipt = page.getByTestId("request-receipt");
    await expect(receipt).toContainText("Food security assessment");
    await expect(receipt).toContainText("Multiple location comparison");
    await expect(receipt).toContainText("XGBoost");
    await expect(receipt).toContainText("5 areas");
  });

  test("T12: usable at 360px with no horizontal scroll", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "narrow viewport only");
    await gotoTopic(page, "flood-risk");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // The map must still have real height, not be squeezed to nothing.
    const box = await page.getByTestId("aoi-map").boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(220);

    // And the controls must still be reachable and operable.
    await page.getByRole("radio", { name: /multiple location/i }).click();
    await expect(
      page.getByRole("radio", { name: /multiple location/i }),
    ).toBeChecked();
  });

  test("T12: the map size stepper cycles three real heights", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile control only");
    await gotoTopic(page, "flood-risk");

    const stepper = page.getByTestId("map-size-stepper");
    await expect(stepper).toBeVisible();

    const height = async () =>
      (await page.getByTestId("aoi-map").boundingBox())?.height ?? 0;

    const seen: number[] = [await height()];
    for (let i = 0; i < 3; i += 1) {
      await stepper.click();
      // The height is a CSS class change, so wait for it to actually differ.
      await expect
        .poll(height, { timeout: 5000 })
        .not.toBe(seen[seen.length - 1]);
      seen.push(await height());
    }

    // Three distinct stops, and the fourth press returns to the first.
    expect(new Set(seen.slice(0, 3)).size).toBe(3);
    expect(seen[3]).toBeCloseTo(seen[0], 0);
    // Even the smallest stop leaves a usable map.
    expect(Math.min(...seen)).toBeGreaterThan(150);
  });

  test("T12: the remembered map size survives a reload", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile control only");
    await gotoTopic(page, "flood-risk");

    const height = async () =>
      (await page.getByTestId("aoi-map").boundingBox())?.height ?? 0;

    const before = await height();
    await page.getByTestId("map-size-stepper").click();
    await expect.poll(height, { timeout: 5000 }).not.toBe(before);
    const chosen = await height();

    await page.reload();
    await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });

    // Read through an external store with a server snapshot, so this comes
    // back without a hydration mismatch.
    await expect.poll(height, { timeout: 5000 }).toBeCloseTo(chosen, 0);
  });
});

/* -------------------------------------------------------------------- budget */

test.describe("measurable outcome", () => {
  test("cold homepage to a validated request in under 6 clicks and 60s", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "budget measured on desktop");

    const problems = watchConsole(page);
    let clicks = 0;
    const click = async (fn: () => Promise<void>) => {
      clicks += 1;
      await fn();
    };

    const started = Date.now();
    await page.goto("/");

    // 1: choose the topic.
    await click(() => page.getByRole("link", { name: /drought monitoring/i }).click());
    await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });

    // 2: comparison.
    await click(() => page.getByRole("radio", { name: /multiple location/i }).click());

    // 3 and 4: two areas on the map.
    await click(() => clickMap(page, { x: 0.45, y: 0.4 }));
    await click(() => clickMap(page, { x: 0.6, y: 0.55 }));
    await expect(areaRows(page)).toHaveCount(2);

    // 5: the model.
    await click(() => page.getByRole("radio", { name: /combined model/i }).click());

    // 6: run.
    await click(() => page.getByRole("button", { name: /run analysis/i }).click());
    await expect(page.getByTestId("analysis-request")).toBeVisible();

    const elapsed = Date.now() - started;

    // Printed so the budget is traceable, per the measurable-outcome rule.
    console.log(`JOURNEY BUDGET: ${clicks} clicks, ${elapsed}ms elapsed`);
    testInfo.annotations.push({
      type: "budget",
      description: `${clicks} clicks, ${elapsed}ms`,
    });

    expect(clicks).toBeLessThanOrEqual(6);
    expect(elapsed).toBeLessThan(60_000);
    expect(problems).toEqual([]);
  });

  test("no page reload anywhere in the flow", async ({ page }) => {
    await page.goto("/");

    // A full navigation between topic and result would lose selections, so
    // count real document loads after the first.
    let loads = 0;
    page.on("load", () => {
      loads += 1;
    });

    await page.getByRole("link", { name: /flood risk/i }).click();
    await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });
    await clickMap(page);
    await expect(areaRows(page)).toHaveCount(1);
    await page.getByRole("button", { name: /run analysis/i }).click();
    await expect(page.getByTestId("analysis-request")).toBeVisible();

    // Client-side navigation only: the topic link is a Next Link, and running
    // the analysis is local state.
    expect(loads).toBe(0);
  });
});
