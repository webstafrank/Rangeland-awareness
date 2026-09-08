"use client";

/**
 * The topic analysis workbench.
 *
 * Owns the reducer and nothing else. Every rule it appears to enforce actually
 * lives in lib/analysis/selection.ts, which is why this file has no `if` about
 * area caps or analysis types in it. The map is loaded through MapPanel, which
 * is the ssr:false boundary.
 *
 * Laid out as bands down a scrolling page rather than a locked full-height
 * split with everything in one narrow rail:
 *
 *   1. Topic header: what this topic answers and returns.
 *   2. Scope and model, side by side across the full width. Set-once choices,
 *      so they get room and then get out of the way.
 *   3. Select areas: the four input methods as equal cards in a row, then the
 *      map beside the running list of what is selected.
 *   4. A sticky action bar restating the request, with the run button.
 *
 * The reason for the split: analysis type and model are chosen once, while area
 * selection is iterative. Giving the one-time choices a wide band and reserving
 * the tall space for the map matches how the page is actually used, and stops
 * eight controls competing for one 380px column.
 */

import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import MapPanel from "@/components/map/MapPanel";
import CoordinateEntry from "@/components/topic/CoordinateEntry";
import MapSizeStepper from "@/components/topic/MapSizeStepper";
import RadioCards from "@/components/topic/RadioCards";
import RequestReceipt from "@/components/topic/RequestReceipt";
import RequestResult from "@/components/topic/RequestResult";
import RunAction from "@/components/topic/RunAction";
import SelectedAreas from "@/components/topic/SelectedAreas";
import SelectionNotice from "@/components/topic/SelectionNotice";
import ShapefileUpload from "@/components/topic/ShapefileUpload";
import { MAP_SIZES } from "@/components/topic/map-size";
import {
  getMapSizeServerSnapshot,
  getMapSizeSnapshot,
  setStoredMapSize,
  subscribeMapSize,
} from "@/components/topic/map-size-store";
import { MAP_TOOL_SPECS, type MapTool } from "@/components/map/tools";
import {
  ANALYSIS_TYPES,
  MODELS,
  type AnalysisTypeId,
  type ModelId,
  getAnalysisType,
  getModel,
} from "@/lib/analysis/models";
import { buildRequest } from "@/lib/analysis/request";
import type { AnalysisRequest } from "@/lib/analysis/request";
import {
  initialSelectionState,
  selectionReducer,
  switchWouldDrop,
  undoRestoreCount,
} from "@/lib/analysis/selection";
import type { SelectionState } from "@/lib/analysis/selection";
import type { Topic } from "@/lib/analysis/topics";
import { writeUrlSelection, type UrlSelection } from "@/lib/analysis/url-state";

export interface TopicWorkbenchProps {
  topic: Topic;
  /** Type and model recovered from the URL by the server component. */
  initial: UrlSelection;
}

const DEFAULTS = {
  analysisType: initialSelectionState.analysisType,
  modelId: initialSelectionState.modelId,
} as const;

