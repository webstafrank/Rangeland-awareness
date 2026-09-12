/**
 * Write the criteria registry to contracts/criteria.json for the Python service.
 *
 *   npx vite-node -c vitest.config.mts scripts/export-criteria.ts
 *
 * The config flag is needed because this imports through the `@/` alias, which
 * lives in vitest.config.mts; plain vite-node has no alias and fails to resolve.
 *
 * All the logic is in lib/criteria/export.ts. This file only writes, so that
 * the sync test can import the builder without a write happening as a side
 * effect of the import.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serialiseCriteriaExport } from "@/lib/criteria/export";

const out = fileURLToPath(new URL("../../contracts/criteria.json", import.meta.url));
writeFileSync(out, serialiseCriteriaExport(), "utf8");
console.log(`wrote ${out}`);
