"use client";

/**
 * The topic analysis workbench.
 *
 * Owns the reducer and nothing else. Every rule it appears to enforce actually
 * lives in lib/analysis/selection.ts, which is why this file has no `if` about
 * area caps or analysis types in it. The map is loaded through MapPanel, which
 * is the ssr:false boundary.
 *
 * Layout: a 380px request rail beside a full-height map on desktop; on mobile
 * the map sits on top at a user-chosen height with the rail below it. The rail
 * reads top to bottom in the order the request is built, and the receipt plus
 * run button sit at its end so the whole request is legible without opening
 * anything.
 */

import {
  useEffect,
  useMemo,
  useReducer,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import MapPanel from "@/components/map/MapPanel";
import CoordinateEntry from "@/components/topic/CoordinateEntry";
import MapSizeStepper from "@/components/topic/MapSizeStepper";
import RadioCards from "@/components/topic/RadioCards";
import RequestReceipt from "@/components/topic/RequestReceipt";
import RunPanel from "@/components/topic/RunPanel";
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

export default function TopicWorkbench({ topic, initial }: TopicWorkbenchProps) {
  // The URL seeds the reducer's initial state rather than being applied in an
  // effect, so a bookmarked link renders correct on the first paint instead of
  // flashing the defaults and then correcting itself.
  const [state, dispatch] = useReducer(selectionReducer, initial, seed);
  const [tool, setTool] = useState<MapTool>("point");

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

  // Keep type and model in the URL so the page is bookmarkable. replaceState,
  // not push: every radio click would otherwise add a history entry and the
  // back button would walk through the analyst's decisions one at a time.
  useEffect(() => {
    const query = writeUrlSelection(
      { analysisType: state.analysisType, modelId: state.modelId },
      DEFAULTS,
    );
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query}`,
    );
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
        : `${state.areas.length} selected. Up to ${spec.maxAreas}.`;

  const activeToolHint = MAP_TOOL_SPECS.find((t) => t.id === tool)?.hint ?? "";

  return (
    <div className="flex flex-1 flex-col lg:h-[calc(100svh-7.5rem)] lg:overflow-hidden">
      <div className="border-b border-edge bg-surface">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-3 sm:px-6">
          <nav aria-label="Breadcrumb" className="text-xs text-foreground-faint">
            <Link href="/" className="rounded hover:text-foreground hover:underline">
              All topics
            </Link>
            <span aria-hidden="true" className="px-1.5">
              /
            </span>
            <span className="text-foreground-muted">{topic.name}</span>
          </nav>

          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1
              className={`text-xl font-semibold tracking-tight sm:text-2xl ${topic.accent.text}`}
            >
              {topic.name}
            </h1>
            <p className="text-sm text-foreground-muted">{topic.question}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col-reverse lg:min-h-0 lg:flex-row">
        {/*
          DOM order is rail then map, so the keyboard and a screen reader meet
          the controls first. flex-col-reverse puts the map on top visually on
          mobile, where it is the thing you came to touch.
        */}
        <aside className="flex w-full shrink-0 flex-col gap-5 border-edge bg-background p-4 sm:p-5 lg:w-[380px] lg:overflow-y-auto lg:border-r">
          <RadioCards
            legend="Analysis type"
            name="analysis-type"
            value={state.analysisType}
            options={analysisOptions}
            onChange={(analysisType: AnalysisTypeId) =>
              dispatch({ type: "setAnalysisType", analysisType })
            }
            layout="stack"
          />

          {/*
            The notice sits directly under the control that caused it. The
            analyst's eye is on the card they just clicked, so the consequence
            has to be reported there, not one section further down.
          */}
          {state.notice !== null && (
            <SelectionNotice
              message={state.notice}
              restoreCount={undoRestoreCount(state)}
              onUndo={() => dispatch({ type: "undoTypeSwitch" })}
              onDismiss={() => dispatch({ type: "dismissNotice" })}
            />
          )}

          <div className="flex flex-col gap-3 border-t border-edge pt-5">
            {/*
              The section heading covers all three ways in (map, coordinates,
              shapefile). The radio group inside it is named for what it
              actually controls, which is only the map interaction: naming the
              group "Select areas" would imply the upload was one of its
              options.
            */}
            <h2 className="text-sm font-semibold">Select areas</h2>

            <RadioCards
              legend="Map tool"
              name="selection-tool"
              value={tool}
              options={MAP_TOOL_SPECS.map((t) => ({ id: t.id, label: t.label }))}
              onChange={setTool}
              compact
            />
            <p className="text-xs leading-snug text-foreground-faint">
              {/*
                Deliberately not disabled at capacity. The reducer's answer to a
                thirteenth area is a stated notice, and disabling the control
                would hide that answer instead of teaching it.
              */}
              {atCapacity
                ? `Holding ${spec.maxAreas} areas, the maximum. Adding another ` +
                  `will tell you to remove one first.`
                : activeToolHint}
            </p>

            <CoordinateEntry
              onAreas={(areas) => dispatch({ type: "addAreas", areas })}
            />

            <ShapefileUpload
              onAreas={(areas) => dispatch({ type: "addAreas", areas })}
            />
          </div>

          <div className="border-t border-edge pt-5">
            <SelectedAreas
              areas={state.areas}
              countHint={countHint}
              emptyHint={
                "Nothing selected yet. Click the map, draw a shape, type a " +
                "coordinate, or upload a shapefile."
              }
              onFocus={(id) => dispatch({ type: "focusArea", id })}
              onRemove={(id) => dispatch({ type: "removeArea", id })}
              onClear={() => dispatch({ type: "clearAreas" })}
            />
          </div>

          <div className="border-t border-edge pt-5">
            <RadioCards
              legend="Model"
              name="model"
              value={state.modelId}
              options={MODELS.map((m) => ({
                id: m.id,
                label: m.label,
                description: m.tradeoff,
              }))}
              onChange={(modelId: ModelId) => dispatch({ type: "setModel", modelId })}
              layout="stack"
            />
          </div>

          <div className="flex flex-col gap-2 border-t border-edge pt-5 lg:mt-auto">
            {model && (
              <RequestReceipt
                topic={topic}
                analysisType={spec}
                model={model}
                areaCount={state.areas.length}
                validation={validation}
              />
            )}
            <RunPanel validation={validation} resetKey={resetKey} />
          </div>
        </aside>

        <div className="flex w-full flex-col lg:min-h-0 lg:flex-1">
          <MapSizeStepper size={mapSize} onChange={setStoredMapSize} />
          {/*
            The size class only applies below lg. Tailwind emits variant
            utilities after unprefixed ones, so lg:h-auto beats the h-[Nsvh]
            from MAP_SIZES on specificity ties without needing !important.
          */}
          <div
            className={`relative w-full border-b border-edge ${MAP_SIZES[mapSize].className} lg:h-auto lg:min-h-0 lg:flex-1 lg:border-b-0`}
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
