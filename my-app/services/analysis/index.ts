/**
 * The wired singleton, and NOTHING ELSE.
 *
 * This file is the only place in `services/analysis` that names the concrete
 * catalogue and geography services. Everything else takes them as injected
 * dependencies, and the whole test suite imports `createAnalysisService` from
 * ./service directly and never touches this file. That is deliberate: it means
 * this service's tests pass without `services/catalog` or `services/geo`
 * existing, so the three can be built in parallel and only meet here.
 *
 * If those two services export their singleton under a different name, this
 * import is the one line to change.
 */
import { catalog } from "@/services/catalog";
import { geo } from "@/services/geo";
import type { AnalysisService } from "@/contracts/analysis";
import { createAnalysisService } from "./service";

export const analysis: AnalysisService = createAnalysisService({ catalog, geo });
