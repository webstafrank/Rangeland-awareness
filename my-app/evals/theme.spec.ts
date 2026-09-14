import { expect, test, type Page } from "@playwright/test";
import { TOPICS } from "../lib/analysis/topics";
import { STEPS } from "../lib/analysis/steps";

/**
 * Theme eval.
 *
 * The app commits to one light theme. That is a decision worth testing,
 * because the failure it invites is specific and easy to ship: a visitor whose
 * operating system is set to dark gets a light page with dark native form
 * controls, dark scrollbars and a dark autofill highlight painted through it.
 * `color-scheme: light` is what prevents that, and nothing in a unit test can
 * see whether it is still there.
 *
 * So every check below runs twice, under an OS preference of light and of
 * dark, and asserts the SAME light result both times. A regression that
 * reintroduces a `prefers-color-scheme` block fails here.
 *
 * Asserted on computed luminance rather than class names, so it fails on what
 * the user experiences instead of on an implementation detail.
 */

/** WCAG relative luminance from a computed `rgb()` string. */
async function luminance(page: Page, selector: string, property: string) {
  return page.evaluate(
    ([sel, prop]) => {
      const element = document.querySelector(sel as string);
      if (!element) return null;
      const value = getComputedStyle(element).getPropertyValue(prop as string);
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;

      const [r, g, b] = match[1]
        .split(",")
        .slice(0, 3)
        .map((n) => Number(n.trim()) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    },
    [selector, property] as const,
  );
}

/** Contrast ratio between two luminances, the WCAG way. */
const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const PAGES = [
  { name: "homepage", path: "/" },
  ...TOPICS.map((topic) => ({ name: topic.name, path: `/topics/${topic.slug}` })),
];

/** Every step of one topic, so the check covers the four routes, not just the first. */
const STEP_PAGES = STEPS.map((step) => ({
  name: `flood-risk ${step.id}`,
  path:
    step.segment === ""
      ? "/topics/flood-risk"
      : `/topics/flood-risk/${step.segment}`,
}));

/** Where the map lives now that the flow is split. */
const AREAS_PATH = "/topics/flood-risk/areas";

for (const scheme of ["light", "dark"] as const) {
  test.describe(`OS preference: ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("the page declares color-scheme light, so native controls match", async ({
      page,
    }) => {
      await page.goto("/");

      // This is the assertion that matters most under a dark OS preference:
      // without it the browser paints its own chrome dark over a light page.
      const declared = await page.evaluate(() =>
        getComputedStyle(document.documentElement).colorScheme,
      );
      expect(declared).toBe("light");
    });

    test("the ground is light and the text is dark, whatever the OS says", async ({
      page,
    }) => {
      await page.goto("/");

      const background = await luminance(page, "body", "background-color");
      const text = await luminance(page, "body", "color");

      expect(background).not.toBeNull();
      expect(text).not.toBeNull();

      // Light in both cases. A prefers-color-scheme block sneaking back in
      // would flip these under the dark run and fail here.
      expect(background as number).toBeGreaterThan(0.7);
      expect(text as number).toBeLessThan(0.2);

      // And readable, not merely ordered. 7:1 is WCAG AAA for body text.
      expect(contrast(background as number, text as number)).toBeGreaterThan(7);
    });

    test("the body ground is painted, never transparent", async ({ page }) => {
      await page.goto("/");
      const painted = await page.evaluate(() => {
        const value = getComputedStyle(document.body).backgroundColor;
        return value !== "transparent" && value !== "rgba(0, 0, 0, 0)";
      });
      expect(painted).toBe(true);
    });

    for (const target of [...PAGES, ...STEP_PAGES]) {
      test(`${target.name}: text on a surface stays readable`, async ({ page }) => {
        await page.goto(target.path);
        await expect(page.locator("header").first()).toBeVisible();

        /*
         * The header is its own band now: a dark blue ground carrying white
         * type, rather than a white bar inheriting the body's ink. So it is
         * graded against ITS OWN colour, which is the pairing a reader
         * actually sees.
         *
         * The earlier version compared the header's background against the
         * BODY's colour. That passed only while the header happened to be
         * white, and it would now fail on a band that is perfectly legible: a
         * test measuring a pair that never appears on screen.
         */
        const headerGround = await luminance(page, "header", "background-color");
        const headerInk = await luminance(page, "header", "color");
        expect(headerGround).not.toBeNull();
        expect(headerInk).not.toBeNull();
        expect(
          contrast(headerGround as number, headerInk as number),
        ).toBeGreaterThan(4.5);

        // And the page body, which is the light half of the same system.
        const bodyGround = await luminance(page, "body", "background-color");
        const bodyInk = await luminance(page, "body", "color");
        expect(contrast(bodyGround as number, bodyInk as number)).toBeGreaterThan(7);

        // The two grounds must genuinely differ, or the band is not a band.
        expect(
          Math.abs((headerGround as number) - (bodyGround as number)),
        ).toBeGreaterThan(0.1);
      });
    }

    test("the primary action has readable contrast against its label", async ({
      page,
    }) => {
      // Run lives on the review step now, and it is only painted red once the
      // request is runnable. A disabled button is a grey well, so measuring
      // that would measure nothing: select an area first, then continue.
      await page.goto(AREAS_PATH);
      await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });
      await page.getByLabel(/^coordinates$/i).fill("2.4512, 36.8203");
      await page.getByLabel(/^coordinates$/i).press("Enter");
      await expect(
        page.getByRole("region", { name: /selected areas/i }).getByRole("listitem"),
      ).toHaveCount(1);
      await page.getByTestId("step-continue").click();
      await expect(page.getByRole("button", { name: /run analysis/i })).toBeEnabled();

      // The run button is white on the action red, which is the one place the
      // app relies on a saturated colour carrying text.
      const ratio = await page.evaluate(() => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (b) => (b.textContent ?? "").trim() === "Run analysis",
        );
        if (!button) return null;
        const style = getComputedStyle(button);

        const lum = (value: string) => {
          const match = value.match(/rgba?\(([^)]+)\)/);
          if (!match) return null;
          const [r, g, b] = match[1]
            .split(",")
            .slice(0, 3)
            .map((n) => Number(n.trim()) / 255)
            .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };

        const bg = lum(style.backgroundColor);
        const fg = lum(style.color);
        if (bg === null || fg === null) return null;
        return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
      });

      expect(ratio).not.toBeNull();
      expect(ratio as number).toBeGreaterThan(4.5);
    });

    test("no tile filter is applied, so the basemap renders as published", async ({
      page,
    }) => {
      await page.goto(AREAS_PATH);
      await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });

      // The two-theme build inverted OpenStreetMap tiles for dark mode. With
      // one light theme the tiles are already correct, and a filter could only
      // make them wrong.
      //
      // Asserted on the tile pane, which always exists. An earlier version also
      // checked `.basemap-street`, a class that has since been deleted along
      // with the filter, so that half of the assertion had quietly become
      // vacuous: querySelector returned null and null passes.
      const pane = await page.evaluate(() => {
        const element = document.querySelector(".leaflet-tile-pane");
        return element ? getComputedStyle(element).filter : "MISSING";
      });
      expect(pane).not.toBe("MISSING");
      expect(pane === "none" || pane === "").toBe(true);

      // And no tile img inherits one either, which is where a filter would
      // actually have to land to discolour the map.
      const tileFilters = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".leaflet-tile"))
          .map((tile) => getComputedStyle(tile).filter)
          .filter((value) => value !== "none" && value !== ""),
      );
      expect(tileFilters).toEqual([]);

      // The Leaflet container still needs an opaque ground, or the gaps
      // between tiles show the page through while panning.
      const painted = await page.evaluate(() => {
        const container = document.querySelector(".leaflet-container");
        if (!container) return false;
        const value = getComputedStyle(container).backgroundColor;
        return value !== "transparent" && value !== "rgba(0, 0, 0, 0)";
      });
      expect(painted).toBe(true);
    });

    test("selected geometry is drawn and not colour-shifted", async ({ page }) => {
      await page.goto(AREAS_PATH);
      await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });

      await page.getByLabel(/^coordinates$/i).fill("2.4512, 36.8203");
      await page.getByLabel(/^coordinates$/i).press("Enter");
      await expect(
        page.getByRole("region", { name: /selected areas/i }).getByRole("listitem"),
      ).toHaveCount(1);

      const overlayFilter = await page.evaluate(() => {
        const pane = document.querySelector(".leaflet-overlay-pane");
        return pane ? getComputedStyle(pane).filter : null;
      });
      expect(overlayFilter === null || overlayFilter === "none").toBe(true);

      await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
    });
  });
}

test.describe("stylesheet discipline", () => {
  test("no prefers-color-scheme rule ships in the app CSS", async ({ page }) => {
    await page.goto("/");

    // Read the rules the browser actually parsed, rather than grepping source.
    // Same-origin stylesheets only, which is all of ours; the Google Fonts
    // sheet is cross-origin and throws on access, so it is skipped.
    const darkRules = await page.evaluate(() => {
      const found: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of Array.from(rules)) {
          const text = rule.cssText;
          if (text.includes("prefers-color-scheme")) found.push(text.slice(0, 120));
        }
      }
      return found;
    });

    expect(darkRules).toEqual([]);
  });
});
