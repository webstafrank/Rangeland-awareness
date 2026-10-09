"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Tab, TabList } from "@fluentui/react-components";
import { FRAME } from "@/components/shell/Page";
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
 * The white band the tab row sits in: the page header's ground carried down
 * (ReportsFrame leaves its own bottom open) and closed with the hairline, so
 * the selected tab's bar lands on the line between header and canvas.
 * Shared with ReportTabsPlaceholder so the two are the same height and in the
 * same place (evals/reports.spec.ts R11).
 */
function TabBand({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-edge bg-surface">
      <div className={FRAME}>{children}</div>
    </div>
  );
}

/**
 * The canvas band under the tabs, where the panel (or, in loading.tsx, the
 * skeleton) sits. One definition for both, so the card lands where it loaded.
 */
export function ReportPanelBand({ children }: { children: ReactNode }) {
  return <div className={`${FRAME} py-6 lg:py-8`}>{children}</div>;
}

/**
 * The tab row's frame, shared with ReportTabsPlaceholder so the two are the
 * same height and in the same place.
 *
 * Scrolls sideways inside itself on a narrow screen rather than wrapping (a
 * wrapped tab row reads as two rows of choices) or pushing the page wider
 * than the viewport.
 *
 * Shifted left by the tab's side padding plus its 2px content inset (12px,
 * 8px on a phone where TAB_CLASS trims the padding)
 * so the first label lines up with the heading and the card, not
 * the invisible edge of its hover background. On a phone the shift sits
 * inside the scroller's padding; from lg the scroller itself moves, so
 * neither clips the tab's hover or focus fill.
 *
 * When the row is wider than the screen, the edge it continues past fades
 * out (a mask, so nothing is laid over the tabs), which is the cue that it
 * scrolls. Each fade is on only while there is more on that side.
 */
function TabRow({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });

  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    const measure = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMore((previous) =>
        previous.start === start && previous.end === end ? previous : { start, end },
      );
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Absent in jsdom; every browser this app supports has it.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, []);

  const FADE = "2rem";
  const mask =
    more.start || more.end
      ? `linear-gradient(to right, ${more.start ? "transparent" : "black"}, black ${FADE}, black calc(100% - ${FADE}), ${more.end ? "transparent" : "black"})`
      : undefined;

  return (
    <div
      ref={scroller}
      className="-mx-gutter overflow-x-auto px-gutter lg:-mx-3 lg:px-0"
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      <div className="-ml-2 sm:-ml-3 lg:ml-0">{children}</div>
    </div>
  );
}

/**
 * What a tab shows below 640px, so all four fit a 360px phone without
 * scrolling. The accessible name stays the full topic name (aria-label on
 * the Tab), which is also what the tablist tests match.
 */
const SHORT_LABEL: Record<TopicSlug, string> = {
  "flood-risk": "Flood",
  "drought-monitoring": "Drought",
  "rangeland-dynamics": "Rangeland",
  "food-security": "Food security",
};

/**
 * Fluent's medium tab, with its side padding taken from 10px to 6px on a
 * phone (the row's left shift above follows: 6px plus the 2px content inset).
 * `!` because Griffel's atomic classes are unlayered and would otherwise win.
 */
const TAB_CLASS = "max-sm:pl-1.5! max-sm:pr-1.5!";

function TabLabel({ slug, name }: { slug: TopicSlug; name: string }) {
  return (
    <>
      <span className="sm:hidden">{SHORT_LABEL[slug]}</span>
      <span className="hidden sm:inline">{name}</span>
    </>
  );
}

/**
 * The tab row as app/reports/loading.tsx shows it, before the page knows
 * which topic is selected: the real Fluent TabList, disabled and with nothing
 * selected, so it is exactly the height of the live one (a hand-sized
 * imitation was 10px short and shifted the panel when the page landed).
 * Hidden from assistive tech: it cannot be used, and the live one replaces it.
 */
export function ReportTabsPlaceholder({
  tabs,
}: {
  tabs: readonly { slug: TopicSlug; name: string }[];
}) {
  return (
    <TabBand>
      <div aria-hidden="true">
        <TabRow>
          <TabList size="medium" disabled selectedValue={null}>
            {tabs.map((tab) => (
              <Tab key={tab.slug} value={tab.slug} tabIndex={-1} className={TAB_CLASS}>
                <TabLabel slug={tab.slug} name={tab.name} />
              </Tab>
            ))}
          </TabList>
        </TabRow>
      </div>
    </TabBand>
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
    <>
      <TabBand>
        <TabRow>
          <TabList
            aria-label="Report topics"
            selectedValue={selected}
            onTabSelect={(_, data) => select(data.value as TopicSlug)}
            size="medium"
          >
            {tabs.map((tab) => (
              <Tab
                key={tab.slug}
                id={tabId(tab.slug)}
                value={tab.slug}
                aria-controls={PANEL_ID}
                aria-label={tab.name}
                className={TAB_CLASS}
              >
                <TabLabel slug={tab.slug} name={tab.name} />
              </Tab>
            ))}
          </TabList>
        </TabRow>
      </TabBand>

      <ReportPanelBand>
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
          className="rounded-fluent-xlarge focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
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
      </ReportPanelBand>
    </>
  );
}
