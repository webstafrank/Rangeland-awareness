/**
 * Fluent's focus tracking must run on ONE copy of keyborg.
 *
 * keyborg keeps its state on a window global (`window.__keyborg`), shared by
 * every copy loaded into the page. @fluentui/react-tabster asks for keyborg
 * ^2 while tabster 8.8.1 (a patch release under it) moved to ^3, so a plain
 * install loads both. Each copy then disposes the other's instances: in dev
 * the console fills with "Keyborg instance k1 is being disposed incorrectly"
 * on every map page, and in production the keyboard-navigation state behind
 * Fluent's focus rings is torn down by whichever copy disposes first.
 *
 * package.json `overrides` pins keyborg to the 3.x line for both (v3 exports
 * the same API react-tabster imports: createKeyborg, disposeKeyborg,
 * KEYBORG_FOCUSIN and the types). This fails if a reinstall or a Fluent
 * upgrade splits them again, which is the moment to revisit the override.
 */
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The directory `dependency` resolves to when required from inside `fromDir`. */
function resolveFrom(fromDir: string, dependency: string): string {
  const require = createRequire(`${fromDir}/package.json`);
  return realpathSync(dirname(require.resolve(`${dependency}/package.json`)));
}

describe("keyborg", () => {
  it("is one copy for Fluent's hooks and for tabster", () => {
    const app = dirname(fileURLToPath(import.meta.url));
    const reactTabster = resolveFrom(app, "@fluentui/react-tabster");
    const tabster = resolveFrom(reactTabster, "tabster");
    expect(resolveFrom(tabster, "keyborg")).toBe(resolveFrom(reactTabster, "keyborg"));
  });
});
