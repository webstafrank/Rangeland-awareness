import { describe, expect, it } from "vitest";
import { BRAND_RAMP, appTheme } from "@/lib/theme/fluent-theme";
import { token } from "@/lib/theme/palette";
import { luminance, parseColor, type Rgb } from "@/lib/theme/contrast";

/*
 * The Fluent theme is what makes a Fluent Button and a Tailwind ButtonLink
 * paint the same blue. These pins fail the moment the accent moves in
 * palette.ts and the ramp does not move with it.
 */
describe("the Fluent theme is the app palette", () => {
  it("fills the primary action with the accent", () => {
    expect(appTheme.colorBrandBackground).toBe(token("--color-accent"));
  });

  it("hovers and presses with the accent's own hover and pressed steps", () => {
    expect(appTheme.colorBrandBackgroundHover).toBe(token("--color-accent-hover"));
    expect(appTheme.colorBrandBackgroundPressed).toBe(token("--color-accent-pressed"));
  });

  it("draws links in the accent link colour", () => {
    expect(appTheme.colorBrandForegroundLink).toBe(token("--color-accent-link"));
  });

  it("uses the app's ink and strokes, not Fluent's greys", () => {
    expect(appTheme.colorNeutralForeground1).toBe(token("--color-ink"));
    expect(appTheme.colorNeutralStroke1).toBe(token("--color-edge-strong"));
    expect(appTheme.colorNeutralStrokeAccessible).toBe(token("--color-edge-input"));
  });

  it("draws disabled controls with the same tokens as the Tailwind recipes", () => {
    expect(appTheme.colorNeutralBackgroundDisabled).toBe(token("--color-sunken"));
    expect(appTheme.colorNeutralForegroundDisabled).toBe(token("--color-ink-faint"));
    expect(appTheme.colorNeutralStrokeDisabled).toBe(token("--color-edge"));
  });

  it("keeps the brand ramp ordered dark to light", () => {
    const steps = Object.entries(BRAND_RAMP)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, hex]) => luminance(parseColor(hex) as Rgb));
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i], `step ${(i + 1) * 10}`).toBeGreaterThan(steps[i - 1]);
    }
  });

  it("matches the radius tokens", () => {
    expect(appTheme.borderRadiusMedium).toBe("6px");
    expect(appTheme.borderRadiusXLarge).toBe("10px");
  });
});
