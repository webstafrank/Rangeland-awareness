import { expect, test, type Page } from "@playwright/test";
import { TOPICS } from "../services/analysis/topics";

/**
 * The Reports page eval: a heading, the four topics as tabs under it, and a
 * panel that shows a loading skeleton while it switches.
 *
 * Roles and accessible names throughout, as in journey.spec.ts, so this file
 * is also the page's DOM contract: it fails if a tab stops being a tab or the
 * panel loses its label, which is what a screen reader would lose too.
 */

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

const tablist = (page: Page) => page.getByRole("tablist", { name: "Report topics" });
const tab = (page: Page, name: string) => tablist(page).getByRole("tab", { name, exact: true });
const panel = (page: Page) => page.getByRole("tabpanel");
const skeleton = (page: Page) => page.getByTestId("report-skeleton");
const reportHeading = (page: Page) => panel(page).getByRole("heading", { level: 2 });

/** The selected topic is fully shown: tab, panel label, heading, no skeleton. */
async function expectShowing(page: Page, index: number) {
  const topic = TOPICS[index];
  await expect(tab(page, topic.name)).toHaveAttribute("aria-selected", "true");
  await expect(skeleton(page)).toHaveCount(0);
  await expect(panel(page)).toHaveAccessibleName(topic.name);
  await expect(reportHeading(page)).toHaveText(topic.name);
  await expect(panel(page)).not.toHaveAttribute("aria-busy", "true");
}

