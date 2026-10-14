/**
 * Gate tests for the words the Areas map says after Identify place
 * (components/topic/useAdminMapSync.ts). The behaviour itself, a click
 * filling the boxes, is proved end to end by evals T4g and T4h.
 */

import { describe, expect, it } from "vitest";
import { IDENTIFY_NOTES, identifiedNote } from "../useAdminMapSync";

describe("identifiedNote", () => {
  it("names a ward with its sub-county and county, and says what to do", () => {
    expect(identifiedNote("ward:tana-river:bura:bangale")).toBe(
      "Bangale ward, Bura, Tana River. Press Add to add it.",
    );
  });

  it("names a county on its own", () => {
    expect(identifiedNote("county:turkana")).toBe("Turkana county. Press Add to add it.");
  });

  it("is empty for an unknown id rather than throwing", () => {
    expect(identifiedNote("ward:nowhere:x:y")).toBe("");
  });
});

describe("IDENTIFY_NOTES", () => {
  it("tells the analyst what to do next in every failure", () => {
    expect(IDENTIFY_NOTES.outside).toMatch(/click inside the border/i);
    expect(IDENTIFY_NOTES.failed).toMatch(/click again/i);
  });
});
