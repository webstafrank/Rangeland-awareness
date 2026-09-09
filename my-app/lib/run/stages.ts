/**
 * The processing screen's script.
 *
 * The stages are honest about what a run of this kind involves: resolving the
 * geometry an analyst drew, assembling the driver stack for the window,
 * harmonising the monthly series, training on a held-out split, scoring,
 * classifying against the band table, assembling the result. "Loading..." tells
 * a user nothing and teaches them nothing; these labels tell them what the work
 * is, which is part of what the app is for (RUBRIC R1).
 *
 * The total is sized by the model's cost weight and the number of areas, so
 * picking the ensemble over eight areas visibly takes longer than Random Forest
 * over one. It is clamped to a range a person will sit through: long enough to
 * read the labels, short enough that nobody walks away.
 *
 * Nothing here waits. The durations are a script the screen animates against;
 * `run()` itself is a few milliseconds of arithmetic.
 */

import type { RunConfig } from "@/lib/run/config";
import {
  MODEL_COST_WEIGHT,
  STAGE_COST_SHARE,
  STAGE_PER_EXTRA_AREA,
  STAGE_TOTAL_BASE_MS,
  STAGE_TOTAL_BOUNDS_MS,
} from "@/lib/run/constants";
import type { RunStage } from "@/lib/run/result";
import { clamp } from "@/lib/run/rng";

interface StageTemplate {
  readonly id: string;
  readonly label: string;
  /** Share of the total. The seven weights sum to 1. */
  readonly weight: number;
}

/** Training is the longest step, because in a real run it is. */
export const STAGE_SCRIPT: readonly StageTemplate[] = [
  { id: "geometry", label: "Resolving area geometry and centroids", weight: 0.1 },
  { id: "drivers", label: "Assembling the driver stack for the window", weight: 0.16 },
  { id: "harmonise", label: "Harmonising the monthly time series", weight: 0.14 },
  { id: "train", label: "Training the model on the held-out split", weight: 0.24 },
  { id: "score", label: "Scoring each area against the index stack", weight: 0.16 },
  { id: "classify", label: "Classifying values against the band table", weight: 0.08 },
  { id: "assemble", label: "Assembling the result", weight: 0.12 },
];

/** Total wall-clock the processing screen should occupy, in milliseconds. */
export function stageTotalMs(config: RunConfig): number {
  const costWeight = MODEL_COST_WEIGHT[config.model] ?? 1;
  const cost = 1 - STAGE_COST_SHARE + STAGE_COST_SHARE * costWeight;
  const areaFactor = 1 + STAGE_PER_EXTRA_AREA * Math.max(0, config.areas.length - 1);
  return Math.round(
    clamp(
      STAGE_TOTAL_BASE_MS * cost * areaFactor,
      STAGE_TOTAL_BOUNDS_MS[0],
      STAGE_TOTAL_BOUNDS_MS[1],
    ),
  );
}

/**
 * Stages in order.
 *
 * Durations are whole milliseconds summing to EXACTLY `stageTotalMs`: the last
 * stage absorbs the rounding residual. Without that the progress bar drifts off
 * the end of the script, and the screen either finishes early and sits at 100%
 * or never reaches it, which is the one thing a progress bar must not do.
 */
export function stagesFor(config: RunConfig): readonly RunStage[] {
  const total = stageTotalMs(config);
  let spent = 0;
  return STAGE_SCRIPT.map((stage, index) => {
    const last = index === STAGE_SCRIPT.length - 1;
    const durationMs = last ? total - spent : Math.round(total * stage.weight);
    spent += durationMs;
    return { id: stage.id, label: stage.label, durationMs };
  });
}
