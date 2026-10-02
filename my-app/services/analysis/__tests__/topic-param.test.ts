import { describe, expect, it } from "vitest";
import { TOPICS, topicFromParam } from "../topics";

describe("topicFromParam", () => {
  it("returns the topic a known slug names", () => {
    for (const topic of TOPICS) expect(topicFromParam(topic.slug)).toBe(topic);
  });

  it("falls back to the first topic when the param is missing", () => {
    expect(topicFromParam(undefined)).toBe(TOPICS[0]);
  });

  it("falls back to the first topic for an unknown or empty slug", () => {
    expect(topicFromParam("volcanoes")).toBe(TOPICS[0]);
    expect(topicFromParam("")).toBe(TOPICS[0]);
    // Case matters: slugs are lowercase, and a near miss is still unknown.
    expect(topicFromParam("Flood-Risk")).toBe(TOPICS[0]);
  });

  it("takes the first value of a repeated param, as URLSearchParams.get does", () => {
    expect(topicFromParam([TOPICS[2].slug, TOPICS[1].slug])).toBe(TOPICS[2]);
    expect(topicFromParam(["volcanoes", TOPICS[1].slug])).toBe(TOPICS[0]);
    expect(topicFromParam([])).toBe(TOPICS[0]);
  });
});
