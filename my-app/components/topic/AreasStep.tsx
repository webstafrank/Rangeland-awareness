"use client";

/**
 * Step 3: where.
 *
 * The only step that gets the full band width, because it is the only one with
 * a map. The three input methods sit in a row above it, the map and the
 * running list below, which is the layout the single page used for this
 * section and the one part of it that was working.
 *
 * The map tool radio lives here rather than on the map because it is a mode
 * switch, and a mode switch hidden inside the thing it modifies is how an
 * analyst ends up drawing a box when they meant to drop a point.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import CoordinateEntry from "@/components/topic/CoordinateEntry";
import MapSizeStepper from "@/components/topic/MapSizeStepper";
import RadioCards from "@/components/topic/RadioCards";
import SelectedAreas from "@/components/topic/SelectedAreas";
import SelectionNotice from "@/components/topic/SelectionNotice";
import ShapefileUpload from "@/components/topic/ShapefileUpload";
import StepShell from "@/components/topic/StepShell";
import MapPanel from "@/components/map/MapPanel";
import { MAP_SIZES } from "@/components/topic/map-size";
import {
  getMapSizeServerSnapshot,
  getMapSizeSnapshot,
  setStoredMapSize,
  subscribeMapSize,
} from "@/components/topic/map-size-store";
import { MAP_TOOL_SPECS, type MapTool } from "@/components/map/tools";
import { useWizard } from "@/components/topic/useWizard";
import { undoRestoreCount } from "@/services/analysis/selection";
import { blockingReason } from "@/services/analysis/request";
import type { Topic } from "@/services/analysis/topics";
import type { UrlSelection } from "@/services/analysis/url-state";

export interface AreasStepProps {
  topic: Topic;
  initial: UrlSelection;
}

/** A titled panel. The one card shape used for the three input methods. */
function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-edge bg-surface p-5 shadow-card">
      <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
      {hint && (
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">{hint}</p>
      )}
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

export default function AreasStep({ topic, initial }: AreasStepProps) {
  const wizard = useWizard(topic.slug, initial);
  const { state, dispatch, spec, validation, canReview } = wizard;
  const [tool, setTool] = useState<MapTool>("point");

  // Read through an external store rather than state plus an effect, so the
  // remembered height survives a reload without a hydration mismatch and
  // without a second render on every mount. See map-size-store.ts.
  const mapSize = useSyncExternalStore(
    subscribeMapSize,
    getMapSizeSnapshot,
    getMapSizeServerSnapshot,
  );

  /*
   * Coming back to this step, fit the map to what is already selected.
   *
   * The focus request is a one-shot token and is deliberately not persisted
   * (see selection-store.ts), so a selection restored from storage, or one
   * made before stepping away to change the model, would otherwise render as
   * outlines somewhere off the default Kenya view. Once per mount, and only
   * when there is something to fit, so it can never fight a focus the analyst
   * just triggered by clicking a row.
   */
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    if (state.areas.length > 0 && state.focus === null) {
      dispatch({ type: "focusAll" });
    }
    // Mount only: the guard above is what makes that correct, and adding the
    // selection to the deps would re-fit on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atCapacity = state.areas.length >= spec.maxAreas && spec.maxAreas > 1;
  const activeToolHint = MAP_TOOL_SPECS.find((t) => t.id === tool)?.hint ?? "";

  const countHint =
    state.areas.length === 0
      ? spec.minAreas === 1
        ? "One area needed."
        : `At least ${spec.minAreas} areas needed.`
      : state.areas.length < spec.minAreas
        ? `${state.areas.length} of ${spec.minAreas} minimum.`
        : `${state.areas.length} selected, up to ${spec.maxAreas}.`;

  return (
    <StepShell
      topic={topic}
      step="areas"
      wizard={wizard}
      width="band"
      // Only the area rule can block here, and blockingReason already phrases
      // it for a person rather than for a log.
      blockedReason={canReview ? null : blockingReason(validation)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted">
          {countHint}
        </p>
      </div>

      {state.notice !== null && (
        <div className="mt-4 max-w-2xl">
          <SelectionNotice
            message={state.notice}
            restoreCount={undoRestoreCount(state)}
            onUndo={() => dispatch({ type: "undoTypeSwitch" })}
            onDismiss={() => dispatch({ type: "dismissNotice" })}
          />
        </div>
      )}

      {/*
        The tools beside the map, not above it.

        Measured: methods in a row across the top, then the map below, made
        this step 1737px tall — 969px of scrolling on a 1366x768 laptop, and
        the map and the controls that drive it were never on screen together.
        Every selection then moved a viewport the analyst could not see.

        So on lg and up the three input methods and the running list stack in
        one 340px column and the map takes the rest, which is the layout a map
        tool has for the reason this one now has it. Below lg they stay
        stacked: a 360px phone has no second column to give.

        This is not the arrangement the old single page rejected. That one put
        EIGHT controls in a narrow rail, including the scope and the model.
        Those live on their own screens now, so this column holds three panels
        and a list.
      */}
      {/*
        No `items-start` on this grid, deliberately. It would size each column
        to its own content, and the map column would then be exactly as tall as
        the map — leaving the sticky map nothing to travel inside, so it would
        scroll away like any other element. Stretching the column to the row's
        height is what gives `sticky` its range.
      */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
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

          {/*
            The running list, under the tools that fill it. It is as tall as
            its contents and no taller: as a stretched grid item it filled the
            map's height, which made the largest thing on the page an empty
            white box in the state every session starts in.
          */}
          <div className="flex flex-col rounded-xl border border-edge bg-surface p-5 shadow-card">
            <SelectedAreas
              areas={state.areas}
              emptyHint={
                "Nothing selected yet. Use a panel above: click or draw on the " +
                "map, paste a coordinate, or upload a shapefile."
              }
              onFocus={(id) => dispatch({ type: "focusArea", id })}
              onFitAll={() => dispatch({ type: "focusAll" })}
              onRemove={(id) => dispatch({ type: "removeArea", id })}
              onClear={() => dispatch({ type: "clearAreas" })}
            />
          </div>
        </div>

        {/*
          The map sticks while the tool column scrolls past it, so a long
          selection list never takes the map off screen.
        */}
        <div className="h-fit overflow-hidden rounded-xl border border-edge bg-surface shadow-card lg:sticky lg:top-20">
          <MapSizeStepper size={mapSize} onChange={setStoredMapSize} />
          <div
            /*
             * Below lg the remembered stop from MapSizeStepper decides. At lg
             * and up the height comes from the viewport instead of a fixed
             * 620px, so the map fits the screen it is on: 448px on a 768px
             * laptop, 620px on a 1080px monitor, never under 360px however
             * short the window. Tailwind emits variant utilities after
             * unprefixed ones, so the lg class wins on a specificity tie
             * without !important.
             */
            className={`relative w-full ${MAP_SIZES[mapSize].className} lg:h-[clamp(360px,calc(100svh-320px),620px)] lg:min-h-0`}
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
    </StepShell>
  );
}
