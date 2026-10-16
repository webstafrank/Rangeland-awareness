/**
 * The browser half of the Kenya clip: MapLibre's handler for `kenya-clip://`
 * tile URLs. The geometry, and the reasoning, are in services/explore/clip.ts;
 * this file only fetches and masks.
 *
 * A tile wholly outside Kenya is answered with an empty tile and never
 * fetched. A tile wholly inside is fetched and drawn untouched. A tile the
 * border crosses is fetched, drawn onto an OffscreenCanvas through a clip
 * path of the outline, and handed back as an ImageBitmap. A failed fetch or
 * an undecodable body is thrown, so MapLibre marks the tile as errored exactly
 * as it did when it fetched the URL itself.
 */

// Namespace import for maplibre-gl 6; see components/explore/ExploreMapLibre.tsx.
import * as maplibregl from "maplibre-gl";

import {
  CLIP_PROTOCOL,
  planTile,
  tileBboxFromUrl,
  toPixels,
  unwrapClipUrl,
} from "@/services/explore";

/** MapLibre's tile size, and what the WMS URLs ask NASA for. */
const TILE_SIZE = 256;

let emptyTile: Promise<ArrayBuffer> | null = null;

/**
 * One fully transparent tile, encoded once and shared by every miss. Safe to
 * share: MapLibre copies a protocol's ArrayBuffer before decoding it. A failed
 * encode is not cached, so one bad call does not poison every later tile.
 */
function transparentTile(): Promise<ArrayBuffer> {
  emptyTile ??= new OffscreenCanvas(TILE_SIZE, TILE_SIZE)
    .convertToBlob({ type: "image/png" })
    .then((blob) => blob.arrayBuffer())
    .catch((error: unknown) => {
      emptyTile = null;
      throw error;
    });
  return emptyTile;
}

async function loadClipped(url: string, signal: AbortSignal): Promise<ArrayBuffer | ImageBitmap> {
  const target = unwrapClipUrl(url);
  if (target === null) throw new Error(`not a ${CLIP_PROTOCOL} URL: ${url}`);
  const box = tileBboxFromUrl(target);
  if (box === null) throw new Error(`tile URL has no usable BBOX: ${target}`);

  // Decided on the box alone, before any network: ocean and neighbours'
  // tiles cost nothing, and tiles wholly inside Kenya skip the mask.
  const plan = planTile(box);
  if (plan.kind === "outside") return transparentTile();

  const response = await fetch(target, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${target}`);
  const bitmap = await createImageBitmap(await response.blob());
  if (plan.kind === "inside") return bitmap;

  // Handed back as an ImageBitmap, which MapLibre uploads as is: no PNG
  // encode here and no second decode there.
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("no 2d context for the clip canvas");
    ctx.beginPath();
    for (const ring of toPixels(plan.rings, box, bitmap.width, bitmap.height)) {
      ring.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
    }
    ctx.clip("evenodd");
    ctx.drawImage(bitmap, 0, 0);
    return canvas.transferToImageBitmap();
  } finally {
    bitmap.close();
  }
}

let registered = false;

/** Idempotent: every mount calls it, MapLibre keeps one handler. */
export function registerKenyaClip(): void {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol(CLIP_PROTOCOL, async (params, abortController) => ({
    data: await loadClipped(params.url, abortController.signal),
  }));
}
