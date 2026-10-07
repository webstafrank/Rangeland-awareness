/**
 * icons.ts imports each icon from its own file, never the package root.
 *
 * A root import is not wrong, only slow: it pulls Fluent's sizedIcons chunks
 * (every icon in every size) into the dev compile, which on the dev machine's
 * HDD was the difference between 2 and 30 icon chunks per build. Nothing else
 * would catch an icon added back the old way, so this test does.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as icons from "@/components/ui/icons";

const source = readFileSync(resolve("components/ui/icons.ts"), "utf8");
const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

describe("components/ui/icons", () => {
  it("imports every icon from a per-icon svg file", () => {
    expect(specifiers.length).toBeGreaterThan(0);
    for (const s of specifiers) expect(s).toMatch(/^@fluentui\/react-icons\/svg\/[a-z0-9-]+$/);
  });

  it("exports a component for every name, so no path points at the wrong file", () => {
    const names = Object.keys(icons);
    expect(names.length).toBeGreaterThanOrEqual(41);
    for (const name of names) {
      expect(icons[name as keyof typeof icons], name).toBeTruthy();
    }
  });
});
