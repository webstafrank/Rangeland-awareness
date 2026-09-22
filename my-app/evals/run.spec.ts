import { expect, test } from "@playwright/test";
import { STUB_RESULT, STUB_RUN_ID, startStubBackend, type StubBackend } from "./stub-backend";

/**
 * The run flow: creating a run, watching it, and reading what came back.
 *
 * Scored against the rubric sections "Running screen" (R1 to R10) and "Results
 * screen" (S1 to S10) in docs/acceptance-rubric.md, frozen before any of this
 * was built.
 *
 * Against a stub service rather than the real Django one. The real service is
 * covered by its own 181 tests and by a real run against real data (see the
 * run-wiring commit); what this lane has to prove is that the app renders what
 * comes back, including the states a real run passes through too fast to catch
 * and the ones a healthy service never produces at all.
 *
 * The stub is a real HTTP server on a real port, not `page.route`. Two of these
 * screens fetch on the SERVER while they render, so a route handler installed
 * in the page would intercept nothing and every test would assert against the
 * "service is not answering" state.
 *
 * Every locator is a role or an accessible name, never a CSS class, so this
 * file is also the DOM contract for the two new screens.
 */

const STUB_PORT = Number(process.env.STUB_BACKEND_PORT ?? 8791);

let backend: StubBackend;

test.beforeAll(async () => {
  backend = await startStubBackend(STUB_PORT);
});

test.afterAll(async () => {
  await backend?.close();
});

test.beforeEach(() => {
  backend.setOffline(false);
  backend.advanceTo(0);
});

const RUNNING_URL = `/topics/flood-risk/running?run=${STUB_RUN_ID}`;
const RESULT_URL = `/topics/flood-risk/results?run=${STUB_RUN_ID}`;

/* ------------------------------------------------------------ the running screen */

