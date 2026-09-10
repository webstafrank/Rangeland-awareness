/**
 * The 60-30-10 rule, made measurable.
 *
 * A colour system is usually argued about in prose, which means it drifts: one
 * commit adds a cobalt panel, the next adds three orange badges, and nobody can
 * say whether the accent is still an accent. This module turns the rule into a
 * number, so `evals/theme.spec.ts` can fail when the balance leaves its window.
 *
 * The method: every pixel of a rendered screenshot is matched to the nearest
 * palette token within a tolerance, and each token carries a ROLE. Shares are
 * then summed per role rather than per colour, which is what the rule is
 * actually about — "60% ground" never meant one hex covering 60% of the screen,
 * it meant the ground tier does.
 *
 * Pixels that match nothing (antialiased text edges, the map canvas, photographic
 * imagery) are reported as `unmatched` and excluded from the shares. That is
 * deliberate: the budget grades the *design system's* surfaces, and a basemap
 * tile is not a design decision. `unmatched` is reported rather than hidden so a
 * run where the classifier stopped recognising the page is obvious instead of
 * silently passing.
 */

import { parseColor, type Rgb } from "./contrast";

/**
 * What a token is for. The three budgeted roles are the 60-30-10 tiers.
 *
 * `ink` (text and icon colours) and `status` (danger, warning) are deliberately
 * outside the budget: text is not a surface, and a status colour appearing at
 * all is a function of what the user did, not of the palette's balance.
 */
export type TokenRole = "ground" | "structure" | "accent" | "ink" | "status";

export interface RoleToken {
  name: string;
  /** Any form parseColor accepts. Translucent tokens must be pre-composited. */
  value: string;
  role: TokenRole;
}

export interface PixelBudget {
  /** Share of matched pixels per budgeted role, 0-1. */
  ground: number;
  structure: number;
  accent: number;
  /** Reported for completeness; not part of the 60-30-10 window. */
  ink: number;
  status: number;
  /** Share of ALL sampled pixels that matched no token, 0-1. */
  unmatched: number;
  /** Total pixels sampled, after any stride. */
  sampled: number;
}

/**
 * Maximum Euclidean distance in sRGB for a pixel to count as "this token".
 *
 * 10, and the number is forced rather than chosen. A dark palette packs its
 * tiers close together in sRGB even when they are comfortably distinct to the
 * eye: this app's page (#0f172a) and its panel (#14203f) are a clear step
 * apart visually but only 23.4 apart numerically. For a pixel's role to never
 * be ambiguous, no two tokens of DIFFERENT roles may have overlapping match
 * radii, which means the tolerance must stay below half the smallest
 * cross-role distance in the palette — 22.8/2 = 11.4 here.
 *
 * 10 sits under that with margin, and is still wide enough to absorb 8-bit
 * rounding and the antialiasing on a flat fill (±5 per channel is 8.7).
 *
 * The cost is deliberate: pixels in the blend between two tiers fall outside
 * every radius and are counted as `unmatched` rather than being assigned to
 * whichever tier happens to be marginally nearer. Reporting them as unknown is
 * honest; splitting them on a coin flip would move percentage points between
 * the 60 and the 30 with nothing to show for it.
 *
 * `palette.test.ts` enforces the cross-role separation, so a future token that
 * breaks this invariant fails a test instead of quietly skewing the budget.
 */
export const MATCH_TOLERANCE = 10;