test.describe("reports", () => {
  test("R1: a heading, then the four topics as tabs in registry order, the first selected", async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await page.goto("/reports");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText("Reports");

    // By accessible name, not text: Fluent's Tab renders a hidden bold copy
    // of its label to reserve the selected width, so textContent has it twice.
    const tabs = tablist(page).getByRole("tab");
    await expect(tabs).toHaveCount(TOPICS.length);
    for (const [i, topic] of TOPICS.entries()) {
      await expect(tabs.nth(i)).toHaveAccessibleName(topic.name);
    }
    await expectShowing(page, 0);

    // Under the heading, and in one row: every tab on the same line.
    const headingBox = (await h1.boundingBox())!;
    const boxes = await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(Math.min(...boxes)).toBeGreaterThan(headingBox.y + headingBox.height);
    expect(new Set(boxes.map(Math.round)).size).toBe(1);

    // The first label's text starts on the same line as the heading and the
    // card, not 12px in where Fluent's tab padding would put it.
    const lefts = await page.evaluate(() => {
      const range = document.createRange();
      const label = document.querySelector('[role="tab"]')!;
      range.selectNodeContents(label.lastElementChild ?? label);
      return {
        label: range.getBoundingClientRect().left,
        h1: document.querySelector("h1")!.getBoundingClientRect().left,
        card: document.querySelector('[role="tabpanel"] article')!.getBoundingClientRect().left,
      };
    });
    expect(Math.abs(lefts.label - lefts.h1)).toBeLessThanOrEqual(1);
    expect(Math.abs(lefts.card - lefts.h1)).toBeLessThanOrEqual(1);
    expect(problems).toEqual([]);
  });

  test("R2: choosing a tab shows the skeleton with its shimmer, then the topic's report", async ({
    page,
  }) => {
    const problems = watchConsole(page);
    await page.goto("/reports");
    await expectShowing(page, 0);

    // Every frame from before the click: was the skeleton up, and was the
    // shimmer running on it? Recorded in the page, because polling from the
    // test raced the 350ms hold: on a phone, the tap and the round trip back
    // can use up most of it before the first poll lands (seen as a timeout
    // in 2 of 20 mobile runs, while a frame recorder saw the shimmer on every
    // skeleton frame of every run).
    await page.evaluate(() => {
      const w = window as unknown as { __frames: [boolean, boolean][] };
      w.__frames = [];
      const tick = () => {
        w.__frames.push([
          !!document.querySelector('[data-testid="report-skeleton"]'),
          document.getAnimations().some((a) => (a as CSSAnimation).animationName === "skeleton-shimmer"),
        ]);
        if (w.__frames.length < 600) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    const target = TOPICS[2];
    await tab(page, target.name).click();

    // The tab answered at once, and the panel says it is busy.
    await expect(tab(page, target.name)).toHaveAttribute("aria-selected", "true");

    await expect(page).toHaveURL(new RegExp(`/reports\\?topic=${target.slug}$`));
    await expectShowing(page, 2);
    await expect(page.getByRole("status")).toHaveText(`${target.name} report loaded`);

    const frames = await page.evaluate(
      () => (window as unknown as { __frames: [boolean, boolean][] }).__frames,
    );
    const skeletonFrames = frames.filter(([up]) => up);
    expect(skeletonFrames.length, "the skeleton was on screen").toBeGreaterThan(0);
    expect(
      skeletonFrames.every(([, shimmer]) => shimmer),
      "the shimmer ran on every frame the skeleton was up",
    ).toBe(true);
    // And the fade-in it arrived with has finished and left nothing behind.
    await expect
      .poll(() => panel(page).evaluate((el) => el.getAnimations({ subtree: true }).length))
      .toBe(0);
    expect(problems).toEqual([]);
  });

  test("R3: the skeleton holds long enough to read as loading, not a flicker", async ({ page }) => {
    await page.goto("/reports");
    await expectShowing(page, 0);
    // Let every prefetch land first, so this measures the hold, not the fetch.
    await page.waitForLoadState("networkidle");

    // When the skeleton appeared and when it went, measured in the page.
    await page.evaluate(() => {
      const w = window as unknown as { __shown?: number; __gone?: number };
      new MutationObserver(() => {
        const here = !!document.querySelector('[data-testid="report-skeleton"]');
        if (here && w.__shown === undefined) w.__shown = performance.now();
        if (!here && w.__shown !== undefined && w.__gone === undefined) w.__gone = performance.now();
      }).observe(document.body, { childList: true, subtree: true });
    });
    await tab(page, TOPICS[1].name).click();
    await expectShowing(page, 1);

    const held = await page.evaluate(() => {
      const w = window as unknown as { __shown: number; __gone: number };
      return w.__gone - w.__shown;
    });
    // MIN_SKELETON_MS is 350, timed from the skeleton's commit. The observer
    // reads short by up to ~15ms: its callback runs only after React finishes
    // that whole commit (the heavier of the two), so "shown" is stamped late
    // while "gone" is stamped promptly. Lowest seen over 30 runs: 337.9.
    // (Timed from the click, as it first was, this read 320 to 330, which is
    // how the commit-time anchor came about.)
    expect(held).toBeGreaterThanOrEqual(330);
    // And not much more: prefetched, nothing should keep it up for long.
    expect(held).toBeLessThan(1500);
  });

  test("R4: the tabs work from the keyboard", async ({ page }) => {
    await page.goto("/reports");
    await expectShowing(page, 0);

    await tab(page, TOPICS[0].name).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, TOPICS[1].name)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`topic=${TOPICS[1].slug}$`));
    await expectShowing(page, 1);

    // One tab stop for the whole row: Tab leaves the list for the panel.
    await tab(page, TOPICS[1].name).focus();
    await page.keyboard.press("Tab");
    await expect(panel(page)).toBeFocused();
  });

  test("R5: Back and Forward step through the tabs visited", async ({ page }) => {
    await page.goto("/reports");
    await tab(page, TOPICS[1].name).click();
    await expectShowing(page, 1);
    await tab(page, TOPICS[3].name).click();
    await expectShowing(page, 3);

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`topic=${TOPICS[1].slug}$`));
    await expectShowing(page, 1);
    await page.goForward();
    await expectShowing(page, 3);
  });

  test("R6: a link opens its tab, and a stale one falls back to the first", async ({ page }) => {
    await page.goto(`/reports?topic=${TOPICS[3].slug}`);
    await expectShowing(page, 3);
    await page.goto("/reports?topic=volcanoes");
    await expectShowing(page, 0);
  });

  test("R7: switching keeps the reader's scroll position", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto("/reports");
    await expectShowing(page, 0);
    await page.evaluate(() => window.scrollTo({ top: 120, behavior: "instant" }));
    await tab(page, TOPICS[1].name).click();
    await expectShowing(page, 1);
    expect(await page.evaluate(() => window.scrollY)).toBe(120);
  });

  test("R8: under reduced motion the skeleton is still, and the report just appears", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/reports");
    await tab(page, TOPICS[1].name).click();
    await expect(skeleton(page)).toBeVisible();
    expect(
      await page.evaluate(() =>
        document.getAnimations().some((a) => (a as CSSAnimation).animationName === "skeleton-shimmer"),
      ),
    ).toBe(false);
    await expectShowing(page, 1);
    await expect(panel(page).locator(".report-enter")).toHaveCSS("animation-name", "none");
  });

  test("R10: the panel keeps its height when the report replaces the skeleton", async ({
    page,
  }) => {
    // With scroll: false the reader stays put, so any height change between
    // skeleton and report moves everything below it. It was 40px on desktop
    // and 196px on a phone before the skeleton reused the real header.
    await page.goto("/reports");
    await expectShowing(page, 0);
    const heightOf = () => panel(page).evaluate((el) => el.getBoundingClientRect().height);
    for (const index of [1, 2, 3, 0]) {
      await tab(page, TOPICS[index].name).click();
      await expect(skeleton(page)).toBeVisible();
      const during = await heightOf();
      await expectShowing(page, index);
      const after = await heightOf();
      expect(Math.abs(after - during), `${TOPICS[index].name}: ${during} then ${after}`).toBeLessThanOrEqual(1);
    }
  });

  test("R11: arriving from another page, the loading frame lines up with the page", async ({
    page,
  }) => {
    // Hold the real navigation request, so the loading frame stays up long
    // enough to measure; let Next's prefetch (which carries the frame) through.
    await page.route(/\/reports(\?|$)/, async (route) => {
      if (route.request().headers()["next-router-prefetch"]) return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.continue();
    });
    await page.goto("/data");
    await page.waitForLoadState("networkidle");

    const measure = () =>
      page.evaluate(() => {
        const box = (el: Element | null) => el?.getBoundingClientRect();
        const tabs = box(document.querySelector('[role="tablist"]'));
        const card = box(document.querySelector('[data-testid="report-skeleton"], [role="tabpanel"] article'));
        return { tabsTop: tabs?.top, tabsHeight: tabs?.height, cardTop: card?.top, cardHeight: card?.height };
      });

    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Reports" }).click();
    await expect(skeleton(page)).toBeVisible();
    await expect(tablist(page)).toHaveCount(0); // the placeholder is hidden, not a tablist
    const loading = await measure();

    await expectShowing(page, 0);
    // Measured once the report's 8px fade-up has finished. Mid-animation the
    // card read 0 to 2px low, which is the motion, not a layout shift.
    await expect
      .poll(() => panel(page).evaluate((el) => el.getAnimations({ subtree: true }).length))
      .toBe(0);
    const landed = await measure();

    expect(loading.tabsTop).toBeDefined();
    expect(Math.abs(landed.tabsTop! - loading.tabsTop!)).toBeLessThanOrEqual(1);
    expect(Math.abs(landed.tabsHeight! - loading.tabsHeight!)).toBeLessThanOrEqual(1);
    expect(Math.abs(landed.cardTop! - loading.cardTop!)).toBeLessThanOrEqual(1);
    expect(Math.abs(landed.cardHeight! - loading.cardHeight!)).toBeLessThanOrEqual(1);
  });

  test("R9: no horizontal page scroll; the tab row scrolls inside itself", async ({ page }) => {
    await page.goto("/reports");
    await expectShowing(page, 0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    // Every tab is reachable, scrolled into view when chosen.
    const last = tab(page, TOPICS[3].name);
    await last.click();
    await expectShowing(page, 3);
    await expect(last).toBeInViewport();
  });
});
