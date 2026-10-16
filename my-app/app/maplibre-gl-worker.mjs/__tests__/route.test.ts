/**
 * The MapLibre worker route (see ../route.ts).
 *
 * Without it every map in the app draws nothing under maplibre-gl 6: the
 * library looks for its worker beside its own bundled chunk, finds nothing,
 * and logs "Worker failed to load".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET, dynamic } from "../route";

const installed = readFileSync(
  join(process.cwd(), "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs"),
  "utf8",
);

describe("/maplibre-gl-worker.mjs", () => {
  it("serves the installed worker, byte for byte, as JavaScript", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    // A module worker is refused unless the response is JavaScript.
    expect(response.headers.get("content-type")).toMatch(/^text\/javascript/);
    expect(await response.text()).toBe(installed);
  });

  it("is prerendered, so production never reads node_modules", () => {
    expect(dynamic).toBe("force-static");
  });

  it("is one self-contained file, so serving it alone is enough", () => {
    // Served from /maplibre-gl-worker.mjs, a relative import inside it would
    // resolve against this app's root and 404. If a maplibre-gl upgrade
    // splits the worker into chunks, this fails before the maps go blank.
    expect(installed).not.toMatch(/\bimport\s*["'`{*]|\bfrom\s*["'`]\.\.?\//);
    // Nor a lazily loaded relative chunk. (Its one dynamic import is of a blob
    // URL built at runtime for plugins, which this does not match.)
    expect(installed).not.toMatch(/\bimport\(\s*["'`]\.\.?\//);
  });
});
