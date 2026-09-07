import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Gate tests: deterministic, local, free, and fast. Every service owns its own
 * `__tests__` directory, so a change in one service can be verified without
 * running another service's suite:
 *
 *   npm test -- services/geo
 *
 * `.mts` rather than `.ts` because Vite 7 loads a `.ts` config as CommonJS and
 * warns on the ESM syntax. Path aliases come from `resolve.tsconfigPaths`,
 * which is native now, so no vite-tsconfig-paths plugin.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    /*
     * Only `*.test.*` / `*.spec.*`, including inside `__tests__`. A bare
     * `__tests__/**` glob also collects helper modules that live beside the
     * tests (shared stubs, fixtures) and fails them for containing no suite.
     */
    include: ["{app,components,contracts,design,services}/**/*.{test,spec}.{ts,tsx}"],
    // A gate test that needs longer than this is not a gate test.
    testTimeout: 2000,
    restoreMocks: true,
  },
});
