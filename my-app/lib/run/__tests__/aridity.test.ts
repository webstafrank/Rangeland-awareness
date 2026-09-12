/**
 * The climate proxy.
 *
 * It is a hand-fitted function, so the only thing that keeps it honest is a
 * list of places anyone can check against a rainfall map. If a later tweak
 * moves the highlands into the desert, this file says so by name rather than by
 * a distribution shifting somewhere three modules downstream.
 *
 * These are assertions about GEOGRAPHY, not about the numbers: each one says
 * which class a place lands in and how it ranks against another place, never
 * that Kericho is exactly 0.128.
 */
import { describe, expect, it } from "vitest";
import { aridityAt, aridityClass, aridityOfBounds } from "@/lib/run/aridity";
import { KERICHO, MOMBASA, MURANGA, TURKANA, WAJIR } from "./fixtures";

/** Real coordinates. Anyone can check these against a map of Kenya. */
const PLACES = {
  Turkana: [3.1, 35.6],
  Marsabit: [2.33, 37.99],
  Wajir: [1.75, 40.06],
  Mandera: [3.94, 41.87],
  Garissa: [-0.45, 39.64],
  Kitui: [-1.37, 38.01],
  Kajiado: [-1.85, 36.78],
  Kisumu: [-0.1, 34.75],
  Kericho: [-0.37, 35.28],
  Kakamega: [0.28, 34.75],
  Nyeri: [-0.42, 36.95],
  Muranga: [-0.72, 37.15],
  Mombasa: [-4.05, 39.66],
  Malindi: [-3.22, 40.12],
  Nairobi: [-1.29, 36.82],
} as const;

const arid = (name: keyof typeof PLACES): number =>
  aridityAt(PLACES[name][0], PLACES[name][1]);

describe("the ASAL belt reads arid", () => {
  it.each(["Turkana", "Marsabit", "Wajir", "Mandera", "Garissa", "Kitui"] as const)(
    "%s",
    (name) => {
      expect(aridityClass(arid(name))).toBe("arid");
    },
  );
});

describe("the wet country reads humid", () => {
  it.each(["Kisumu", "Kericho", "Kakamega", "Nyeri", "Muranga", "Mombasa", "Malindi"] as const)(
    "%s",
    (name) => {
      expect(aridityClass(arid(name))).toBe("humid");
    },
  );
});

describe("the in-between reads in between", () => {
  it("puts Nairobi and Kajiado between the highlands and the desert", () => {
    expect(aridityClass(arid("Nairobi"))).toBe("semi-arid");
    expect(aridityClass(arid("Kajiado"))).toBe("arid");
    expect(arid("Nairobi")).toBeGreaterThan(arid("Nyeri"));
    expect(arid("Nairobi")).toBeLessThan(arid("Garissa"));
  });
});

describe("the gradient runs the right way", () => {
  it("is drier going north up the Rift", () => {
    expect(arid("Turkana")).toBeGreaterThan(arid("Kericho"));
  });

  it("is drier going east off the central highlands", () => {
    expect(arid("Garissa")).toBeGreaterThan(arid("Muranga"));
  });

  it("wets again at the coast, so Mombasa is not read as part of Tsavo", () => {
    expect(arid("Mombasa")).toBeLessThan(arid("Kitui"));
    // The coast bump is narrow in longitude on purpose: a hundred kilometres
    // inland is already dry country.
    expect(aridityAt(-3.4, 38.36)).toBeGreaterThan(arid("Mombasa") + 0.3);
  });

  it("is smooth: a tenth of a degree cannot change the class", () => {
    for (const [lat, lon] of Object.values(PLACES)) {
      expect(Math.abs(aridityAt(lat + 0.1, lon) - aridityAt(lat, lon))).toBeLessThan(0.08);
      expect(Math.abs(aridityAt(lat, lon + 0.1) - aridityAt(lat, lon))).toBeLessThan(0.08);
    }
  });
});

describe("edges", () => {
  it("stays inside its bounds everywhere on Earth", () => {
    for (let lat = -90; lat <= 90; lat += 3) {
      for (let lon = -180; lon <= 180; lon += 6) {
        const value = aridityAt(lat, lon);
        expect(value).toBeGreaterThanOrEqual(0.05);
        expect(value).toBeLessThanOrEqual(0.98);
      }
    }
  });

  it("returns the midpoint rather than NaN for a broken coordinate", () => {
    expect(aridityAt(Number.NaN, 37)).toBe(0.5);
    expect(aridityAt(1, Number.POSITIVE_INFINITY)).toBe(0.5);
  });

  /**
   * Stated rather than fixed. Every wet term is a bump centred inside Kenya, so
   * an area drawn over Uganda comes back near the dry base. The app is a Kenyan
   * tool; inventing a global climatology would be the bigger lie.
   */
  it("reads out-of-country areas as dry, which is the documented limit", () => {
    expect(aridityClass(aridityAt(51.5, -0.12))).toBe("arid"); // London
    expect(aridityClass(aridityAt(0.32, 32.58))).toBe("arid"); // Kampala, genuinely wet
  });

  it("reads an area at its bounding-box centre", () => {
    expect(aridityOfBounds(TURKANA.bounds)).toBeCloseTo(aridityAt(3.1, 35.6), 10);
  });
});

describe("the fixture areas span the gradient", () => {
  it("so the engine tests can show a climate effect at all", () => {
    expect(aridityClass(aridityOfBounds(TURKANA.bounds))).toBe("arid");
    expect(aridityClass(aridityOfBounds(WAJIR.bounds))).toBe("arid");
    expect(aridityClass(aridityOfBounds(MURANGA.bounds))).toBe("humid");
    expect(aridityClass(aridityOfBounds(KERICHO.bounds))).toBe("humid");
    expect(aridityClass(aridityOfBounds(MOMBASA.bounds))).toBe("humid");
  });
});

describe("aridityClass", () => {
  it("splits on its stated boundaries, half-open upward", () => {
    expect(aridityClass(0)).toBe("humid");
    expect(aridityClass(0.4499)).toBe("humid");
    expect(aridityClass(0.45)).toBe("semi-arid");
    expect(aridityClass(0.7499)).toBe("semi-arid");
    expect(aridityClass(0.75)).toBe("arid");
    expect(aridityClass(1)).toBe("arid");
  });
});
