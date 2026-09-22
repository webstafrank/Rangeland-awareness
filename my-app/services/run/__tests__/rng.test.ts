/**
 * The generator is the foundation of the determinism promise, so it is pinned
 * by its actual output, not only by its properties. If a refactor changes these
 * numbers, every shared result URL in existence starts returning different
 * figures, and that has to fail loudly here rather than quietly in production.
 */
import { describe, expect, it } from "vitest";
import {
  bell,
  clamp,
  mulberry32,
  pickDistinct,
  roundTo,
  signedBell,
  uniform,
} from "@/services/run/rng";

describe("mulberry32", () => {
  it("produces the same sequence for the same seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    expect([a(), a(), a(), a(), a()]).toEqual([b(), b(), b(), b(), b()]);
  });

  it("produces a different sequence for a different seed", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it("stays inside [0, 1)", () => {
    const rng = mulberry32(0xdecafbad);
    for (let i = 0; i < 5000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("is pinned to a known output for a known seed", () => {
    const rng = mulberry32(42);
    expect([rng(), rng(), rng()].map((v) => roundTo(v, 12))).toEqual([
      0.60110375192, 0.448290558998, 0.85246579349,
    ]);
  });

  it("accepts a negative or oversized seed by coercing to uint32", () => {
    expect(mulberry32(-1)()).toBe(mulberry32(0xffffffff)());
    expect(mulberry32(2 ** 32 + 7)()).toBe(mulberry32(7)());
  });

  it("has a mean near 0.5 over many draws, so the numbers it feeds are not skewed", () => {
    const rng = mulberry32(7);
    let sum = 0;
    const draws = 20000;
    for (let i = 0; i < draws; i += 1) sum += rng();
    expect(Math.abs(sum / draws - 0.5)).toBeLessThan(0.01);
  });
});

describe("helpers", () => {
  it("uniform stays inside its bounds", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i += 1) {
      const value = uniform(rng, -3, 7);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThan(7);
    }
  });

  it("bell stays inside [0, 1) and signedBell inside (-1, 1)", () => {
    const rng = mulberry32(1234);
    for (let i = 0; i < 1000; i += 1) {
      const b = bell(rng);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(1);
      const s = signedBell(rng);
      expect(s).toBeGreaterThan(-1);
      expect(s).toBeLessThan(1);
    }
  });

  it("bell clusters around the middle, which is why it is not a uniform", () => {
    const rng = mulberry32(2024);
    let middle = 0;
    const draws = 20000;
    for (let i = 0; i < draws; i += 1) {
      if (Math.abs(bell(rng) - 0.5) < 0.1) middle += 1;
    }
    // A uniform would put 20% of its draws inside the middle fifth. The mean of
    // three uniforms puts distinctly more there, which is the whole point.
    expect(middle / draws).toBeGreaterThan(0.3);
  });

  it("pickDistinct returns the asked-for count, distinct, ascending, in range", () => {
    const picked = pickDistinct(mulberry32(5), 4, 12);
    expect(picked).toHaveLength(4);
    expect(new Set(picked).size).toBe(4);
    expect([...picked].sort((a, b) => a - b)).toEqual([...picked]);
    for (const index of picked) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(12);
    }
  });

  it("pickDistinct never asks for more than exists", () => {
    expect(pickDistinct(mulberry32(5), 10, 3)).toHaveLength(3);
    expect(pickDistinct(mulberry32(5), 0, 3)).toHaveLength(0);
    expect(pickDistinct(mulberry32(5), 2, 0)).toHaveLength(0);
    expect(pickDistinct(mulberry32(5), -4, 8)).toHaveLength(0);
  });

  it("pickDistinct is stable for a seed", () => {
    expect(pickDistinct(mulberry32(77), 3, 24)).toEqual(pickDistinct(mulberry32(77), 3, 24));
  });

  it("pickDistinct advances the stream by exactly `count` draws, whatever it picks", () => {
    // Load-bearing: if the draw count varied with collisions, every generator
    // downstream of a gap draw would shift when the window length changed.
    const a = mulberry32(31);
    pickDistinct(a, 3, 40);
    const b = mulberry32(31);
    b();
    b();
    b();
    expect(a()).toBe(b());
  });

  it("clamp and roundTo behave", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(roundTo(1.23456, 2)).toBe(1.23);
    expect(roundTo(-1.23456, 3)).toBe(-1.235);
    expect(roundTo(7, 0)).toBe(7);
  });

  /**
   * The documented limit of `roundTo`, pinned so nobody "fixes" it with an
   * epsilon and shifts every synthetic value in the module.
   *
   * 1.005 is not 1.005 in binary floating point, it is 1.00499999999999989, so
   * `Math.round(1.005 * 100)` is `Math.round(100.49999999999999)`, which is 100
   * and the result is 1. Every naive decimal rounder in every language has this
   * edge. It is acceptable because `roundTo` only trims display values here,
   * never money and never anything summed.
   */
  it("rounds a value that is not exactly representable down, not half up", () => {
    expect(roundTo(1.005, 2)).toBe(1);
    // The same value one ulp higher does land on 1.01, which shows the cause is
    // the input's representation and not the rounding logic.
    expect(roundTo(1.00501, 2)).toBe(1.01);
  });
});
