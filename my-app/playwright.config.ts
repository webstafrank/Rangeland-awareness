import { defineConfig, devices } from "@playwright/test";

/**
 * Eval lane config. Separate from the gate lane (vitest) on purpose: these are
 * slower, drive a real browser, and measure the journey budget rather than
 * asserting pure functions.
 *
 * The port is derived from the session id so two Claude sessions running this
 * repo at once do not fight over one port, which is the same reason the
 * worktree exists. Falls back to 3512 outside a session.
 */
const sessionKey = process.env.CLAUDE_CODE_SESSION_ID?.slice(0, 4) ?? "";
const PORT =
  3000 + (Number.parseInt(sessionKey, 16) % 1000 || 512);

export default defineConfig({
  testDir: "./evals",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "evals/.report.json" }]],

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The system Chrome, so no 170MB browser download is needed. Verified
    // against Chrome 152.
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      // 360px is the rubric's narrow target. A real device descriptor rather
      // than a resized desktop, so touch and DPR are right too.
      name: "mobile",
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 800 } },
    },
  ],

  webServer: {
    // Production build, not `next dev`: dev-mode compilation would land inside
    // the journey timing budget and make the measurement meaningless.
    command: `npx next build && npx next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
