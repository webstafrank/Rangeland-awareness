import { expect, test, type Page } from "@playwright/test";
import { TOPICS } from "../lib/analysis/topics";
import { contrastRatio, WCAG } from "../lib/theme/contrast";
import {
  BUDGET_TOKENS,
  CSS_TOKEN_EXPECTATIONS,
  PALETTE_HEX,
} from "../lib/theme/palette";
import {
  BUDGET_WINDOW,
  formatBudget,
  measureFromHistogram,
  type HistogramEntry,
} from "../lib/theme/pixel-budget";

/**
 * Theme eval.
 *
 * The app commits to ONE dark theme. That is a decision worth testing, and the
 * failure it invites is specific: a visitor whose operating system is set to
 * light gets a dark page with light native form controls, light scrollbars and
 * a white autofill highlight painted through it. `color-scheme: dark` is what
 * prevents that, and nothing in a unit test can see whether it is still there.
 *
 * So the theme checks run twice, under an OS preference of light and of dark,
 * and assert the SAME dark result both times. A regression that reintroduces a
 * `prefers-color-scheme` block fails here.
 *
 * The second half of this file is the part that did not exist before: the
 * 60-30-10 balance is measured off the rendered page rather than asserted in a
 * design review. See lib/theme/pixel-budget.ts for why it is measured by role
 * and not by hue.
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

/**
 * Count the colours of a full-page screenshot.
 *
 * The screenshot is taken by the driver, then handed back into the page and
 * decoded by the browser's own PNG decoder into a canvas. That avoids adding
 * an image library to the project for one measurement, and it avoids shipping
 * ~23MB of RGBA across the CDP boundary: only the histogram comes back, which
 * for a flat-design UI is a few thousand entries.
 */
async function colourHistogram(page: Page): Promise<HistogramEntry[]> {
  const png = await page.screenshot({ fullPage: true });
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;

  return page.evaluate(async (url) => {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx === null) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const counts = new Map<number, number>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.entries()].map(
      ([key, count]) =>
        [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff, count] as [
          number,
          number,
          number,
          number,
        ],
    );
  }, dataUrl);
}

