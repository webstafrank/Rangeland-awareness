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
  const start = css.indexOf(":root");
  if (start === -1) throw new Error("readRootTokens: no :root block found");

  const open = css.indexOf("{", start);
  if (open === -1) throw new Error("readRootTokens: :root has no opening brace");

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
  if (close === -1) throw new Error("readRootTokens: :root block is unclosed");

  const body = stripComments(css.slice(open + 1, close));
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
      throw new Error(`readRootTokens: ${name} is declared twice in :root`);
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
