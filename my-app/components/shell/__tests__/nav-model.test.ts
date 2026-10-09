import { describe, expect, it } from "vitest";
import {
  PRIMARY_ITEMS,
  SUPPORT_ITEMS,
  TOPIC_ITEMS,
  crumbsFor,
  currentTopic,
} from "@/components/shell/nav-model";
import { TOPICS } from "@/services/analysis/topics";
import { STEPS } from "@/services/analysis/steps";

describe("primary items", () => {
  it("are Explore, Analysis and Reports, in that order", () => {
    expect(PRIMARY_ITEMS.map((i) => [i.label, i.href])).toEqual([
      ["Explore", "/data"],
      ["Analysis", "/#topics"],
      ["Reports", "/reports"],
    ]);
  });

  it.each([
    ["/data", "Explore"],
    ["/reports", "Reports"],
    ["/topics/flood-risk", "Analysis"],
    ["/topics/flood-risk/areas", "Analysis"],
    ["/topics/food-security/results", "Analysis"],
  ])("marks exactly one item current on %s", (path, label) => {
    const current = PRIMARY_ITEMS.filter((i) => i.current(path)).map((i) => i.label);
    expect(current).toEqual([label]);
  });

  it.each(["/", "/help", "/account", "/login", "/topics/not-a-topic"])("marks nothing current on %s", (path) => {
    expect(PRIMARY_ITEMS.filter((i) => i.current(path))).toEqual([]);
  });
});

describe("topic items", () => {
  it("list every registered topic, linked to its first step", () => {
    expect(TOPIC_ITEMS.map((t) => t.href)).toEqual(TOPICS.map((t) => `/topics/${t.slug}`));
  });

  it("know which topic a nested path is in", () => {
    expect(currentTopic("/topics/drought-monitoring/review")).toBe("drought-monitoring");
    expect(currentTopic("/topics/not-a-topic")).toBeNull();
    expect(currentTopic("/data")).toBeNull();
  });
});

describe("support items", () => {
  it("cover help, about and contact", () => {
    expect(SUPPORT_ITEMS.map((i) => i.href)).toEqual(["/help", "/about", "/contact"]);
  });
});

describe("crumbsFor", () => {
  it("names a top-level page with one crumb", () => {
    expect(crumbsFor("/")).toEqual([{ label: "Overview" }]);
    expect(crumbsFor("/data")).toEqual([{ label: "Explore data" }]);
    expect(crumbsFor("/reports/")).toEqual([{ label: "Reports" }]);
  });

  it("walks a topic step as section, topic, step", () => {
    const topic = TOPICS[0];
    for (const step of STEPS) {
      const path = `/topics/${topic.slug}${step.segment ? `/${step.segment}` : ""}`;
      expect(crumbsFor(path)).toEqual([
        { label: "Analysis", href: "/#topics" },
        { label: topic.name, href: `/topics/${topic.slug}` },
        { label: step.label },
      ]);
    }
  });

  it("names the run screens", () => {
    expect(crumbsFor("/topics/flood-risk/running").at(-1)).toEqual({ label: "Running" });
    expect(crumbsFor("/topics/flood-risk/results").at(-1)).toEqual({ label: "Results" });
  });

  it("falls back to the topic for an unknown segment, and to not-found for an unknown path", () => {
    expect(crumbsFor("/topics/flood-risk/nope").at(-1)).toEqual({ label: "Flood risk" });
    expect(crumbsFor("/somewhere")).toEqual([{ label: "Page not found" }]);
  });
});
