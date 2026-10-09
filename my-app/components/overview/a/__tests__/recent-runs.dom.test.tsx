import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { RecentRuns, startedAgo } from "@/components/overview/a/RecentRuns";
import { recordRun, resetRunHistoryForTests } from "@/services/run-history";

const NOW = Date.parse("2026-10-09T12:00:00+03:00");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

describe("startedAgo", () => {
  it.each([
    [0, "just now"],
    [0.5, "just now"],
    [12, "12 minutes ago"],
    [90, "2 hours ago"],
    [60 * 24, "yesterday"],
    [60 * 24 * 3, "3 days ago"],
  ])("%s minutes ago reads %s", (minutes, expected) => {
    expect(startedAgo(at(minutes), NOW)).toBe(expected);
  });
});

describe("RecentRuns", () => {
  beforeEach(() => {
    localStorage.clear();
    resetRunHistoryForTests();
  });
  afterEach(() => resetRunHistoryForTests());

  it("says plainly when this browser has started no runs, and offers a way to start one", () => {
    render(<RecentRuns />);
    const card = screen.getByTestId("recent-runs");
    expect(within(card).getByText("Started in this browser")).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: /no runs started in this browser yet/i })).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Choose a topic" })).toHaveAttribute("href", "/#topics");
  });

  it("lists recorded runs newest first, each linked to its own run", () => {
    render(<RecentRuns />);
    act(() => {
      recordRun({ runId: "r_old", topic: "drought-monitoring", startedAt: at(90), query: "?type=single" });
      recordRun({ runId: "r_new", topic: "flood-risk", startedAt: at(5), query: "?type=single&model=xgboost" });
    });
    const links = within(screen.getByTestId("recent-runs")).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent("Flood risk");
    expect(links[0].getAttribute("href")).toMatch(/^\/topics\/flood-risk\/running\?.*\brun=r_new/);
    expect(links[0].getAttribute("href")).toContain("model=xgboost");
    expect(links[1]).toHaveTextContent("Drought monitoring");
  });

  it("shows at most five", () => {
    for (let i = 0; i < 8; i += 1) {
      recordRun({ runId: `r_${i}`, topic: "flood-risk", startedAt: at(i), query: "" });
    }
    render(<RecentRuns />);
    expect(within(screen.getByTestId("recent-runs")).getAllByRole("link")).toHaveLength(5);
  });
});
