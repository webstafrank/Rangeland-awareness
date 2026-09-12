/**
 * The plain-language reading of a result.
 *
 * Two sentences, generated from the numbers the run actually produced, because
 * the whole point of the results page is that someone who is not a remote
 * sensing specialist can read it. The hard part is direction: the same arrow
 * means opposite things for different indicators. A rising Vegetation Condition
 * Index is recovery. A rising flood probability is not. `indicator.badEnd` is
 * the only thing that decides which, and it is read HERE, when the sentence is
 * written, never when `changeYoY` is computed: the number is a signed change in
 * indicator units and stays that way through the CSV and the JSON.
 */
import type { AnalysisType, AreaResult } from "@/contracts/analysis";
import type { IndicatorSpec } from "@/contracts/catalog";

export interface NarrativeInput {
  readonly areas: readonly AreaResult[];
  readonly indicator: IndicatorSpec;
  readonly analysisType: AnalysisType;
  /** `deps.catalog.formatValue`, so the sentence carries the indicator's own unit and precision. */
  readonly format: (value: number) => string;
}

/** True when `a` is in worse shape than `b`: severity first, then the value itself. */
export function isWorse(a: AreaResult, b: AreaResult, indicator: IndicatorSpec, order: readonly string[]): boolean {
  const rankA = order.indexOf(a.band.severity);
  const rankB = order.indexOf(b.band.severity);
  if (rankA !== rankB) return rankA > rankB;
  return indicator.badEnd === "high"
    ? a.estimate.value > b.estimate.value
    : a.estimate.value < b.estimate.value;
}

/** The area a reader should look at first. */
export function worstArea(
  areas: readonly AreaResult[],
  indicator: IndicatorSpec,
  order: readonly string[],
): AreaResult | undefined {
  return areas.reduce<AreaResult | undefined>(
    (worst, candidate) => (!worst || isWorse(candidate, worst, indicator, order) ? candidate : worst),
    undefined,
  );
}

/**
 * Whether a change is a move in the wrong direction. This is the one place the
 * asymmetry between indicators is decided.
 */
export function isDeterioration(change: number, indicator: IndicatorSpec): boolean {
  return indicator.badEnd === "high" ? change > 0 : change < 0;
}

/**
 * Changes smaller than half a display step round away to nothing, so calling
 * them a rise or a fall would contradict the number printed next to them.
 */
function isFlat(change: number, indicator: IndicatorSpec): boolean {
  return Math.abs(change) < 0.5 * 10 ** -indicator.precision;
}

export function narrativeFor(input: NarrativeInput, severityOrder: readonly string[]): string {
  const { areas, indicator, analysisType, format } = input;
  const worst = worstArea(areas, indicator, severityOrder);
  if (!worst) return "This run selected no areas, so there is nothing to report.";

  const reading = `${format(worst.estimate.value)} (${worst.band.label.toLowerCase()})`;
  const first =
    analysisType === "comparison" && areas.length > 1
      ? `${worst.area.name} is the worst of the ${areas.length} areas compared, at ${reading}.`
      : `${worst.area.name} reads ${reading} for ${indicator.longLabel}.`;

  if (isFlat(worst.changeYoY, indicator)) {
    return `${first} That is level with the same window a year earlier.`;
  }

  const direction = worst.changeYoY > 0 ? "rose" : "fell";
  const verdict = isDeterioration(worst.changeYoY, indicator) ? "a deterioration" : "an improvement";
  const magnitude = format(Math.abs(worst.changeYoY));
  const second = `${indicator.label} ${direction} by ${magnitude} against the same window a year earlier, ${verdict}.`;
  return `${first} ${second}`;
}
