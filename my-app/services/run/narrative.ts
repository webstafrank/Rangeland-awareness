/**
 * The plain-language reading of a result.
 *
 * Two sentences at most, generated from the numbers the run actually produced,
 * because the whole point of the results page is that somebody who is not a
 * remote sensing specialist can read it.
 *
 * The hard part is direction. The same arrow means opposite things for
 * different indicators: a rising Vegetation Health Index is a recovery, a
 * rising flood susceptibility is not. `indicator.badEnd` is the only thing that
 * decides which, and it is read HERE, when the sentence is written, never when
 * `changeYoY` is computed. That number stays a signed change in indicator units
 * all the way through the CSV and the JSON, so a consumer can interpret it
 * their own way.
 */

import type { AnalysisTypeId } from "@/services/analysis/models";
import { SEVERITY_ORDER } from "@/services/run/constants";
import { formatValue } from "@/services/run/indicators";
import type { AreaResult, IndicatorSpec } from "@/services/run/result";

/** True when `a` is in worse shape than `b`: severity first, then the value itself. */
export function isWorse(a: AreaResult, b: AreaResult, indicator: IndicatorSpec): boolean {
  const rankA = SEVERITY_ORDER.indexOf(a.band.severity);
  const rankB = SEVERITY_ORDER.indexOf(b.band.severity);
  if (rankA !== rankB) return rankA > rankB;
  return indicator.badEnd === "high"
    ? a.estimate.value > b.estimate.value
    : a.estimate.value < b.estimate.value;
}

/** The area a reader should look at first. */
export function worstArea(
  areas: readonly AreaResult[],
  indicator: IndicatorSpec,
): AreaResult | undefined {
  return areas.reduce<AreaResult | undefined>(
    (worst, candidate) => (!worst || isWorse(candidate, worst, indicator) ? candidate : worst),
    undefined,
  );
}

/**
 * Whether a change moved in the wrong direction. The one place the asymmetry
 * between indicators is decided, so a caller never has to reason about it.
 */
export function isDeterioration(change: number, indicator: IndicatorSpec): boolean {
  return indicator.badEnd === "high" ? change > 0 : change < 0;
}

/**
 * A change smaller than half a display step rounds away to nothing on the page,
 * so calling it a rise or a fall would contradict the number printed next to it.
 */
function isFlat(change: number, indicator: IndicatorSpec): boolean {
  return Math.abs(change) < 0.5 * 10 ** -indicator.precision;
}

export function narrativeFor(
  areas: readonly AreaResult[],
  indicator: IndicatorSpec,
  analysisType: AnalysisTypeId,
): string {
  const worst = worstArea(areas, indicator);
  if (!worst) return "This run selected no areas, so there is nothing to report.";

  const reading = `${formatValue(indicator, worst.estimate.value)} (${worst.band.label.toLowerCase()})`;
  const first =
    analysisType === "comparison" && areas.length > 1
      ? `${worst.label} is the worst of the ${areas.length} areas compared, at ${reading}.`
      : `${worst.label} reads ${reading} for ${indicator.label}.`;

  if (isFlat(worst.changeYoY, indicator)) {
    return `${first} That is level with the same window a year earlier.`;
  }

  const direction = worst.changeYoY > 0 ? "rose" : "fell";
  const verdict = isDeterioration(worst.changeYoY, indicator) ? "a deterioration" : "an improvement";
  const magnitude = formatValue(indicator, Math.abs(worst.changeYoY));
  return (
    `${first} ${indicator.label} ${direction} by ${magnitude} against the same window ` +
    `a year earlier, ${verdict}.`
  );
}