/** Squared distance, so the hot loop never calls Math.sqrt. */
function distanceSquared(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/**
 * Classify one pixel. Returns the role of the nearest token inside the
 * tolerance, or null when nothing is close enough.
 */
export function classifyPixel(
  pixel: Rgb,
  tokens: readonly { rgb: Rgb; role: TokenRole }[],
  tolerance = MATCH_TOLERANCE,
): TokenRole | null {
  const limit = tolerance * tolerance;
  let bestRole: TokenRole | null = null;
  let best = Number.POSITIVE_INFINITY;

  for (const token of tokens) {
    const d = distanceSquared(pixel, token.rgb);
    if (d < best && d <= limit) {
      best = d;
      bestRole = token.role;
    }
  }

  return bestRole;
}

/** Parse a token list once, so the per-pixel loop never re-parses a string. */
export function prepareTokens(
  tokens: readonly RoleToken[],
): { rgb: Rgb; role: TokenRole }[] {
  return tokens.map((token) => {
    const rgb = parseColor(token.value);
    if (rgb === null) {
      throw new Error(`prepareTokens: token ${token.name} is not a colour: ${token.value}`);
    }
    return { rgb, role: token.role };
  });
}

/**
 * Measure a screenshot against the palette.
 *
 * `data` is RGBA, four bytes per pixel, exactly as `CanvasRenderingContext2D.
 * getImageData().data` produces it.
 *
 * Every pixel is counted. A stride was tried and removed: sampling every Nth
 * pixel of a flat RGBA buffer aliases against the image's own periodicity — a
 * UI screenshot is highly periodic, being rows of repeated structure — and the
 * unit test caught it shifting a 30% share to 40% on a regular pattern. A
 * 1440 x 4000 page is 5.8M pixels and grades in well under a second, which is
 * not worth buying with a silent sampling bias.
 */
export function measurePixelBudget(
  data: Uint8ClampedArray | Uint8Array | number[],
  tokens: readonly RoleToken[],
): PixelBudget {
  const prepared = prepareTokens(tokens);
  const counts: Record<TokenRole, number> = {
    ground: 0,
    structure: 0,
    accent: 0,
    ink: 0,
    status: 0,
  };

  let sampled = 0;
  let unmatched = 0;

  for (let i = 0; i < data.length; i += 4) {
    // A fully transparent pixel is not painted, so it is not evidence about the
    // palette either way. Anything partly opaque has already been composited by
    // the browser onto the page ground by the time it reaches a screenshot.
    if (data[i + 3] === 0) continue;

    sampled += 1;
    const role = classifyPixel(
      { r: data[i], g: data[i + 1], b: data[i + 2] },
      prepared,
    );

    if (role === null) unmatched += 1;
    else counts[role] += 1;
  }

  const matched = sampled - unmatched;
  // No matched pixels means the classifier did not recognise the page at all.
  // Return zeroed shares with unmatched at 1 rather than dividing by zero: the
  // caller's window check then fails, which is the correct outcome.
  const share = (n: number) => (matched === 0 ? 0 : n / matched);

  return {
    ground: share(counts.ground),
    structure: share(counts.structure),
    accent: share(counts.accent),
    ink: share(counts.ink),
    status: share(counts.status),
    unmatched: sampled === 0 ? 0 : unmatched / sampled,
    sampled,
  };
}

/** One distinct colour and how many pixels of it there were. */
export type HistogramEntry = readonly [r: number, g: number, b: number, count: number];

/**
 * Measure from a colour histogram rather than from raw bytes.
 *
 * This is the path the browser eval uses. A full-page screenshot is ~23MB of
 * RGBA, far too much to hand back from `page.evaluate`, but the histogram of a
 * flat-design UI is a few thousand entries: the counting happens in the page,
 * where the pixels already are, and the *classifying* happens here, so there
 * is still exactly one implementation of what a role means.
 *
 * Identical in result to `measurePixelBudget` over the same image, which
 * pixel-budget.test.ts asserts directly rather than assuming.
 */
export function measureFromHistogram(
  entries: readonly HistogramEntry[],
  tokens: readonly RoleToken[],
): PixelBudget {
  const prepared = prepareTokens(tokens);
  const counts: Record<TokenRole, number> = {
    ground: 0,
    structure: 0,
    accent: 0,
    ink: 0,
    status: 0,
  };

  let sampled = 0;
  let unmatched = 0;

  for (const [r, g, b, count] of entries) {
    sampled += count;
    const role = classifyPixel({ r, g, b }, prepared);
    if (role === null) unmatched += count;
    else counts[role] += count;
  }

  const matched = sampled - unmatched;
  const share = (n: number) => (matched === 0 ? 0 : n / matched);

  return {
    ground: share(counts.ground),
    structure: share(counts.structure),
    accent: share(counts.accent),
    ink: share(counts.ink),
    status: share(counts.status),
    unmatched: sampled === 0 ? 0 : unmatched / sampled,
    sampled,
  };
}

/** Format a budget as one line, so an eval failure is worth reading. */
export function formatBudget(budget: PixelBudget): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return (
    `ground ${pct(budget.ground)}, structure ${pct(budget.structure)}, ` +
    `accent ${pct(budget.accent)}, ink ${pct(budget.ink)}, ` +
    `status ${pct(budget.status)}, unmatched ${pct(budget.unmatched)} ` +
    `of ${budget.sampled} px`
  );
}

/** The windows the rubric froze before any of the palette was designed. */
export const BUDGET_WINDOW = {
  ground: [0.5, 0.7],
  structure: [0.2, 0.4],
  accent: [0.02, 0.12],
} as const satisfies Record<string, readonly [number, number]>;
