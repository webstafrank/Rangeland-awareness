"use client";

/**
 * Step 3: where. The map workspace.
 *
 * The only step that gets the full band width, because it is the only one with
 * a map. The map takes the room; beside it, a column of three cards:
 *
 *   By name        county, sub-county and ward, each searchable (AdminPicker)
 *   Other ways in  a shapefile, then a typed coordinate
 *   Selected areas the running list
 *
 * Naming the place is first because it is how an analyst usually knows an
 * area. The boxes and the map move each other (useAdminMapSync): a chosen
 * unit is outlined and flown to, and in Identify place mode a click on the
 * map fills the boxes with the place under it. The map's switch, Identify
 * place or Add point, sits on the map beside the basemap switch. Drawing a
 * shape or a box was removed when named boundaries arrived.
 */

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import {
  ArrowUpload20Regular,
  Location20Regular,
  Map20Regular,
} from "@/components/ui/icons";
import AdminPicker from "@/components/topic/AdminPicker";
import CoordinateEntry from "@/components/topic/CoordinateEntry";
import MapSizeStepper from "@/components/topic/MapSizeStepper";
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
import { useWizard } from "@/components/topic/useWizard";
import { useAdminMapSync } from "@/components/topic/useAdminMapSync";
import { undoRestoreCount } from "@/services/analysis/selection";
import { shortAreaReason } from "@/components/topic/footer-controls";
import type { Topic } from "@/services/analysis/topics";
import type { UrlSelection } from "@/services/analysis/url-state";

/**
 * The map's height on lg: the viewport under the 56px top bar and above the
 * sticky action bar (about 57px), less a 16px gap at each end, so once the
 * page scrolls the stuck map fills the screen between the two bars. Never
 * under 360px however short the window, and never over 620px:
 * evals/journey.spec.ts "the map fits the viewport" holds it between the two.
 */
const MAP_HEIGHT = "lg:h-[clamp(360px,calc(100svh-145px),620px)]";

export interface AreasStepProps {
  topic: Topic;
  initial: UrlSelection;
}

/**
 * One input method inside a card: an icon, an h3 (the step heading above is
 * the h2), a one-line hint, then the control. Sections sharing a card are
 * divided by hairlines, so the shapefile and the coordinate read as one
 * "other ways in" card rather than two more boxes.
 */
