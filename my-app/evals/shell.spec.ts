/**
 * The app shell: the navy sidebar, the top bar, the phone drawer.
 *
 * S1-S3 pin what the shell promises a reader. S4 is the regression for the
 * one real bug the shell shipped with: a mounted Fluent OverlayDrawer stopped
 * arrow-key navigation in every Fluent TabList (reports R4), so the drawer is
 * a native <dialog> now, and this proves opening and closing it leaves the
 * Reports tabs working.
 */
import { expect, test, type Page } from "@playwright/test";
import { TOPICS } from "../services/analysis/topics";
import { STUB_RUN_ID, startStubBackend } from "./stub-backend";

const isPhone = (name: string) => name === "mobile";

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

test.describe("app shell", () => {
  test("S1: the desktop sidebar lists the sections, every topic and support, and marks where you are", async ({
    page,
  }, testInfo) => {
    test.skip(isPhone(testInfo.project.name), "the sidebar docks from lg up");
    const problems = watchConsole(page);
    await page.goto(`/topics/${TOPICS[1].slug}`);

    const sidebar = page.getByRole("complementary", { name: "Application" });
    await expect(sidebar.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveText([
      "Explore",
      "Analysis",
      "Reports",
    ]);
    const topics = sidebar.getByRole("navigation", { name: "Topics" });
    for (const topic of TOPICS) {
      await expect(topics.getByRole("link", { name: topic.name })).toHaveAttribute(
        "href",
        `/topics/${topic.slug}`,
      );
    }
    // The topic you are in, and only that one.
    await expect(topics.locator("[aria-current='page']")).toHaveText(TOPICS[1].name);
    await expect(sidebar.getByRole("navigation", { name: "Support" }).getByRole("link")).toHaveCount(3);

    // The top bar names the place as a trail.
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs).toContainText("Analysis");
    await expect(crumbs).toContainText(TOPICS[1].name);
    expect(problems).toEqual([]);
  });

  test("S2: the sidebar collapses to an icon rail, keeps every link named, and remembers it", async ({
    page,
  }, testInfo) => {
    test.skip(isPhone(testInfo.project.name), "the sidebar docks from lg up");
    await page.goto("/reports");
    const sidebar = page.getByRole("complementary", { name: "Application" });
    const wide = (await sidebar.boundingBox())!.width;

    await sidebar.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(wide / 2);
    // Labels go visually, not from the accessibility tree.
    await expect(sidebar.getByRole("link", { name: "Reports" })).toBeVisible();

    await page.reload();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(wide / 2);
    await sidebar.getByRole("button", { name: "Expand sidebar" }).click();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(wide - 2);
  });

  test("S3: on a phone the menu opens the drawer, Escape closes it, and focus returns to the menu", async ({
    page,
  }, testInfo) => {
    test.skip(!isPhone(testInfo.project.name), "the drawer is the phone's sidebar");
    const problems = watchConsole(page);
    await page.goto("/");

    const menu = page.getByRole("button", { name: "Open navigation" });
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("navigation", { name: "Topics" }).getByRole("link")).toHaveCount(
      TOPICS.length,
    );

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();

    // A link inside it navigates and closes it.
    await menu.click();
    await drawer.getByRole("link", { name: "Help" }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(drawer).toBeHidden();
    expect(problems).toEqual([]);
  });

  test("S4: the drawer leaves the Reports tabs' arrow keys working", async ({ page }, testInfo) => {
    await page.goto("/reports");
    if (isPhone(testInfo.project.name)) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.keyboard.press("Escape");
    }
    const tabs = page.getByRole("tablist", { name: "Report topics" });
    // Hydrated and settled first, as reports R4 does: before that the tabs are
    // server HTML with no key handling at all.
    await expect(page.getByTestId("report-skeleton")).toHaveCount(0);
    await expect(page.getByRole("tabpanel")).not.toHaveAttribute("aria-busy", "true");
    await tabs.getByRole("tab", { name: TOPICS[0].name, exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab", { name: TOPICS[1].name, exact: true })).toBeFocused();
  });

  test("S6: a run the service accepted is listed on the Overview, linked back to it", async ({
    page,
  }) => {
    // A real run, end to end against the stub service: areas, review, Run.
    const backend = await startStubBackend(Number(process.env.STUB_BACKEND_PORT ?? 8791));
    try {
      await page.goto("/topics/flood-risk/areas");
      await expect(page.getByTestId("map-view")).toBeVisible({ timeout: 30_000 });
      await page.getByLabel(/^coordinates$/i).fill("2.4512, 36.8203");
      await page.getByLabel(/^coordinates$/i).press("Enter");
      await page.getByTestId("step-continue").click();
      await page.getByRole("button", { name: /run analysis/i }).click();
      await expect(page).toHaveURL(new RegExp(`running\\?.*\\brun=${STUB_RUN_ID}`));

      await page.goto("/");
      const recent = page.getByTestId("recent-runs");
      await expect(recent).toContainText("Flood risk");
      const link = recent.getByRole("link").first();
      await expect(link).toHaveAttribute("href", new RegExp(`/topics/flood-risk/running\\?.*\\brun=${STUB_RUN_ID}`));
    } finally {
      await backend.close();
    }
  });

  test("S5: the top bar shows the live service state", async ({ page }, testInfo) => {
    await page.goto("/about");
    const indicator = isPhone(testInfo.project.name)
      ? page.getByTestId("service-dot")
      : page.getByTestId("service-status");
    await expect(indicator).toBeVisible();
    // The eval lane's stub answers /health, so the probe settles off "checking".
    await expect(indicator).not.toHaveAttribute("data-state", "checking");
  });
});
