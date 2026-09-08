import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    // Gate lane: deterministic, node-only, no DOM, budgeted under 2s.
    // Browser-dependent behaviour is verified by the Playwright evals.
    environment: "node",
    include: ["lib/**/__tests__/**/*.test.ts"],

    // Threads rather than the default forks, and workers reused across files
    // rather than one spawned per file. Measured on the same 193 tests:
    //
    //   forks, isolated (default)   1.77s
    //   threads, isolated           1.25s
    //   threads, not isolated       0.69s
    //
    // Startup dominated the run, not the tests, and 1.77s left no headroom
    // under the 2s gate budget: a concurrent Playwright run pushed it to
    // 2.56s. Both settings are safe here because every gate test is a pure
    // function over its arguments. Nothing under lib/ holds module-level
    // mutable state, so sharing a worker between test files changes nothing.
    //
    // If a future test ever needs a fresh module registry or mutates a global,
    // it gets `isolate: true` in its own file rather than slowing the lane.
    pool: "threads",
    isolate: false,
  },
});
