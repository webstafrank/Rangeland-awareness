import { describe, expect, it } from "vitest";
import { countRootBlocks, readRootTokens } from "@/lib/theme/css-tokens";

describe("readRootTokens", () => {
  it("reads name and value pairs", () => {
    const tokens = readRootTokens(`:root { --page: #0f172a; --ink: #e2e8f0; }`);
    expect(tokens.get("--page")).toBe("#0f172a");
    expect(tokens.get("--ink")).toBe("#e2e8f0");
    expect(tokens.size).toBe(2);
  });

  it("ignores non-custom properties in the block", () => {
    const tokens = readRootTokens(`:root { color-scheme: dark; --page: #0f172a; }`);
    expect(tokens.has("color-scheme")).toBe(false);
    expect(tokens.size).toBe(1);
  });

  it("does not read a commented-out token as live", () => {
    // The failure this prevents: a token is commented out in the CSS, the
    // palette still lists it, and the mirror test passes while the app renders
    // without it.
    const tokens = readRootTokens(`:root {
      --page: #0f172a;
      /* --page: #ffffff; the old light ground */
      --ink: #e2e8f0;
    }`);
    expect(tokens.get("--page")).toBe("#0f172a");
    expect(tokens.size).toBe(2);
  });

  it("collapses internal whitespace so a wrapped value still compares equal", () => {
    const tokens = readRootTokens(`:root {
      --shadow: 0 4px 8px -2px
        rgb(0 0 0 / 0.4);
    }`);
    expect(tokens.get("--shadow")).toBe("0 4px 8px -2px rgb(0 0 0 / 0.4)");
  });

  it("matches braces rather than stopping at the first closing one", () => {
    // A lazy /:root\{(.*?)\}/ would stop inside the value below and silently
    // drop --ink, which is the kind of miss that makes a mirror test useless.
    const tokens = readRootTokens(`:root {
      --grid: { not really css but braces all the same };
      --ink: #e2e8f0;
    }`);
    expect(tokens.get("--ink")).toBe("#e2e8f0");
  });

  it("refuses a token declared twice instead of silently taking the last", () => {
    expect(() => readRootTokens(`:root { --page: #000; --page: #fff; }`)).toThrow(
      /--page is declared twice/,
    );
  });

  it("throws when there is no :root at all", () => {
    expect(() => readRootTokens(`body { color: red; }`)).toThrow(/no :root/);
  });

  it("throws on an unclosed block rather than returning a partial read", () => {
    expect(() => readRootTokens(`:root { --page: #000;`)).toThrow(/unclosed/);
  });
});

describe("countRootBlocks", () => {
  it("counts one for a single theme", () => {
    expect(countRootBlocks(`:root { --page: #0f172a; }`)).toBe(1);
  });

  it("counts a second :root hidden inside a media query", () => {
    // This is the regression the single-theme discipline is about: a
    // prefers-color-scheme block redefining the same tokens.
    const css = `
      :root { --page: #0f172a; }
      @media (prefers-color-scheme: light) {
        :root { --page: #ffffff; }
      }`;
    expect(countRootBlocks(css)).toBe(2);
  });

  it("counts :root in a selector list and with an attribute qualifier", () => {
    expect(countRootBlocks(`:root, .x { --a: 1; }`)).toBe(1);
    expect(countRootBlocks(`:root[data-theme="light"] { --a: 1; }`)).toBe(1);
  });

  it("does not count the word inside a comment", () => {
    expect(countRootBlocks(`/* :root { --old: #fff; } */ :root { --a: 1; }`)).toBe(1);
  });

  it("does not count a false positive like --root or .root", () => {
    expect(countRootBlocks(`.root { --a: 1; } .my-root { --b: 2; }`)).toBe(0);
  });
});