/** Section heading with its step number, used for each band. */
function StepHeading({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent-border bg-accent-soft font-mono text-xs font-semibold text-accent"
        >
          {step}
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">
            {hint}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** A titled panel. The one card shape used everywhere on this page. */
function Panel({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col rounded-xl border border-edge bg-surface p-5 shadow-card ${className}`}
    >
      <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
      {hint && (
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">{hint}</p>
      )}
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

export default function TopicWorkbench({ topic, initial }: TopicWorkbenchProps) {
  // The URL seeds the reducer's initial state rather than being applied in an
  // effect, so a bookmarked link renders correct on the first paint instead of
  // flashing the defaults and then correcting itself.
  const [state, dispatch] = useReducer(selectionReducer, initial, seed);
  const [tool, setTool] = useState<MapTool>("point");
  const resultRef = useRef<HTMLDivElement>(null);

  // The submitted request lives here, not in the button, because the button is
  // in the sticky bar and the result renders in the page. Keyed by resetKey so
  // a payload can never outlive the selection that produced it.
  const [submitted, setSubmitted] = useState<{
    key: string;
    request: AnalysisRequest;
  } | null>(null);

  // Read through an external store rather than state plus an effect, so the
  // remembered height survives a reload without a hydration mismatch and
  // without a second render on every mount. See map-size-store.ts.
  const mapSize = useSyncExternalStore(
    subscribeMapSize,
    getMapSizeSnapshot,
    getMapSizeServerSnapshot,
  );

  const spec = getAnalysisType(state.analysisType);
  const model = getModel(state.modelId);
  const atCapacity = state.areas.length >= spec.maxAreas && spec.maxAreas > 1;

  const validation = useMemo(
    () => buildRequest(topic.slug, state),
    [topic.slug, state],
  );

  // Changing any of these invalidates a request already on screen, so the
  // shown payload can never disagree with the current selection.
  const resetKey = [
    state.analysisType,
    state.modelId,
    state.areas.map((a) => a.id).join(","),
  ].join("|");

  const shownRequest =
    submitted !== null && submitted.key === resetKey ? submitted.request : null;

  const run = () => {
    if (!validation.ok) return;
    setSubmitted({ key: resetKey, request: validation.request });
    // Defer to the next frame so the section exists before scrolling to it.
    requestAnimationFrame(() =>
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  // Keep type and model in the URL so the page is bookmarkable. replaceState,
  // not push: every radio click would otherwise add a history entry and the
  // back button would walk through the analyst's decisions one at a time.
  useEffect(() => {
    const query = writeUrlSelection(
      { analysisType: state.analysisType, modelId: state.modelId },
      DEFAULTS,
    );
    window.history.replaceState(null, "", `${window.location.pathname}${query}`);
  }, [state.analysisType, state.modelId]);

  const analysisOptions = ANALYSIS_TYPES.map((type) => {
    const dropped = switchWouldDrop(state, type.id);
    return {
      id: type.id,
      label: type.label,
      description: type.description,
      // Warn before the click, not only after. RadioCards wires this to
      // aria-describedby too, so it is heard as well as seen.
      note:
        dropped > 0
          ? `Switching to ${type.label.toLowerCase()} removes ${dropped} of ` +
            `your ${state.areas.length} selected areas.`
          : undefined,
    };
  });

  const countHint =
    state.areas.length === 0
      ? spec.minAreas === 1
        ? "One area needed."
        : `At least ${spec.minAreas} areas needed.`
      : state.areas.length < spec.minAreas
        ? `${state.areas.length} of ${spec.minAreas} minimum.`
        : `${state.areas.length} selected, up to ${spec.maxAreas}.`;

  const activeToolHint = MAP_TOOL_SPECS.find((t) => t.id === tool)?.hint ?? "";

  return (
    <div className="flex flex-1 flex-col">
      {/* 1. Topic header. What this topic answers and what it gives back. */}
      <section className="border-b border-edge bg-surface">
        <div className="mx-auto w-full max-w-[1440px] px-6 py-8 lg:px-10 lg:py-10">
          <nav aria-label="Breadcrumb" className="text-xs text-ink-faint">
            <Link
              href="/"
              className="rounded font-medium hover:text-ink hover:underline"
            >
              All topics
            </Link>
            <span aria-hidden="true" className="px-2">
              /
            </span>
            <span className="text-ink-muted">{topic.name}</span>
          </nav>

          <div className="mt-4 flex flex-wrap items-start gap-x-10 gap-y-6">
            <div className="min-w-0 max-w-2xl flex-1">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-base font-bold ${topic.accent.tile} ${topic.accent.border} ${topic.accent.text}`}
                >
                  {topic.name.slice(0, 1)}
                </span>
                <h1
                  className={`text-2xl font-semibold tracking-tight lg:text-3xl ${topic.accent.text}`}
                >
                  {topic.name}
                </h1>
              </div>
              <p className="mt-4 text-base leading-relaxed text-ink">
                {topic.question}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {topic.output}
              </p>
            </div>

            <dl className="w-full max-w-xs shrink-0 rounded-xl border border-edge bg-sunken p-4 lg:ml-auto">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                Model inputs
              </dt>
              <dd className="mt-2.5 flex flex-wrap gap-1.5">
                {topic.inputs.map((input) => (
                  <span
                    key={input}
                    className="rounded-md border border-edge bg-surface px-2 py-1 text-xs font-medium text-ink-muted"
                  >
                    {input}
                  </span>
                ))}
              </dd>
            </dl>
          </div>
        </div>
      </section>

      {/* 2. Scope and model. Set-once choices, side by side, with room. */}
      <section className="mx-auto w-full max-w-[1440px] px-6 pt-10 lg:px-10 lg:pt-12">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
          <div>
            <StepHeading
              step={1}
              title="Scope"
              hint="Analyse one area in detail, or several ranked against each other."
            />
            <div className="mt-5">
              <RadioCards
                legend="Analysis type"
                hideLegend
                name="analysis-type"
                value={state.analysisType}
                options={analysisOptions}
                onChange={(analysisType: AnalysisTypeId) =>
                  dispatch({ type: "setAnalysisType", analysisType })
                }
                // Stacked, not side by side, so this column's height is close
                // to the Model column's three cards instead of leaving a hole.
                layout="stack"
              />
            </div>

            {/* The notice sits directly under the control that caused it: the
                analyst's eye is on the card they just clicked. */}
            {state.notice !== null && (
              <div className="mt-4">
                <SelectionNotice
                  message={state.notice}
                  restoreCount={undoRestoreCount(state)}
                  onUndo={() => dispatch({ type: "undoTypeSwitch" })}
                  onDismiss={() => dispatch({ type: "dismissNotice" })}
                />
              </div>
            )}
          </div>

          <div>
            <StepHeading
              step={2}
              title="Model"
              hint="Pick on the trade-off. Combined runs both and reports where they disagree."
            />
            <div className="mt-5">
              <RadioCards
                legend="Model"
                hideLegend
                name="model"
                value={state.modelId}
                options={MODELS.map((m) => ({
                  id: m.id,
                  label: m.label,
                  description: m.tradeoff,
                }))}
                onChange={(modelId: ModelId) =>
                  dispatch({ type: "setModel", modelId })
                }
                layout="stack"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 3. Select areas. Four methods as equal cards, then the map. */}
      <section className="mx-auto w-full max-w-[1440px] px-6 pt-12 lg:px-10 lg:pt-16">
        <StepHeading
          step={3}
          title="Select areas"
          hint="Any of these four, mixed freely. Each selection zooms the map to it."
        >
          <p className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted">
            {countHint}
          </p>
        </StepHeading>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <Panel
            title="On the map"
            hint={
              atCapacity
                ? `Holding ${spec.maxAreas} areas, the maximum. Adding another will ask you to remove one.`
                : activeToolHint
            }
          >
            <RadioCards
              legend="Map tool"
              hideLegend
              name="selection-tool"
              value={tool}
              options={MAP_TOOL_SPECS.map((t) => ({ id: t.id, label: t.label }))}
              onChange={setTool}
              compact
              layout="stack"
            />
          </Panel>

          <Panel
            title="By coordinate"
            hint="Paste a latitude and longitude. Radius 0 is the exact point."
          >
            <CoordinateEntry
              onAreas={(areas) => dispatch({ type: "addAreas", areas })}
            />
          </Panel>

          <Panel
            title="From a shapefile"
            hint="A .zip holding .shp, .shx, .dbf and .prj. Polygons only."
          >
            <ShapefileUpload
              onAreas={(areas) => dispatch({ type: "addAreas", areas })}
            />
          </Panel>
        </div>

        {/* The map, with the running list beside it. */}
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="overflow-hidden rounded-xl border border-edge bg-surface shadow-card">
            <MapSizeStepper size={mapSize} onChange={setStoredMapSize} />
            <div
              /* The size class only applies below lg. Tailwind emits variant
                 utilities after unprefixed ones, so lg:h-[620px] wins on a
                 specificity tie without needing !important. */
              className={`relative w-full ${MAP_SIZES[mapSize].className} lg:h-[620px] lg:min-h-0`}
            >
              <MapPanel
                areas={state.areas}
                focus={state.focus}
                tool={tool}
                onAddAreas={(areas) => dispatch({ type: "addAreas", areas })}
                onFocusArea={(id) => dispatch({ type: "focusArea", id })}
                onDrawFinished={() => setTool("point")}
              />
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-edge bg-surface p-5 shadow-card lg:max-h-[calc(620px+2.25rem)]">
            <SelectedAreas
              areas={state.areas}
              emptyHint={
                "Nothing selected yet. Use any of the three panels above: " +
                "click or draw on the map, paste a coordinate, or upload a " +
                "shapefile."
              }
              onFocus={(id) => dispatch({ type: "focusArea", id })}
              onFitAll={() => dispatch({ type: "focusAll" })}
              onRemove={(id) => dispatch({ type: "removeArea", id })}
              onClear={() => dispatch({ type: "clearAreas" })}
            />
          </div>
        </div>
      </section>

      {/* 4. The result, when there is one. Above the sticky bar, so the bar
             never covers it. */}
      <section
        ref={resultRef}
        className="mx-auto w-full max-w-[1440px] px-6 pt-12 lg:px-10 lg:pt-16"
      >
        <StepHeading
          step={4}
          title="Run"
          hint="The request is validated before it is sent. Nothing is submitted until every choice above is made."
        />
        <div className="mt-6">
          <RequestResult request={shownRequest} />
        </div>
      </section>

      {/* Spacer so the sticky bar cannot sit on top of the last section. */}
      <div aria-hidden="true" className="h-24" />

      {/* The action bar. Sticky, so the whole request and the one thing
          blocking it are readable at every scroll position. */}
      <div className="sticky bottom-0 z-[800] border-t border-edge bg-surface shadow-[0_-2px_8px_-4px_rgb(16_24_40/0.08)]">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:gap-6 lg:px-10">
          {model && (
            <RequestReceipt
              topic={topic}
              analysisType={spec}
              model={model}
              areaCount={state.areas.length}
              validation={validation}
            />
          )}
          <div className="lg:ml-auto lg:w-auto lg:shrink-0">
            <RunAction validation={validation} onRun={run} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Apply the URL selection over the reducer's defaults. */
function seed(fromUrl: UrlSelection): SelectionState {
  return {
    ...initialSelectionState,
    analysisType: fromUrl.analysisType ?? initialSelectionState.analysisType,
    modelId: fromUrl.modelId ?? initialSelectionState.modelId,
  };
}