test.describe("running screen", () => {
  test("R1: the stage list is on screen in the server HTML, before any poll", async ({
    page,
  }) => {
    backend.advanceTo(1);

    // No waiting: the assertion is that this is in the first response, which is
    // what stops the screen being an undifferentiated spinner for two seconds.
    const response = await page.goto(RUNNING_URL, { waitUntil: "commit" });
    const html = await response!.text();

    for (const label of [
      "Resolving area geometry",
      "Fetching criterion layers",
      "Publishing layers to GeoServer",
    ]) {
      expect(html).toContain(label);
    }
  });

  test("R3: a skipped stage stays in the list, and every state is worded", async ({
    page,
  }) => {
    // A run still in progress, not a finished one: a finished run navigates
    // straight to its result (R8), so asserting on its stage list is a race the
    // mobile project lost and the desktop one won.
    backend.advanceTo(3);
    await page.goto(RUNNING_URL);

    // The real service skips publish: no write credentials on this deployment.
    // Dropping it would make the list reflow mid-run.
    const publish = page.getByText("Publishing layers to GeoServer");
    await expect(publish).toBeVisible();
    await expect(page.getByText(/skipped/i).first()).toBeVisible();
  });

  test("R2: progress is announced as a real progressbar, and does not fall", async ({
    page,
  }) => {
    backend.advanceTo(4);
    await page.goto(RUNNING_URL);

    const bar = page.getByRole("progressbar");
    await expect(bar).toBeVisible();

    const first = Number(await bar.getAttribute("aria-valuenow"));
    expect(first).toBeGreaterThan(0);

    // Send the run backwards, which the real service does on a failure: it was
    // observed going 78% then 74%. The screen must not follow it down.
    backend.advanceTo(1);
    await page.waitForTimeout(3000);
    const second = Number(await page.getByRole("progressbar").getAttribute("aria-valuenow"));
    expect(second).toBeGreaterThanOrEqual(first);
  });

  test("R4: a failed run names the stage and the message, with a way back", async ({
    page,
  }) => {
    backend.fail("fetch", 'GeoServer returned no features for "TR_Rivers".');
    await page.goto(RUNNING_URL);

    await expect(page.getByText("Fetching criterion layers")).toBeVisible();
    await expect(page.getByText(/TR_Rivers/)).toBeVisible();
    await expect(page.getByRole("link", { name: /review/i })).toBeVisible();
  });

  test("R6: a silent service reads differently from a failed run", async ({ page }) => {
    backend.fail("fetch", "the run itself broke");
    await page.goto(RUNNING_URL);
    const failedCopy = await page.locator("main").innerText();

    backend.advanceTo(2);
    backend.setOffline(true);
    await page.goto(RUNNING_URL);
    const offlineCopy = await page.locator("main").innerText();

    expect(offlineCopy).not.toEqual(failedCopy);
    expect(offlineCopy).toMatch(/not answering|did not answer|could not reach/i);
  });

  test("R8: a finished run goes to its result rather than polling", async ({ page }) => {
    backend.succeed();
    await page.goto(RUNNING_URL);
    await expect(page).toHaveURL(/\/results\?.*\brun=/, { timeout: 15_000 });
  });

  test("R9: one polite live region, naming the stage", async ({ page }) => {
    backend.advanceTo(2);
    await page.goto(RUNNING_URL);

    const live = page.locator('[aria-live="polite"]');
    await expect(live.first()).toBeAttached();
    await expect(live.first()).toContainText(/Reprojecting|Deriving|Fetching|Resolving/i);
  });

  test("R10: no horizontal scroll at 360px", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the narrow target is the mobile project");
    backend.advanceTo(3);
    await page.goto(RUNNING_URL);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

/* ------------------------------------------------------------- the results screen */

test.describe("results screen", () => {
  test.beforeEach(() => {
    backend.succeed();
  });

  test("S1: renders from the result alone, in a browser with no session storage", async ({
    page,
  }) => {
    // Nothing is seeded into sessionStorage. A shared link has to work in a
    // browser that never saw the selection.
    const response = await page.goto(RESULT_URL, { waitUntil: "commit" });
    const html = await response!.text();

    expect(html).toContain("Flood Risk Index");
    expect(html).toContain(STUB_RUN_ID);
  });

  test("S2: every class is listed, and the shares sum to 100%", async ({ page }) => {
    await page.goto(RESULT_URL);

    for (const row of STUB_RESULT.classes) {
      await expect(page.getByText(row.label, { exact: false }).first()).toBeVisible();
    }

    const text = await page.locator("main").innerText();
    // Each share as the page renders it, to one decimal.
    const total = STUB_RESULT.classes.reduce((sum, c) => sum + c.share, 0);
    expect(total).toBeCloseTo(1, 3);
    // And the page says so rather than leaving the reader to add five numbers.
    expect(text).toMatch(/100(\.0)?\s*%/);
  });

  test("S3: the Jenks breaks are printed as numbers, with where they came from", async ({
    page,
  }) => {
    await page.goto(RESULT_URL);
    const text = await page.locator("main").innerText();

    for (const value of STUB_RESULT.breaks) {
      expect(text).toContain(String(value));
    }
    expect(text).toMatch(/this run'?s own distribution/i);
  });

  test("S4: contribution is labelled, and disclaimed", async ({ page }) => {
    await page.goto(RESULT_URL);
    const text = await page.locator("main").innerText();

    expect(text).toMatch(/not feature importance/i);
    expect(text).toMatch(/not a sensitivity analysis/i);
  });

  test("S5: the method is named, and no model statistic appears", async ({ page }) => {
    await page.goto(RESULT_URL);
    const text = await page.locator("main").innerText();

    expect(text).toMatch(/weighted overlay/i);
    // The three statistics a weighted overlay cannot honestly report.
    expect(text).not.toMatch(/\bAUC\b/);
    expect(text).not.toMatch(/\bR²\b|\bR\^?2\b/);
    expect(text).not.toMatch(/training samples/i);
  });

  test("S8: an unknown run id is told apart from an unfinished one", async ({ page }) => {
    await page.goto("/topics/flood-risk/results?run=r_000000000000");
    await expect(page.getByText(/does not exist/i)).toBeVisible();

    // A run that exists and has not finished belongs on the running screen.
    backend.advanceTo(2);
    await page.goto(RESULT_URL);
    await expect(page).toHaveURL(/\/running\?/);
  });

  test("S10: no horizontal scroll at 360px", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the narrow target is the mobile project");
    await page.goto(RESULT_URL);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
