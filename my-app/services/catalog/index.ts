/**
 * services/catalog: the study catalogue.
 *
 * Owns the answer to "what can this app study, what does it report, and how is
 * that number read". It holds no state, does no I/O and never imports another
 * service, which is what lets every page and every other service depend on it
 * without a cycle.
 *
 * Implements `CatalogService` from `contracts/catalog` (contract version 1).
 * That module is imported directly rather than through `contracts/index` so
 * the catalogue's dependency graph stays down to the one contract it
 * implements, instead of pulling in the geo and analysis contracts it has no
 * use for.
 *
 * The only import path other code should use:
 *
 *   import { catalog } from "@/services/catalog";
 *
 * The spec objects are also exported by name for the rare caller that needs a
 * single topic at module scope (a static route param list, a test fixture).
 * Reaching past this file into ./topics or ./indicators is a bug.
 */
import type {
  CatalogService,
  ModelId,
  ModelSpec,
  TopicId,
  TopicSpec,
} from "@/contracts/catalog";
import { CATALOG_CONTRACT_VERSION } from "@/contracts/catalog";
import { MODELS, RANDOM_FOREST, XGBOOST, ALL_MODEL_IDS } from "./models";
import {
  TOPICS,
  FLOOD_RISK,
  DROUGHT,
  FOOD_SECURITY,
  RANGELAND_DYNAMICS,
} from "./topics";
import {
  classify,
  formatValue,
  assertIndicatorInvariants,
  GROUP_SEPARATOR,
} from "./indicators";

/**
 * Lookup indices, built once at module load.
 *
 * Four topics would be fine to scan linearly, but the map also makes `find*`
 * safe for untrusted input: a `Map.get` cannot be tricked by a key like
 * "constructor" or "__proto__" the way a plain object lookup can, and route
 * params are exactly where such a string arrives.
 */
const TOPICS_BY_ID: ReadonlyMap<string, TopicSpec> = new Map(
  TOPICS.map((topic) => [topic.id, topic]),
);
const MODELS_BY_ID: ReadonlyMap<string, ModelSpec> = new Map(
  MODELS.map((model) => [model.id, model]),
);

function listTopics(): readonly TopicSpec[] {
  return TOPICS;
}

function findTopic(id: string): TopicSpec | undefined {
  return TOPICS_BY_ID.get(id);
}

/**
 * The typed accessor. The signature says the id is a `TopicId`, but the values
 * that reach it come from URLs and saved analyses, so the runtime check stays:
 * a stale bookmark should produce a named error in the log, not a page
 * rendering `undefined.label`.
 */
function getTopic(id: TopicId): TopicSpec {
  const topic = findTopic(id);
  if (!topic) {
    throw new Error(
      `catalog: unknown topic "${id}". Known topics: ${[...TOPICS_BY_ID.keys()].join(", ")}`,
    );
  }
  return topic;
}

function listModels(): readonly ModelSpec[] {
  return MODELS;
}

function findModel(id: string): ModelSpec | undefined {
  return MODELS_BY_ID.get(id);
}

function getModel(id: ModelId): ModelSpec {
  const model = findModel(id);
  if (!model) {
    throw new Error(
      `catalog: unknown model "${id}". Known models: ${[...MODELS_BY_ID.keys()].join(", ")}`,
    );
  }
  return model;
}

/**
 * The service. Frozen because it is a singleton every page shares: a caller
 * that monkey-patched `classify` would change how every other screen reads its
 * numbers, and that is worth failing loudly on instead of debugging later.
 */
export const catalog: CatalogService = Object.freeze({
  listTopics,
  getTopic,
  findTopic,
  listModels,
  getModel,
  findModel,
  classify,
  formatValue,
});

export {
  TOPICS,
  FLOOD_RISK,
  DROUGHT,
  FOOD_SECURITY,
  RANGELAND_DYNAMICS,
  MODELS,
  RANDOM_FOREST,
  XGBOOST,
  ALL_MODEL_IDS,
  CATALOG_CONTRACT_VERSION,
  GROUP_SEPARATOR,
  assertIndicatorInvariants,
};
