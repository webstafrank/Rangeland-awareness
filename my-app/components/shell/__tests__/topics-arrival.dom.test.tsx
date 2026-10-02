import { act, render } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import TopicsArrival from "@/components/shell/TopicsArrival";

/**
 * The trigger half of the Run Analysis entrance. The motion itself (smooth
 * scroll, stagger timing, Back from a topic) needs a real browser and is
 * evals/journey.spec.ts M5 to M5d; this pins which clicks count as an arrival
 * and what the island does to the section when one happens.
 */

function mount() {
  document.body.innerHTML = `
    <a id="run" href="/#topics">Run Analysis</a>
    <a id="other-hash" href="/#models">Models</a>
    <a id="other-page" href="/reports#topics">Reports</a>
    <section id="topics"><h2 tabindex="-1">Choose a topic</h2><ul><li>card</li></ul></section>`;
  const section = document.getElementById("topics")!;
  const view = render(<TopicsArrival id="topics" />, { container: section.appendChild(document.createElement("div")) });
  return { section, view, heading: section.querySelector("h2")! };
}

/** Holds every animation open until release() is called. */
function holdAnimations(section: HTMLElement) {
  let release!: () => void;
  const finished = new Promise<void>((r) => (release = r));
  section.getAnimations = () => [{ finished } as unknown as Animation];
  return () => act(async () => release());
}

const click = (el: Element, init: MouseEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
  });

// In the app next/link cancels the native navigation; here nothing would, and
// jsdom logs "navigation to another Document" for every link click.
const cancel = (e: Event) => e.preventDefault();
beforeAll(() => window.addEventListener("click", cancel));
afterAll(() => window.removeEventListener("click", cancel));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

test("a plain click on a link to this page's #topics marks the section and focuses its heading", async () => {
  const { section, heading } = mount();
  const release = holdAnimations(section);

  await click(document.getElementById("run")!);
  expect(section.hasAttribute("data-arriving")).toBe(true);
  expect(document.activeElement).toBe(heading);

  // Comes off once the cards finish, so the scroll reveal is back.
  await release();
  expect(section.hasAttribute("data-arriving")).toBe(false);
});

test.each([
  ["meta", { metaKey: true }],
  ["ctrl", { ctrlKey: true }],
  ["shift", { shiftKey: true }],
  ["alt", { altKey: true }],
  ["middle button", { button: 1 }],
])("a %s click opens elsewhere and does not count", async (_, init) => {
  const { section } = mount();
  holdAnimations(section);
  await click(document.getElementById("run")!, init);
  expect(section.hasAttribute("data-arriving")).toBe(false);
});

test("links to another hash or another page do not count", async () => {
  const { section } = mount();
  holdAnimations(section);
  await click(document.getElementById("other-hash")!);
  await click(document.getElementById("other-page")!);
  await click(section);
  expect(section.hasAttribute("data-arriving")).toBe(false);
});

test("a click while the URL is already /#topics scrolls the section itself", async () => {
  const { section } = mount();
  holdAnimations(section);
  const calls: unknown[][] = [];
  section.scrollIntoView = (...args: unknown[]) => void calls.push(args);

  // First click: the URL is "/", Next does the scroll, so this must not.
  await click(document.getElementById("run")!);
  expect(calls).toEqual([]);

  // Now at /#topics, as after Next's navigation: Next would not scroll.
  window.history.replaceState(null, "", "/#topics");
  await click(document.getElementById("run")!);
  // No options, so CSS scroll-behavior decides smooth or instant.
  expect(calls).toEqual([[]]);
});

test("mounting with #topics already in the URL counts as an arrival", async () => {
  window.history.replaceState(null, "", "/#topics");
  document.body.innerHTML = `<section id="topics"><h2 tabindex="-1">Choose a topic</h2></section>`;
  const section = document.getElementById("topics")!;
  holdAnimations(section);
  render(<TopicsArrival id="topics" />, { container: section.appendChild(document.createElement("div")) });
  expect(section.hasAttribute("data-arriving")).toBe(true);
  expect(document.activeElement).toBe(section.querySelector("h2"));
});

test("an older arrival finishing does not cut a newer one short", async () => {
  const { section } = mount();
  const releaseFirst = holdAnimations(section);
  await click(document.getElementById("run")!);
  holdAnimations(section); // the second arrival's animations, still running
  await click(document.getElementById("run")!);

  await releaseFirst();
  expect(section.hasAttribute("data-arriving")).toBe(true);
});

test("unmounting stops listening", async () => {
  const { section, view } = mount();
  holdAnimations(section);
  view.unmount();
  await click(document.getElementById("run")!);
  expect(section.hasAttribute("data-arriving")).toBe(false);
});

test("without the Web Animations API the attribute still comes off", async () => {
  const { section } = mount();
  expect(section.getAnimations).toBeUndefined();
  await click(document.getElementById("run")!);
  await act(async () => {});
  expect(section.hasAttribute("data-arriving")).toBe(false);
});
