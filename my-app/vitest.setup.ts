import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { Button } from "@fluentui/react-components";
import { afterEach, beforeAll } from "vitest";

afterEach(() => {
  cleanup();
});

/*
 * Pay the dom lane's first-use costs before any test's 2s budget starts.
 *
 * vmThreads gives every test file a fresh VM context, so each file's FIRST
 * test used to pay, on top of its own work: Fluent and Griffel setting up
 * their style machinery on the first render, and dom-testing-library's role
 * and accessible-name code on the first query. Measured in a parallel dom-lane
 * run, first tests took 0.8 to 1.1s against ~0.2 to 0.3s for their
 * neighbours, and a machine at load ~4.5 pushed them past 2s, failing the
 * pre-commit hook on tests nobody had touched (ResultView, RunningScreen).
 * Here it runs under the hook timeout instead, once per file.
 */
beforeAll(() => {
  const view = render(createElement(Button, null, "warm up"));
  screen.getByRole("button", { name: "warm up" });
  view.unmount();
});

// jsdom implements neither of these, and both are used by the results screen
// (reduced-motion checks and the map's resize observer). Stubbing them here
// keeps every component test from having to.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
