import { expect, test, type Page } from "@playwright/test";
import { TOPICS } from "../lib/analysis/topics";

/**
 * Theme eval.
 *
 * Rubric H6 and the dark-mode half of T12: every colour has to be legible in
 * both themes. The failure this catches is a token whose only definition sits
 * inside a `prefers-color-scheme` block, or a hardcoded colour with no dark
 * counterpart, either of which produces dark text on a dark ground that no
 * unit test can see.
 *
 * Asserted on computed luminance rather than on class names, so it fails on the
 * thing the user experiences instead of on an implementation detail.
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
  ...TOPICS.map((topic) => ({
    name: topic.name,
    path: `/topics/${topic.slug}`,
  })),
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test(`H6: body ground and text are the right way round in ${scheme}`, async ({
      page,
    }) => {
      await page.goto("/");

      const background = await luminance(page, "body", "background-color");
      const text = await luminance(page, "body", "color");

      expect(background).not.toBeNull();
      expect(text).not.toBeNull();

      // The real bug being caught: a token defined only inside a media query
      // leaves one theme with text and ground on the same side.
      if (scheme === "dark") {
        expect(background as number).toBeLessThan(0.2);
        expect(text as number).toBeGreaterThan(0.5);
      } else {
        expect(background as number).toBeGreaterThan(0.7);
        expect(text as number).toBeLessThan(0.2);
      }

      // And they must actually be readable together, not merely ordered.
      expect(contrast(background as number, text as number)).toBeGreaterThan(7);
    });

    test(`H6: the body ground is painted, never transparent in ${scheme}`, async ({
      page,
    }) => {
      await page.goto("/");
      const painted = await page.evaluate(() => {
        const value = getComputedStyle(document.body).backgroundColor;
        return value !== "transparent" && value !== "rgba(0, 0, 0, 0)";
      });
      expect(painted).toBe(true);
    });

    for (const target of PAGES) {
      test(`H6: ${target.name} text on surface is readable in ${scheme}`, async ({
        page,
      }) => {
        await page.goto(target.path);
        // The header is the surface token on every page, so it is the one
        // element guaranteed present to measure.
        await expect(page.locator("header")).toBeVisible();

        const surface = await luminance(page, "header", "background-color");
        const text = await luminance(page, "body", "color");

        expect(surface).not.toBeNull();
        expect(contrast(surface as number, text as number)).toBeGreaterThan(4.5);
      });
    }

    test(`the map is legible in ${scheme}`, async ({ page }) => {
      await page.goto("/topics/flood-risk");
      await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });

      // OpenStreetMap only ships light tiles, so dark mode inverts them. The
      // filter must land on the street basemap's own container and NOT on the
      // tile pane, or satellite imagery would be inverted too (vegetation
      // turns magenta) and no child could undo it.
      const streetFilter = await page.evaluate(() => {
        const layer = document.querySelector(".basemap-street");
        return layer ? getComputedStyle(layer).filter : null;
      });
      const paneFilter = await page.evaluate(() => {
        const pane = document.querySelector(".leaflet-tile-pane");
        return pane ? getComputedStyle(pane).filter : null;
      });

      expect(paneFilter === null || paneFilter === "none").toBe(true);

      if (scheme === "dark") {
        expect(streetFilter).toContain("invert");
      } else {
        expect(streetFilter === null || streetFilter === "none").toBe(true);
      }

      // The Leaflet container must carry an opaque ground either way, or the
      // gaps between tiles show the page through.
      const containerPainted = await page.evaluate(() => {
        const container = document.querySelector(".leaflet-container");
        if (!container) return false;
        const value = getComputedStyle(container).backgroundColor;
        return value !== "transparent" && value !== "rgba(0, 0, 0, 0)";
      });
      expect(containerPainted).toBe(true);
    });

    test(`the selected-area accent is visible in ${scheme}`, async ({ page }) => {
      await page.goto("/topics/flood-risk");
      await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });

      await page.getByLabel(/^coordinates$/i).fill("2.4512, 36.8203");
      await page.getByLabel(/^coordinates$/i).press("Enter");
      await expect(
        page.getByRole("region", { name: /selected areas/i }).getByRole("listitem"),
      ).toHaveCount(1);

      // Drawn geometry lives in the overlay pane, which must never inherit the
      // dark-mode inversion: a teal polygon would come out magenta.
      const overlayFilter = await page.evaluate(() => {
        const pane = document.querySelector(".leaflet-overlay-pane");
        return pane ? getComputedStyle(pane).filter : null;
      });
      expect(overlayFilter === null || overlayFilter === "none").toBe(true);

      // And the polygon is actually on the map.
      await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
    });
  });
}
