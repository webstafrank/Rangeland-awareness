/**
 * The committed criteria artifact must match the registry that generates it.
 *
 * `contracts/criteria.json` is read by the Python service, which is
 * authoritative for the numbers a run produces. If it drifts from the
 * TypeScript registry the app renders one set of class tables and the service
 * computes with another, and the map would be wrong in a way nothing else
 * catches — the two would each be internally consistent.
 *
 * So the artifact is checked rather than trusted. Forgetting to re-run the
 * export after editing a table is a red gate, not a silent divergence.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCriteriaExport, serialiseCriteriaExport } from "@/services/criteria/export";

const artifactPath = fileURLToPath(
  new URL("../../../../contracts/criteria.json", import.meta.url),
);

describe("contracts/criteria.json", () => {
  it("exists and parses", () => {
    const raw = readFileSync(artifactPath, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("is byte-identical to what the registry generates", () => {
    // Byte-level rather than deep-equal: the Python side reads this file, and
    // a formatting-only difference means someone hand-edited the artifact,
    // which is the habit this test exists to stop.
    const committed = readFileSync(artifactPath, "utf8");
    expect(committed).toBe(serialiseCriteriaExport());
  });

  it("carries both overlay topics with their criteria", () => {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    expect(Object.keys(artifact.topics).sort()).toEqual(["flood-risk", "landslide"]);
    expect(artifact.topics["flood-risk"].criteria).toHaveLength(5);
    expect(artifact.topics["landslide"].criteria).toHaveLength(7);
  });

  it("carries the notebook's weights for flood and none for landslide", () => {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    expect(artifact.topics["flood-risk"].defaultWeights).toEqual({
      elevation: 0.25,
      slope: 0.15,
      dist_to_river: 0.35,
      rainfall: 0.2,
      landcover: 0.05,
    });
    // Landslide weights are derived from pairwise comparison, so shipping a
    // default set would defeat the reason services/ahp exists.
    expect(artifact.topics.landslide.defaultWeights).toBeNull();
  });

  it("keeps lithology unfilled in the artifact too", () => {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    const lithology = artifact.topics.landslide.criteria.find(
      (c: { id: string }) => c.id === "lithology",
    );
    expect(lithology.calibration).toBe("required");
    expect(lithology.scale.classes).toEqual([]);
  });

  it("preserves the slope inversion across the boundary", () => {
    // The guard that matters most, re-asserted on the serialised form: if the
    // export ever flattened the two topics into one shared table, the service
    // would compute landslide susceptibility upside down.
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    const slopeOf = (topic: string) =>
      artifact.topics[topic].criteria.find((c: { id: string }) => c.id === "slope")
        .scale.classes;

    const flood = slopeOf("flood-risk");
    const slide = slopeOf("landslide");
    expect(flood[0].risk).toBe(5); // flat is worst for flood
    expect(slide[0].risk).toBe(1); // flat is safest for landslide
    expect(flood).not.toEqual(slide);
  });

  it("does not silently gain a topic", () => {
    // A new overlay topic must be a deliberate edit to EXPORTED_TOPICS, not
    // something that appears because a registry key was added elsewhere.
    expect(Object.keys(buildCriteriaExport().topics)).toEqual([
      "flood-risk",
      "landslide",
    ]);
  });
});
