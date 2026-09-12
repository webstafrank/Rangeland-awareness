/**
 * Read the custom properties declared in a stylesheet's `:root` block.
 *
 * This exists so `lib/theme/__tests__/palette.test.ts` can prove that
 * `app/globals.css` and `lib/theme/palette.ts` still agree. Without it the
 * palette module is documentation: someone edits a hex in the CSS, every test
 * still passes, and the contrast guarantees quietly stop being true of the
 * thing that actually ships.
 *
 * A real CSS parser would be the reuse-first answer, and PostCSS is already in
 * the tree via Tailwind. It is deliberately not used here: pulling a parser and
 * its plugin pipeline into the gate lane costs more startup than the whole
 * suite's 2s budget allows, to read one flat block of `--name: value` pairs
 * from a file this repo controls. The scope is narrow on purpose and the
 * function refuses anything it cannot read confidently.
 */

/**
 * Extract `--name: value` pairs from the FIRST top-level `:root { ... }` block.
 *
 * Only the first block is read, and that is the point: a second `:root`
 * elsewhere in the file would be a second definition of the same token, which
 * is exactly the drift this module exists to catch. `assertSingleRoot` is the
 * check for that; this function just reads.
 */
export function readRootTokens(css: string): Map<string, string> {
  return readBlockTokens(css, ":root", "readRootTokens");
}

/**
 * Extract `--name: value` pairs from the FIRST top-level `@theme { ... }` block.
 *
 * Tailwind v4 moved the declaration site. `@theme` is where a token is both
 * defined AND turned into a utility, so `--color-surface` in that block is
 * `var(--color-surface)` for the raw Leaflet rules and `bg-surface` in markup
 * at the same time. Tailwind emits the block to `:root` at build time, which
 * means the shipped stylesheet has the tokens on `:root` but the SOURCE file
 * this module reads does not. Reading only `:root` here would report a
 * stylesheet with zero colour tokens and the mirror test would pass vacuously.
 *
 * `@theme inline` matches too, deliberately: it is the same declaration site
 * with a different emit strategy, and a palette must be mirrored either way.
 */
export function readThemeTokens(css: string): Map<string, string> {
  return readBlockTokens(css, "@theme", "readThemeTokens");
}

/**
 * The shared reader behind both accessors.
 *
 * Comments are stripped BEFORE the marker is located, not after the block is
 * sliced. Prose in this codebase names the very selectors it declares — the
 * light theme's header comment says "Tailwind v4 emits each token on `:root`"
 * and "Everything lives in a single `@theme` block" — so searching the raw
 * text finds the comment, takes the next `{` after it, and parses whatever
 * rule happens to follow. That failure is silent: it returns a Map of the
 * wrong block's contents rather than throwing.
 */
function readBlockTokens(
  raw: string,
  marker: string,
  label: string,
): Map<string, string> {
  const css = stripComments(raw);

  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`${label}: no ${marker} block found`);

  const open = css.indexOf("{", start);
  if (open === -1) throw new Error(`${label}: ${marker} has no opening brace`);

  // Brace matching rather than a lazy regex to the first `}`: a token whose
  // value contains braces, or a nested at-rule, would truncate the block and
  // silently drop every token after it.
  let depth = 0;
  let close = -1;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) throw new Error(`${label}: ${marker} block is unclosed`);

  const body = css.slice(open + 1, close);
  const tokens = new Map<string, string>();

  for (const declaration of body.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;

    const name = declaration.slice(0, colon).trim();
    if (!name.startsWith("--")) continue;

    const value = declaration.slice(colon + 1).trim().replace(/\s+/g, " ");
    if (value.length === 0) continue;

    if (tokens.has(name)) {
      // A token declared twice in one block is a merge artefact, and the
      // second wins silently in the browser. Refuse rather than pick.
      throw new Error(`${label}: ${name} is declared twice in ${marker}`);
    }
    tokens.set(name, value);
  }

  return tokens;
}

/**
 * Remove CSS comments, so a commented-out token is not read as live and a
 * rule named in prose is not mistaken for a rule that ships.
 */
export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Count `:root` selectors in the stylesheet.
 *
 * The app commits to one definition per colour. A second `:root` — whether
 * bare, or inside a `@media (prefers-color-scheme: dark)` — means a token can
 * mean two different things depending on the visitor, which is the exact class
 * of bug the single-theme discipline exists to prevent.
 */
export function countRootBlocks(css: string): number {
  return (stripComments(css).match(/:root\s*(?=[,{:[])/g) ?? []).length;
}

/**
 * Count `@theme` at-rules in the stylesheet.
 *
 * Same guarantee as `countRootBlocks`, at the Tailwind v4 declaration site: two
 * `@theme` blocks means a token can be declared in one and redeclared in the
 * other, the later winning silently, and `readThemeTokens` only ever reads the
 * first. The per-block duplicate check cannot see across blocks, so this is the
 * check that does.
 */
export function countThemeBlocks(css: string): number {
  return (stripComments(css).match(/@theme\b/g) ?? []).length;
}