function ToolSection({
  title,
  icon,
  hint,
  children,
}: {
  title: string;
  icon: ReactElement;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-edge p-4 first:border-t-0">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="grid h-6 w-6 shrink-0 place-items-center text-ink-faint"
        >
          {icon}
        </span>
        <h3 className="type-subtitle2 text-ink">{title}</h3>
      </div>
      {hint && <p className="type-caption1 mt-1 pl-8 text-ink-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function AreasStep({ topic, initial }: AreasStepProps) {
  const wizard = useWizard(topic.slug, initial);
  const { state, dispatch, spec, canReview } = wizard;
  // The By name boxes and the map, each moving the other. See useAdminMapSync.
  const sync = useAdminMapSync(state.areas);

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

  // The cap only, beside the count badge. What is still missing is said once,
  // in the footer beside Continue, not here as well.
  const capHint = spec.maxAreas > 1 ? `up to ${spec.maxAreas}` : "1 allowed";

  return (
    <StepShell
      topic={topic}
      step="areas"
      wizard={wizard}
      width="band"
      // Only the area rule can block here, said as one short line for the
      // footer (footer-controls.ts); the tool panel says how.
      blockedReason={
        canReview ? null : shortAreaReason(state.areas.length, spec)
      }
    >
      {state.notice !== null && (
        <div className="mb-4 max-w-2xl">
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
        this step 1737px tall (969px of scrolling on a 1366x768 laptop), and
        the map and the controls that drive it were never on screen together.

        So on lg and up the cards and the running list share a 360px column
        on the left (400px from xl, where Sub-county and Ward fit side by
        side) at their natural height, and every tool is reached
        by scrolling the page. (A fixed-height column that scrolled inside
        itself hid the shapefile upload below "Add area" with no cue.) The map
        takes the rest and is sticky under the top bar, so it stays in view
        while the tools scroll past it.

        No `items-start` on this grid, deliberately: it would size the map
        column to the map, leaving the sticky map nothing to travel inside.
        Stretching the column to the row's height is what gives `sticky` its
        range.

        Below lg everything stacks, with the map FIRST: on a phone the map is
        what the step is for, and the panel follows it.
      */}
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {/*
            No overflow-hidden here, unlike the cards below: the boxes' lists
            open inline (AdminPicker) and must hang over the cards under this
            one, hence also the z-index.
          */}
          <div className="card relative z-10">
            <ToolSection
              title="By name"
              icon={<Map20Regular />}
              hint={
                atCapacity
                  ? `Holding ${spec.maxAreas} areas, the maximum. Remove one to add another.`
                  : "Type a name, or click the map to find the place there."
              }
            >
              <AdminPicker
                choice={sync.choice}
                onChoice={sync.setChoice}
                areas={state.areas}
                maxAreas={spec.maxAreas}
                onAdd={(draft) => dispatch({ type: "addAreas", areas: [draft] })}
                onShow={(id) => dispatch({ type: "focusArea", id })}
              />
            </ToolSection>
          </div>

          <div className="card overflow-hidden">
            <ToolSection
              title="From a shapefile"
              icon={<ArrowUpload20Regular />}
              hint="A .zip holding .shp, .shx, .dbf and .prj. Polygons only."
            >
              <ShapefileUpload
                onAreas={(areas) => dispatch({ type: "addAreas", areas })}
              />
            </ToolSection>

            <ToolSection
              title="By coordinate"
              icon={<Location20Regular />}
              hint="Paste a latitude and longitude, or switch the map to Add point and click."
            >
              <CoordinateEntry
                onAreas={(areas) => dispatch({ type: "addAreas", areas })}
              />
            </ToolSection>
          </div>

          {/*
            The running list, under the tools that fill it. As tall as its
            contents; past about six rows they scroll (SelectedAreas).
          */}
          <div className="card flex flex-col p-4">
            <SelectedAreas
              areas={state.areas}
              cap={capHint}
              emptyHint={
                "Nothing selected yet. Pick a county, sub-county or ward, " +
                "upload a shapefile, paste a coordinate, or click the map."
              }
              onFocus={(id) => dispatch({ type: "focusArea", id })}
              onFitAll={() => dispatch({ type: "focusAll" })}
              onRemove={(id) => dispatch({ type: "removeArea", id })}
              onClear={() => dispatch({ type: "clearAreas" })}
            />
          </div>
        </div>

        {/*
          The map column stretches to the row; the card inside it is sticky
          16px under the 56px top bar. Below lg it moves to the top of the
          stack and does not stick.
        */}
        <div className="min-w-0 max-lg:order-first">
          <div className="card overflow-hidden lg:sticky lg:top-[72px]">
            <MapSizeStepper size={mapSize} onChange={setStoredMapSize} />
            <div
              /*
               * Below lg the remembered stop from MapSizeStepper decides. At lg
               * and up the height comes from the viewport (MAP_HEIGHT). Tailwind
               * emits variant utilities after unprefixed ones, so the lg class
               * wins on a specificity tie without !important.
               */
              className={`relative w-full ${MAP_SIZES[mapSize].className} ${MAP_HEIGHT} lg:min-h-0`}
            >
              <MapPanel
                areas={state.areas}
                focus={state.focus}
                tool={sync.tool}
                onTool={sync.setTool}
                onAddAreas={(areas) => dispatch({ type: "addAreas", areas })}
                onFocusArea={(id) => dispatch({ type: "focusArea", id })}
                onIdentify={sync.identify}
                preview={sync.preview}
                note={sync.note}
              />
            </div>
          </div>
        </div>
      </div>
    </StepShell>
  );
}
