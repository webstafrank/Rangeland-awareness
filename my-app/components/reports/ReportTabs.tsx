"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Tab, TabList } from "@fluentui/react-components";
import type { TopicSlug } from "@/services/analysis/topics";
import { ReportSkeleton } from "./ReportSkeleton";

/**
 * The four topics as tabs, and the panel under them.
 *
 * Fluent's TabList, so the tabs pattern comes from the design system rather
 * than being rebuilt: role="tablist"/"tab", aria-selected, a roving tab stop,
 * arrow keys between tabs, and the selection bar that slides from one tab to
 * the next.
 *
 * The selected topic lives in the URL (?topic=), not in state, so a tab can
 * be linked, reloads where it was, and Back steps through the tabs visited.
 * Choosing a tab pushes that URL inside a transition. The server renders the
 * new topic's ReportPanel, which arrives as `children`; until it does, the
 * panel shows ReportSkeleton. The tab itself moves at once, so the click
 * always answers immediately even while the content is on its way. The
 * address bar only changes when Next commits the new page, so on a slow
 * fetch it trails the tab for that long; a reload in that window opens the
 * previous topic. That is Next's push, not something to work around here.
 *
 * The skeleton is held for at least MIN_SKELETON_MS. Prefetched, the new
 * panel can arrive in a frame or two, and a skeleton that flashes for 20ms
 * reads as a flicker, not as loading. Long enough to read as one deliberate
 * step, short enough not to slow anyone down; a slow fetch simply keeps it
 * up for longer.
 */

export const MIN_SKELETON_MS = 350;

export interface ReportTab {
  slug: TopicSlug;
  name: string;
  /** Shown in the skeleton's header while this topic's report loads. */
  question: string;
}

const hrefFor = (slug: TopicSlug) => `/reports?topic=${slug}` as Route;
const tabId = (slug: TopicSlug) => `report-tab-${slug}`;
const PANEL_ID = "report-panel";

/**
 * The tab row's frame, shared with ReportTabsPlaceholder so the two are the
 * same height and in the same place.
 *
 * Scrolls sideways inside itself on a narrow screen rather than wrapping (a
 * wrapped tab row reads as two rows of choices) or pushing the page wider
 * than the viewport.
 *
 * Shifted 12px left (Fluent's large-tab padding plus its content inset,
 * measured) so the first label lines up with the heading and the card, not
 * the invisible edge of its hover background. On a phone the shift sits
 * inside the scroller's padding; from lg the scroller itself moves, so
 * neither clips the tab's hover or focus fill.
 */
function TabRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-gutter overflow-x-auto px-gutter lg:-mx-3 lg:px-0">
      <div className="-ml-3 lg:ml-0">{children}</div>
    </div>
  );
}

/**
 * The tab row as app/reports/loading.tsx shows it, before the page knows
 * which topic is selected: the real Fluent TabList, disabled and with nothing
 * selected, so it is exactly the height of the live one (a hand-sized
 * imitation was 10px short and shifted the panel when the page landed).
 * Hidden from assistive tech: it cannot be used, and the live one replaces it.
 */
export function ReportTabsPlaceholder({ names }: { names: readonly string[] }) {
  return (
    <div aria-hidden="true">
      <TabRow>
        <TabList size="large" disabled selectedValue={null}>
          {names.map((name) => (
            <Tab key={name} value={name} tabIndex={-1}>
              {name}
            </Tab>
          ))}
        </TabList>
      </TabRow>
    </div>
  );
}

export function ReportTabs({
  tabs,
  active,
  children,
}: {
  tabs: readonly ReportTab[];
  /** The topic the server rendered `children` for, read from the URL. */
  active: TopicSlug;
  /** That topic's ReportPanel. */
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // The tab being switched to, while its panel is on its way. An object, so
  // every click is a new value and restarts the hold below.
  const [switching, setSwitching] = useState<{ to: TopicSlug } | null>(null);
  // When the skeleton reached the page. Timed from the commit, not the
  // click: the click's render takes a frame or two, and timing from the click
  // left the skeleton on screen ~25ms short of its minimum (measured, R3).
  const shownAt = useRef(0);
  useLayoutEffect(() => {
    if (switching) shownAt.current = performance.now();
  }, [switching]);

  // Warm every other tab, so a switch usually costs only the skeleton's
  // minimum. Prefetch is a hint; a miss just means a real fetch.
  useEffect(() => {
    for (const tab of tabs) if (tab.slug !== active) router.prefetch(hrefFor(tab.slug));
  }, [router, tabs, active]);

  // Once the new panel has arrived, keep the skeleton up for whatever is left
  // of its minimum, then show the panel.
  useEffect(() => {
    if (!switching || isPending) return;
    const left = Math.max(0, MIN_SKELETON_MS - (performance.now() - shownAt.current));
    const timer = window.setTimeout(() => setSwitching(null), left);
    return () => window.clearTimeout(timer);
  }, [switching, isPending]);

  const selected = switching?.to ?? active;
  const loading = switching !== null;
  const selectedTab = tabs.find((tab) => tab.slug === selected);

  // What the status line says. Empty until the first switch, so loading the
  // page announces nothing extra; then it changes on every step, in a node
  // that stays mounted, which is what screen readers reliably announce (a
  // live region that mounts already holding its text is often skipped).
  const [hasSwitched, setHasSwitched] = useState(false);
  const activeName = tabs.find((tab) => tab.slug === active)?.name ?? "";
  const status = !hasSwitched
    ? ""
    : loading
      ? `Loading the ${selectedTab?.name ?? ""} report`
      : `${activeName} report loaded`;

  const select = (slug: TopicSlug) => {
    if (slug === selected) return;
    setHasSwitched(true);
    setSwitching({ to: slug });
    // scroll: false, so the page stays where the reader is instead of jumping
    // to the top as a route change would.
    startTransition(() => router.push(hrefFor(slug), { scroll: false }));
  };

  return (
    <div>
      <TabRow>
        <TabList
          aria-label="Report topics"
          selectedValue={selected}
          onTabSelect={(_, data) => select(data.value as TopicSlug)}
          size="large"
        >
          {tabs.map((tab) => (
            <Tab key={tab.slug} id={tabId(tab.slug)} value={tab.slug} aria-controls={PANEL_ID}>
              {tab.name}
            </Tab>
          ))}
        </TabList>
      </TabRow>

      <p role="status" className="sr-only">
        {status}
      </p>

      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={tabId(selected)}
        aria-busy={loading}
        // Focusable so Tab from the tab list reaches the panel even when the
        // report holds no control of its own (the WAI-ARIA tabs pattern).
        tabIndex={0}
        className="mt-6 rounded-fluent-large focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        {loading ? (
          <ReportSkeleton topic={selectedTab} />
        ) : (
          // Keyed by topic so each arrival replays the fade-in.
          <div key={active} className="report-enter">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
