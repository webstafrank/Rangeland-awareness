/**
 * The running screen's script.
 *
 * The stages are honest about what a run does: they name resolving geometry,
 * assembling the driver stack, harmonising the series, training on the held-out
 * split, scoring the grid, classifying against the band table, and assembling
 * the result. "Loading..." tells a user nothing and teaches them nothing; these
 * labels tell them what an analysis of this kind involves, which is part of what
 * the app is for.
 *
 * The total is sized by the model's cost weight and the number of areas, so
 * picking the costlier model over four counties visibly takes longer than the
 * cheap one over one county. It stays inside STAGE_TOTAL_BOUNDS_MS: long enough
 * to read the labels, short enough that nobody walks away.
 */
import type { RunConfig, RunStage } from "@/contracts/analysis";
import type { ModelSpec } from "@/contracts/catalog";
import {
  STAGE_COST_SHARE,
  STAGE_PER_EXTRA_AREA,
  STAGE_TOTAL_BASE_MS,
  STAGE_TOTAL_BOUNDS_MS,
} from "./constants";
import { clamp } from "./rng";

interface StageTemplate {
  readonly id: string;
  readonly label: string;
  /** Share of the total. The seven weights sum to 1. */
  readonly weight: number;
}

/** Training is the longest step, because in a real run it is. */
export const STAGE_SCRIPT: readonly StageTemplate[] = [
  { id: "geometry", label: "Resolving county boundaries and centroids", weight: 0.1 },
  { id: "drivers", label: "Fetching the driver stack for the window", weight: 0.16 },
  { id: "harmonise", label: "Harmonising the monthly time series", weight: 0.14 },
  { id: "train", label: "Training the model on the held-out split", weight: 0.24 },
  { id: "score", label: "Scoring the grid cell by cell", weight: 0.16 },
  { id: "classify", label: "Classifying values against the band table", weight: 0.08 },
  { id: "assemble", label: "Assembling the result", weight: 0.12 },
];

/** Total wall-clock the running screen should occupy, in milliseconds. */
export function stageTotalMs(config: RunConfig, model: ModelSpec): number {
  const cost = 1 - STAGE_COST_SHARE + STAGE_COST_SHARE * model.costWeight;
  const areaFactor = 1 + STAGE_PER_EXTRA_AREA * Math.max(0, config.areas.length - 1);
  return Math.round(
    clamp(STAGE_TOTAL_BASE_MS * cost * areaFactor, STAGE_TOTAL_BOUNDS_MS[0], STAGE_TOTAL_BOUNDS_MS[1]),
  );
}

/**
 * Stages in order. Durations are whole milliseconds and sum to exactly
 * `stageTotalMs`: the last stage absorbs the rounding residual, so the running
 * screen's progress bar cannot drift off the end of the script.
 */
export function stagesFor(config: RunConfig, model: ModelSpec): readonly RunStage[] {
  const total = stageTotalMs(config, model);
  let spent = 0;
  return STAGE_SCRIPT.map((stage, index) => {
    const last = index === STAGE_SCRIPT.length - 1;
    const durationMs = last ? total - spent : Math.round(total * stage.weight);
    spent += durationMs;
    return { id: stage.id, label: stage.label, durationMs };
  });
}
