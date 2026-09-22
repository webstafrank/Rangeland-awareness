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

/**
 * The stub backend's port, derived from the app's so two sessions running the
 * eval lane at once do not fight over it either. Read by evals/run.spec.ts,
 * which is what actually listens on it.
 */
const STUB_PORT = PORT + 5000;
process.env.STUB_BACKEND_PORT = String(STUB_PORT);

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
    /*
     * Production build, not `next dev`: dev-mode compilation would land inside
     * the journey timing budget and make the measurement meaningless.
     *
     * Served from the standalone output rather than with `next start`, which
     * refuses to run against `output: "standalone"` and prints
     *
     *   "next start" does not work with "output: standalone" configuration.
     *
     * The two copies are not optional and are the same two the Dockerfile
     * makes: Next deliberately leaves `.next/static` and `public/` outside the
     * standalone bundle, so a server started without them answers 200 for every
     * page and 404 for every stylesheet, which renders as an unstyled app and
     * fails every theme check for the wrong reason.
     */
    command: [
      "npx next build",
      "cp -r .next/static .next/standalone/.next/static",
      "cp -r public .next/standalone/public",
      `PORT=${PORT} node .next/standalone/server.js`,
    ].join(" && "),
    /*
     * The app is pointed at the stub service (evals/stub-backend.ts), on its own
     * port derived the same way this one is. Both variables are set because they
     * are two different reads: BACKEND_URL is what the Next process uses while
     * it renders, NEXT_PUBLIC_BACKEND_URL is baked into the client bundle by the
     * build in this very command. Setting only one gives a page that renders
     * correctly and then fails every fetch after hydration.
     */
    env: {
      BACKEND_URL: `http://127.0.0.1:${STUB_PORT}`,
      NEXT_PUBLIC_BACKEND_URL: `http://127.0.0.1:${STUB_PORT}`,
    },
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
