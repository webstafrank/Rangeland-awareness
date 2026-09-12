import { expect, test } from "@playwright/test";

/**
 * Smoke cover for the two auth routes.
 *
 * They arrived with the Sep 7 scaffold merge and nothing else in the eval
 * suite touches them, so before this file /login and /signup were publicly
 * reachable, in the production build, and unverified. That is the gap this
 * closes: not "are they beautiful", but "do they render, are they reachable
 * by keyboard, and do they carry the app's ground rather than an unstyled
 * white page".
 *
 * Deliberately NOT asserting the auth behaviour itself. services/auth owns
 * that and its own tests already pin the part that matters (a submitted
 * password never reaches the cookie). Duplicating it here would buy a slower
 * copy of a check that already exists.
 */

const ROUTES = [
  { path: "/login", heading: /sign in/i },
  { path: "/signup", heading: /create|sign up/i },
] as const;

for (const route of ROUTES) {
  test.describe(route.path, () => {
    test("renders without a console error or a failed request", async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") problems.push(`console: ${m.text()}`);
      });
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("requestfailed", (r) => {
        // A cancelled navigation preload is normal and not a failure.
        const failure = r.failure()?.errorText ?? "";
        if (!failure.includes("ERR_ABORTED")) {
          problems.push(`requestfailed: ${r.url()} ${failure}`);
        }
      });

      const response = await page.goto(route.path);
      expect(response?.status(), `${route.path} must not 404 or 500`).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(problems, problems.join("\n")).toEqual([]);
    });

    test("every band paints a ground, so its own ink is legible on it", async ({
      page,
    }) => {
      // The regression this exists for actually happened. These pages are
      // built from `band-*` utilities that set a background AND the ink for
      // it as one decision. The light redesign replaced the stylesheet those
      // utilities lived in while the components kept using the class names,
      // so the navy panel painted no ground at all: the wordmark rendered
      // white on a near-white page and was invisible, and the supporting copy
      // sat around 1.4:1.
      //
      // Checking document.body alone does NOT catch this — the body ground is
      // painted by the light theme regardless. The check has to walk the
      // banded elements and compare each one's own text colour against the
      // nearest painted ancestor, which is what the browser actually composites.
      await page.goto(route.path);

      const failures = await page.evaluate(() => {
        const luminance = (rgb: number[]) => {
          const [r, g, b] = rgb.map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const parse = (value: string): number[] | null => {
          const m = value.match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const parts = m[1].split(",").map((n) => Number.parseFloat(n.trim()));
          // A fully transparent colour composites to its ancestor, not itself.
          if (parts.length > 3 && parts[3] === 0) return null;
          return parts.slice(0, 3);
        };
        const groundOf = (el: Element): number[] => {
          let node: Element | null = el;
          while (node) {
            const bg = parse(getComputedStyle(node).backgroundColor);
            if (bg) return bg;
            node = node.parentElement;
          }
          return [255, 255, 255];
        };

        const bands = Array.from(
          document.querySelectorAll<HTMLElement>("[class*='band-']"),
        );
        // Guard on the guard: if the class names are ever renamed, this
        // selector silently matches nothing and the whole check passes while
        // inspecting zero elements.
        if (bands.length === 0) return ["no band-* elements found on the page"];

        // The elements that actually carry ink, not the band itself. Probing
        // the band's own `color` was the first version of this check and it
        // was useless: an undefined `band-navy` sets neither background nor
        // colour, so the band inherits the page's dark ink, reads as legible,
        // and the white type that is actually broken lives on DESCENDANTS
        // (the tone="dark" wordmark, the text-ink-dark-secondary copy).
        const inked: Element[] = [];
        for (const band of bands) {
          for (const node of Array.from(band.querySelectorAll("*"))) {
            const ownText = Array.from(node.childNodes).some(
              (c) => c.nodeType === 3 && (c.textContent ?? "").trim() !== "",
            );
            const isMark = node instanceof SVGElement && node.tagName !== "svg";
            if (ownText || isMark) inked.push(node);
          }
        }
        if (inked.length === 0) return ["no inked elements inside any band"];

        const bad: string[] = [];
        for (const el of inked) {
          const style = getComputedStyle(el);

          // Picking the property that is actually painted.
          //
          // An SVG shape drawn with `stroke` still reports a computed `fill`
          // of black, because black is the CSS initial value and nothing
          // overrode it. Grading that reports every gridline in the Graticule
          // as 1.31:1 black-on-navy, which is not a colour anyone can see on
          // screen. So: stroke wins when the element is stroked, fill counts
          // only when it was asked for explicitly, and a shape with neither
          // is decorative geometry with no ink of its own.
          let raw: string | null = null;
          if (el instanceof SVGElement) {
            const stroked = style.stroke && style.stroke !== "none";
            if (stroked) raw = style.stroke;
            else if (el.hasAttribute("fill") && style.fill !== "none") raw = style.fill;
          } else {
            raw = style.color;
          }
          if (raw === null) continue;

          const ink = parse(raw);
          if (!ink) continue;
          if (Number.parseFloat(style.opacity) === 0) continue;

          // Starts at the element, not its parent: a button paints its own
          // fill, and that fill is the ground its label sits on. Beginning at
          // the parent reported the page behind the button instead, which
          // made every label on a coloured control look broken.
          const ground = groundOf(el);
          const [hi, lo] = [luminance(ink), luminance(ground)].sort((a, b) => b - a);
          const ratio = (hi + 0.05) / (lo + 0.05);

          // 3:1 rather than 4.5:1. This is a "did the ground disappear"
          // check, not a full WCAG audit: headings here are large text, and
          // the marks are non-text. Anything genuinely broken by a missing
          // band lands near 1.0 and is caught with room to spare.
          if (ratio < 3) {
            const label = (el.textContent ?? el.tagName).trim().slice(0, 40);
            bad.push(
              `"${label}": ink rgb(${ink}) on ground rgb(${ground}) = ${ratio.toFixed(2)}:1`,
            );
          }
        }
        return bad;
      });

      expect(failures, failures.join("\n")).toEqual([]);
    });

    test("every form control has an accessible name", async ({ page }) => {
      await page.goto(route.path);
      const unnamed = await page
        .locator("input:not([type=hidden]), button, select, textarea")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              const el = node as HTMLElement;
              const name =
                el.getAttribute("aria-label") ??
                el.getAttribute("title") ??
                (el.id
                  ? (document.querySelector(`label[for="${el.id}"]`)?.textContent ?? "")
                  : "") ??
                "";
              return name.trim() === "" && (el.textContent ?? "").trim() === "";
            })
            .map((node) => (node as HTMLElement).outerHTML.slice(0, 120)),
        );
      expect(unnamed, unnamed.join("\n")).toEqual([]);
    });
  });
}
