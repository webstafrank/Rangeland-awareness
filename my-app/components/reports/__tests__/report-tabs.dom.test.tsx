import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { MIN_SKELETON_MS, ReportTabs, type ReportTab } from "@/components/reports/ReportTabs";
import { TOPICS } from "@/services/analysis/topics";

/**
 * The tab switch's state machine, without a browser: which URL a tab pushes,
 * when the skeleton shows, and how long it holds. The look of it (shimmer,
 * fade, alignment) and the real round trip are evals/reports.spec.ts.
 */

const push = vi.fn();
const prefetch = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch }) }));

const TABS: readonly ReportTab[] = TOPICS.map(({ slug, name, question }) => ({ slug, name, question }));

const view = (active: ReportTab["slug"]) => (
  <ReportTabs tabs={TABS} active={active}>
    <p>report for {active}</p>
  </ReportTabs>
);

const tab = (name: string) => screen.getByRole("tab", { name });
const skeleton = () => screen.queryByTestId("report-skeleton");

// Fluent's first render in a fresh VM context sets up its style machinery,
// ~0.5s billed to whichever test runs first and over the 2s gate budget under
// the parallel suite (as in result-view.dom.test.tsx). Paid here instead.
beforeAll(() => {
  render(view("flood-risk")).unmount();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  push.mockReset();
  prefetch.mockReset();
});
afterEach(() => vi.useRealTimers());

test("renders the four tabs with the active one selected and its report shown", () => {
  render(view("drought-monitoring"));
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(tab("Drought monitoring")).toHaveAttribute("aria-selected", "true");
  expect(tab("Flood risk")).toHaveAttribute("aria-selected", "false");
  expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Drought monitoring");
  expect(screen.getByText("report for drought-monitoring")).toBeInTheDocument();
  expect(skeleton()).toBeNull();
  // Nothing to announce on arrival: the page itself is the news.
  expect(screen.getByRole("status")).toHaveTextContent("");
});

test("prefetches every other tab's URL", () => {
  render(view("flood-risk"));
  expect(prefetch.mock.calls.map(([href]) => href).sort()).toEqual([
    "/reports?topic=drought-monitoring",
    "/reports?topic=food-security",
    "/reports?topic=rangeland-dynamics",
  ]);
});

test("choosing a tab pushes its URL without scrolling and shows the skeleton at once", () => {
  render(view("flood-risk"));
  fireEvent.click(tab("Rangeland dynamics"));

  expect(push).toHaveBeenCalledWith("/reports?topic=rangeland-dynamics", { scroll: false });
  expect(tab("Rangeland dynamics")).toHaveAttribute("aria-selected", "true");
  expect(skeleton()).not.toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Loading the Rangeland dynamics report");
  expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Rangeland dynamics");
  // The skeleton leads with the real header, since the topic is known.
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Rangeland dynamics");
});

test("the status line is one node that changes, loading then loaded", () => {
  const { rerender } = render(view("flood-risk"));
  const status = screen.getByRole("status");
  fireEvent.click(tab("Food security assessment"));
  expect(status).toHaveTextContent("Loading the Food security assessment report");
  rerender(view("food-security"));
  act(() => vi.advanceTimersByTime(MIN_SKELETON_MS));
  // Same element throughout, which is what a screen reader announces.
  expect(screen.getByRole("status")).toBe(status);
  expect(status).toHaveTextContent("Food security assessment report loaded");
});

test("the skeleton holds for its minimum even when the report arrives at once", () => {
  const { rerender } = render(view("flood-risk"));
  fireEvent.click(tab("Rangeland dynamics"));
  // The server's answer, immediately.
  rerender(view("rangeland-dynamics"));

  act(() => vi.advanceTimersByTime(MIN_SKELETON_MS - 1));
  expect(skeleton()).not.toBeNull();

  act(() => vi.advanceTimersByTime(1));
  expect(skeleton()).toBeNull();
  expect(screen.getByText("report for rangeland-dynamics")).toBeInTheDocument();
  expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
});

test("choosing the tab already selected does nothing", () => {
  render(view("flood-risk"));
  fireEvent.click(tab("Flood risk"));
  expect(push).not.toHaveBeenCalled();
  expect(skeleton()).toBeNull();
});

test("a URL change from outside (Back) moves the selection with no skeleton", () => {
  const { rerender } = render(view("food-security"));
  rerender(view("drought-monitoring"));
  expect(tab("Drought monitoring")).toHaveAttribute("aria-selected", "true");
  expect(skeleton()).toBeNull();
  expect(screen.getByText("report for drought-monitoring")).toBeInTheDocument();
});
