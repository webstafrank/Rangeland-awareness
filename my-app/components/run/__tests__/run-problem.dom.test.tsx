/**
 * Gate tests for RunProblem's per-case wording.
 *
 * The bug this pins: every caller got "Nothing was submitted, so nothing is
 * running", including the running and results routes when a run id existed
 * and the service simply did not answer. That sentence is false there, and it
 * is the one that sends an analyst off to start a second run.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Route } from "next";

import RunProblem from "../RunProblem";
import { getTopic } from "@/services/analysis/topics";

const TOPIC = getTopic("flood-risk")!;
const RETRY = "/topics/flood-risk/running?run=r_8f3c21a9c4e1" as Route;

function renderProblem(props: Partial<Parameters<typeof RunProblem>[0]> = {}) {
  return render(
    <RunProblem
      topic={TOPIC}
      title="The analysis service is not answering"
      message="The run may still be going; this page could not reach the service to ask."
      query=""
      receiptHref={null}
      {...props}
    />,
  );
}

describe("RunProblem", () => {
  it("says nothing is running when nothing was submitted (the default)", () => {
    renderProblem({ title: "There is no run on this link", message: "No id." });
    expect(screen.getByText(/nothing was submitted, so nothing is running/i)).toBeInTheDocument();
    expect(screen.getByTestId("run-problem")).toHaveTextContent("No id.");
    expect(screen.queryByRole("link", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("never claims nothing is running when the service did not answer", () => {
    renderProblem({ kind: "unreachable", retryHref: RETRY });
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/nothing was submitted|nothing is running/i);
    expect(screen.getByText(/the run has not failed/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /try again/i })).toHaveAttribute("href", RETRY);
    expect(screen.getByRole("link", { name: /back to review/i })).toHaveAttribute(
      "href",
      "/topics/flood-risk/review",
    );
  });

  it("says the service has no such run when it answered 404", () => {
    renderProblem({ kind: "not-found", title: "This run does not exist", message: "No run." });
    expect(screen.getByText(/has no run under this id/i)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/nothing was submitted/i);
  });

  it("names the problem in a heading", () => {
    renderProblem();
    expect(
      screen.getByRole("heading", { name: /the analysis service is not answering/i }),
    ).toBeInTheDocument();
  });
});
