import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    // Gate lane: deterministic, node-only, no DOM, budgeted under 2s.
    // Browser-dependent behaviour is verified by the Playwright journey eval.
    environment: "node",
    include: ["lib/**/__tests__/**/*.test.ts"],
  },
});
