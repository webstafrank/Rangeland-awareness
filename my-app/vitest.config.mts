import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * The gate lane: deterministic, local, free, run on every commit by the
 * pre-commit hook.
 *
 * Measured, so the budget is a fact rather than an aspiration:
 *
 *   node  1137 tests, 41 files   2.4s
 *   dom    126 tests,  4 files   2.7s
 *   both  1263 tests, 45 files   4.9s
 *
 * Re-measured after `lib/` folded into `services/` and the dead TypeScript
 * analysis and catalog services were deleted. The whole run got roughly 2.4x
 * faster (11.9s to 4.9s) and that is not a tuning win: those suites were being
 * collected by the dom lane's `services/**` glob and paying for a jsdom they
 * never touched. Moving the boundary to purity rather than directory put them
 * where they belong.
 *
 * The dom lane is now 4 files and still spends 72% of its wall clock building
 * jsdom, which is the standing price of testing components rather than
 * asserting about them. If it grows past ~15s, split the slowest files into a
 * nightly lane rather than deleting coverage.
 *
 * Two projects rather than one config, because the two halves of this repo
 * genuinely need different environments and merging them into a single run
 * would mean paying jsdom's startup for the pure-function suites:
 *
 *   node  — the services and lib/theme. Pure functions over their arguments,
 *           no DOM, no globals.
 *   dom   — app/, components/, contracts/, design/. React components, which
 *           need jsdom and the testing-library matchers wired up in
 *           vitest.setup.ts.
 *
 * THE SPLIT IS PURITY, NOT DIRECTORY. It used to be readable off the path,
 * because `lib/` meant pure and everything else did not. Folding `lib/` into
 * `services/` removed that signal, so the rule is now carried by the filename:
 * a suite that needs a DOM is named `*.dom.test.ts` and lands in the dom lane
 * wherever it lives. That convention already existed as the opt-out for
 * selection-store; it is now the whole boundary.
 *
 * This matters more than it looks. The node lane runs `isolate: false`, one
 * worker shared across every file, which is only safe because nothing in it
 * touches a global. A suite that installs `sessionStorage` and is NOT named
 * `.dom.` would leak into the pure suites beside it and fail something
 * unrelated, in a different file, depending on execution order. If you add a
 * test that needs a global, the `.dom.` infix is not a style preference.
 *
 * Each project keeps the settings its half was tuned with, so neither
 * inherits a constraint written for the other. Run one lane on its own with
 * `npm test -- --project=node`, or one directory with `npm test -- services/geo`.
 *
 * `.mts` rather than `.ts` because Vite 7 loads a `.ts` config as CommonJS and
 * warns on the ESM syntax.
 */

/** One alias, shared, so `@/...` resolves identically everywhere. */
const alias = { "@": fileURLToPath(new URL("./", import.meta.url)) };

export default defineConfig({
  /*
   * Also at the top level, not only inside the two projects.
   *
   * vitest reads the per-project alias; `vite-node` does not, and reads this
   * one. Without it the regeneration command that scripts/export-criteria.ts
   * documents in its own header —
   * `npx vite-node -c vitest.config.mts scripts/export-criteria.ts` — dies on
   * `Cannot find package '@/services/criteria/export'`. That has been broken
   * since this config was split into projects, and it only surfaced when the
   * artifact next needed regenerating, which is the worst possible moment to
   * find out: the staleness gate is red and the tool that fixes it does not
   * run. The projects still declare their own, so this changes nothing for
   * either lane.
   */
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          // Browser-dependent behaviour is verified by the Playwright evals,
          // not here.
          environment: "node",
          // `.dom.test.ts` is the opt-out: those need jsdom and a resettable
          // module registry, so they run in the dom lane instead. Excluded
          // here rather than left to overlap, because this lane shares one
          // worker between files (isolate: false) and a test that installs a
          // storage global would leak into the pure suites beside it.
          include: ["{lib,services}/**/__tests__/**/*.test.ts"],
          exclude: ["{lib,services}/**/__tests__/**/*.dom.test.ts"],

          // Threads rather than the default forks, and workers reused across
          // files rather than one spawned per file. Measured on the same 193
          // tests:
          //
          //   forks, isolated (default)   1.77s
          //   threads, isolated           1.25s
          //   threads, not isolated       0.69s
          //
          // Startup dominated the run, not the tests, and 1.77s left no
          // headroom under the 2s gate budget: a concurrent Playwright run
          // pushed it to 2.56s. Both settings are safe here because every test
          // in this lane is a pure function over its arguments. No service in
          // this lane holds module-level mutable state, so sharing a worker
          // between test files changes nothing.
          //
          // If a future test ever needs a fresh module registry or mutates a
          // global, it gets `isolate: true` in its own file rather than
          // slowing the lane.
          pool: "threads",
          isolate: false,
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
          /*
           * Only `*.test.*` / `*.spec.*`, including inside `__tests__`. A bare
           * `__tests__/**` glob also collects helper modules that live beside
           * the tests (shared stubs, fixtures) and fails them for containing
           * no suite.
           */
          include: [
            "{app,components,contracts,design}/**/*.{test,spec}.{ts,tsx}",
            /*
             * And the suites under lib/ or services/ that cannot run in the
             * node lane, named for it.
             *
             * The services are pure by rule, with exactly one exception:
             * services/analysis/selection-store.ts has to touch
             * `sessionStorage`, because persistence is what lets a selection
             * survive a step navigation. Its pure half is tested in the node
             * lane beside everything else; its stateful half needs a real
             * storage object and a module registry it can reset, which is what
             * this lane has.
             *
             * The `.dom.` infix is the opt-in, so a service test lands here
             * only by being named for it. Without this the store's stateful
             * half would be the untested part of the most load-bearing module,
             * which is exactly where its first two bugs lived.
             */
            "{lib,services}/**/*.dom.{test,spec}.{ts,tsx}",
          ],
          // A gate test that needs longer than this is not a gate test.
          testTimeout: 2000,
          restoreMocks: true,

          // Constructing a jsdom per test FILE dominated this lane: 20 files,
          // 45s of the run's 29s wall clock spent in environment setup alone.
          // vmThreads builds the DOM once per worker and gives each file a
          // fresh VM context inside it, so files still cannot see each other's
          // globals, document or timers.
          //
          // Not `isolate: false`, which is the other way to stop paying for
          // setup: that shares ONE document across every file in a worker, and
          // these are component tests that mount into it. One file forgetting
          // to unmount would then change what the next file renders into, and
          // the failure would move around depending on file order.
          pool: "vmThreads",
        },
      },
    ],
  },
});
