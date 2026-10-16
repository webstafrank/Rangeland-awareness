/**
 * MapLibre's web worker, served from this app's own origin.
 *
 * maplibre-gl 6 is an ES module that finds its worker as a sibling file of
 * itself (`new URL("./maplibre-gl-worker.mjs", import.meta.url)`). Once
 * Turbopack has bundled the library into a Next chunk, that sibling does not
 * exist, the worker 404s, and every map draws nothing: "Worker failed to load.
 * Check that the worker URL is correct." ExploreMapLibre points MapLibre here
 * instead with `setWorkerUrl`.
 *
 * Read from the installed package rather than copied into public/, so the
 * worker can never drift from the library version the page bundled. The
 * worker is one self-contained file (no imports), so serving it as-is is
 * enough. `force-static` prerenders it at build time: production serves a
 * static file and never reads node_modules at runtime, which the standalone
 * output would not ship.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const dynamic = "force-static";

export async function GET() {
  const source = await readFile(
    join(process.cwd(), "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs"),
    "utf8",
  );
  return new Response(source, {
    headers: { "Content-Type": "text/javascript; charset=utf-8" },
  });
}
