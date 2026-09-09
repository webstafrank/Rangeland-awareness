"use client";

/**
 * Picking areas: the four input methods, the map, and the running list.
 *
 * Lifted out of TopicWorkbench so the new pre-analysis page can render it as a
 * slot without inheriting the rest of that page's layout. Every rule it appears
 * to enforce still lives in lib/analysis/selection.ts — this file dispatches and
 * renders, and there is deliberately no `if` about area caps or analysis types
 * anywhere in it.
 *
 * It owns exactly one piece of state, the armed map tool, because that is a
 * property of this widget rather than of the analysis: it never leaves here, it
 * is not in the URL, and it is not part of the request.
 */

import { useState, useSyncExternalStore } from "react";
import MapPanel from "@/components/map/MapPanel";
import CoordinateEntry from "@/components/topic/CoordinateEntry";
import MapSizeStepper from "@/components/topic/MapSizeStepper";
import RadioCards from "@/components/topic/RadioCards";
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
import { getAnalysisType } from "@/lib/analysis/models";
import {
  type SelectionAction,
  type SelectionState,
  undoRestoreCount,
} from "@/lib/analysis/selection";

export interface AreaSelectionProps {
  state: SelectionState;
  dispatch: (action: SelectionAction) => void;
}

/** The one card shape this widget uses for its three input methods. */
function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-edge bg-surface p-5 shadow-card">
      <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-faint">{hint}</p>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

export default function AreaSelection({ state, dispatch }: AreaSelectionProps) {
  const [tool, setTool] = useState<MapTool>("point");

  // Read through an external store rather than state plus an effect: the
  // remembered height has to survive a reload without a hydration mismatch and
  // without forcing a second render on every mount. See map-size-store.ts.
  const mapSize = useSyncExternalStore(
    subscribeMapSize,
    getMapSizeSnapshot,
    getMapSizeServerSnapshot,
  );

  const spec = getAnalysisType(state.analysisType);
  const atCapacity = state.areas.length >= spec.maxAreas && spec.maxAreas > 1;
  const activeToolHint = MAP_TOOL_SPECS.find((t) => t.id === tool)?.hint ?? "";

  return (
    <div>
      {/* The notice sits above the inputs rather than beside the control that
          caused it: from here the analysis-type radios live on another part of
          the page, so the only place it is certain to be seen is the top of the
          area block it is talking about. */}
      {state.notice !== null && (
        <div className="mb-5">
          <SelectionNotice
            message={state.notice}
            restoreCount={undoRestoreCount(state)}
            onUndo={() => dispatch({ type: "undoTypeSwitch" })}
            onDismiss={() => dispatch({ type: "dismissNotice" })}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
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

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
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
    </div>
  );
}