const PAGES = [
  { name: "homepage", path: "/" },
  ...TOPICS.map((topic) => ({ name: topic.name, path: `/topics/${topic.slug}` })),
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`OS preference: ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("the page declares color-scheme dark, so native controls match", async ({
      page,
    }) => {
      await page.goto("/");

      // The assertion that matters most under a LIGHT OS preference: without
      // it the browser paints its own chrome light over a dark page, and the
      // scrollbars and autofill give the game away.
      const declared = await page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      );
      expect(declared).toBe("dark");
    });

    test("the ground is dark and the text is light, whatever the OS says", async ({
      page,
    }) => {
      await page.goto("/");

      const background = await luminance(page, "body", "background-color");
      const text = await luminance(page, "body", "color");

      expect(background).not.toBeNull();
      expect(text).not.toBeNull();

      // Dark in both cases. A prefers-color-scheme block sneaking back in
      // would flip these under the light run and fail here.
      expect(background as number).toBeLessThan(0.05);
      expect(text as number).toBeGreaterThan(0.6);

      // And readable, not merely ordered. 7:1 is WCAG AAA for body text.
      expect(contrast(background as number, text as number)).toBeGreaterThan(
        WCAG.AAA_TEXT,
      );
    });

    test("the body ground is painted, never transparent", async ({ page }) => {
      await page.goto("/");
      const painted = await page.evaluate(() => {
        const value = getComputedStyle(document.body).backgroundColor;
        return value !== "transparent" && value !== "rgba(0, 0, 0, 0)";
      });
      expect(painted).toBe(true);
    });

    for (const target of PAGES) {
      test(`${target.name}: text on a surface stays readable`, async ({ page }) => {
        await page.goto(target.path);
        await expect(page.locator("header").first()).toBeVisible();

        const surface = await luminance(page, "header", "background-color");
        const text = await luminance(page, "body", "color");

        expect(surface).not.toBeNull();
        // 4.5:1 is WCAG AA for body text.
        expect(contrast(surface as number, text as number)).toBeGreaterThan(
          WCAG.AA_TEXT,
        );
      });
    }

    test("the primary action carries dark text on the accent, not white", async ({
      page,
    }) => {
      await page.goto("/topics/flood-risk");
      await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });

      // White on #F97316 is 2.80:1 and fails AA. This is the one place the app
      // relies on a saturated colour carrying text, so it is asserted on the
      // rendered button rather than trusted to the palette module.
      const measured = await page.evaluate(() => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (b) => (b.textContent ?? "").trim() === "Run analysis",
        );
        if (!button) return null;
        const style = getComputedStyle(button);
        return { background: style.backgroundColor, color: style.color };
      });

      expect(measured).not.toBeNull();
      const { background, color } = measured as {
        background: string;
        color: string;
      };
      expect(contrastRatio(color, background)).toBeGreaterThan(WCAG.AA_TEXT);

      // And specifically: the label must be the dark on-accent token, so a
      // future edit back to white text fails here rather than in an audit.
      const labelLuminance = await page.evaluate(() => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (b) => (b.textContent ?? "").trim() === "Run analysis",
        );
        const value = getComputedStyle(button as Element).color;
        const match = value.match(/rgba?\(([^)]+)\)/);
        if (!match) return null;
        const [r, g, b] = match[1]
          .split(",")
          .slice(0, 3)
          .map((n) => Number(n.trim()) / 255)
          .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      });
      expect(labelLuminance as number).toBeLessThan(0.1);
    });

    test("no tile filter is applied, so the basemap renders as published", async ({
      page,
    }) => {
      await page.goto("/topics/flood-risk");
      await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });

      // An earlier build inverted OpenStreetMap tiles for dark mode. The dark
      // theme ships a genuinely dark basemap instead, because inverting a map
      // turns water brown and vegetation purple. No filter, on any layer.
      for (const selector of [
        ".leaflet-tile-pane",
        ".basemap-street",
        ".basemap-dark",
      ]) {
        const filter = await page.evaluate((sel) => {
          const element = document.querySelector(sel);
          return element ? getComputedStyle(element).filter : null;
        }, selector);
        expect(filter === null || filter === "none").toBe(true);
      }

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
      await page.goto("/topics/flood-risk");
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

      // Two paths, not one: selected geometry is drawn as a casing beneath a
      // core stroke. No single colour clears 3:1 against light OSM tiles, dark
      // CARTO tiles AND satellite imagery at once (brute-forced over the whole
      // sRGB cube: the best any single colour manages is 1.47:1 worst-case),
      // so the pair is what makes a selection visible on every basemap.
      await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
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

  test("the tokens the browser resolves are the tokens the palette declares", async ({
    page,
  }) => {
    await page.goto("/");

    // The gate test proves globals.css matches palette.ts as text. This proves
    // the browser agrees after the cascade, which catches a token shadowed by
    // a later rule or a Tailwind mapping that silently points somewhere else.
    const resolved = await page.evaluate((names: string[]) => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(
        names.map((name) => [name, style.getPropertyValue(name).trim()]),
      );
    }, Object.keys(CSS_TOKEN_EXPECTATIONS));

    expect(resolved).toEqual(CSS_TOKEN_EXPECTATIONS);
  });
});

test.describe("the 60-30-10 balance is measured, not asserted", () => {
  // These run once, at the default OS preference: the balance is a property of
  // the design, and the theme tests above already prove the design does not
  // change with the OS preference.
  for (const target of [
    { name: "homepage", path: "/", map: false },
    { name: "flood risk workbench", path: "/topics/flood-risk", map: true },
  ]) {
    test(`${target.name} holds its colour budget`, async ({ page }) => {
      await page.goto(target.path);

      if (target.map) {
        await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });
        // Let the basemap paint. A half-loaded map is mostly the container's
        // own fill, which would read as more ground than the page really has.
        await page.waitForTimeout(4000);
      } else {
        await expect(page.locator("header").first()).toBeVisible();
      }

      const budget = measureFromHistogram(await colourHistogram(page), BUDGET_TOKENS);
      const report = `${target.name}: ${formatBudget(budget)}`;

      // Reported on every run, pass or fail, so the trend is visible in the
      // eval log rather than only at the moment something breaks.
      console.log(report);

      expect(budget.ground, report).toBeGreaterThanOrEqual(BUDGET_WINDOW.ground[0]);
      expect(budget.ground, report).toBeLessThanOrEqual(BUDGET_WINDOW.ground[1]);

      expect(budget.structure, report).toBeGreaterThanOrEqual(
        BUDGET_WINDOW.structure[0],
      );
      expect(budget.structure, report).toBeLessThanOrEqual(
        BUDGET_WINDOW.structure[1],
      );

      expect(budget.accent, report).toBeGreaterThanOrEqual(BUDGET_WINDOW.accent[0]);
      expect(budget.accent, report).toBeLessThanOrEqual(BUDGET_WINDOW.accent[1]);
    });
  }

  test("the classifier still recognises the page it is grading", async ({ page }) => {
    // A guard on the measurement itself. If a redesign moved every surface off
    // the palette, the three shares above could still land inside their
    // windows while describing a handful of stray pixels. An unmatched share
    // this high means the budget numbers are not about the real page.
    await page.goto("/");
    await expect(page.locator("header").first()).toBeVisible();

    const budget = measureFromHistogram(await colourHistogram(page), BUDGET_TOKENS);
    const report = formatBudget(budget);
    console.log(`classifier coverage: ${report}`);

    // Text antialiasing and the topic accent tiles are legitimately unmatched,
    // so this is a ceiling on noise, not a demand for perfection.
    expect(budget.unmatched, report).toBeLessThan(0.35);
  });
});

test.describe("the palette module and the shipped stylesheet agree", () => {
  test("every palette colour is a colour the browser can parse", async ({ page }) => {
    // Cheap, but it catches the one failure the text-level gate test cannot:
    // a token whose value is syntactically fine to a regex and meaningless to
    // a browser, such as a stray `var(--gone)`.
    await page.goto("/");

    const unparseable = await page.evaluate((hexes: string[]) => {
      const probe = document.createElement("div");
      document.body.append(probe);
      const bad: string[] = [];
      for (const hex of hexes) {
        probe.style.color = "";
        probe.style.color = hex;
        if (probe.style.color === "") bad.push(hex);
      }
      probe.remove();
      return bad;
    }, PALETTE_HEX);

    expect(unparseable).toEqual([]);
  });
});
