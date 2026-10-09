/**
 * The shell's navigation model: what the sidebar, the mobile drawer, the top
 * bar's links and its breadcrumb all read.
 *
 * Plain data and pure functions, so a server component can import it and the
 * rules are unit-tested (`__tests__/nav-model.test.ts`) rather than read off
 * a screenshot. Topics and steps come from their registries, so a fifth topic
 * or a renamed step reaches the sidebar and the breadcrumb with no edit here.
 */

import type { Route } from "next";
import { TOPICS, getTopic, type Topic, type TopicSlug } from "@/services/analysis/topics";
import { isTerminalSegment, stepForSegment } from "@/services/analysis/steps";

export interface PrimaryItem {
  label: string;
  href: Route;
  icon: "explore" | "analysis" | "reports";
  /** True when `pathname` is inside this section. */
  current: (pathname: string) => boolean;
}

/**
 * The three sections of the product, in this order and nothing else. The
 * Overview is the brand link at the top of the sidebar, not a fourth item,
 * so the same three fit the phone's top bar beside the menu button.
 */
export const PRIMARY_ITEMS: readonly PrimaryItem[] = [
  { label: "Explore", href: "/data", icon: "explore", current: (p) => p === "/data" },
  {
    label: "Analysis",
    href: "/#topics" as Route,
    icon: "analysis",
    // A real topic only: a 404 under /topics/ is not "in" Analysis.
    current: (p) => currentTopic(p) !== null,
  },
  { label: "Reports", href: "/reports", icon: "reports", current: (p) => p === "/reports" },
];

export interface TopicItem {
  slug: TopicSlug;
  label: string;
  href: Route;
}

export const TOPIC_ITEMS: readonly TopicItem[] = TOPICS.map((topic) => ({
  slug: topic.slug,
  label: topic.name,
  href: `/topics/${topic.slug}` as Route,
}));

/** The topic slug `pathname` is inside, or null. */
export function currentTopic(pathname: string): TopicSlug | null {
  const match = /^\/topics\/([^/?#]+)/.exec(pathname);
  if (!match) return null;
  return getTopic(match[1])?.slug ?? null;
}

export interface SupportItem {
  label: string;
  href: Route;
  icon: "help" | "about" | "contact";
}

export const SUPPORT_ITEMS: readonly SupportItem[] = [
  { label: "Help", href: "/help", icon: "help" },
  { label: "About", href: "/about", icon: "about" },
  { label: "Contact", href: "/contact", icon: "contact" },
];

export interface Crumb {
  label: string;
  /** Absent on the last crumb, which is the page itself. */
  href?: Route;
}

/**
 * Top-level pages, as the section they sit in and their own name. The section
 * is a plain label, not a link: it names where the page belongs in the
 * sidebar, so the top bar adds context instead of repeating the page title.
 */
const PAGE_TRAILS: Readonly<Record<string, readonly [string | null, string]>> = {
  "/": [null, "Overview"],
  "/data": ["Workspace", "Explore data"],
  "/reports": ["Workspace", "Reports"],
  "/about": ["Support", "About"],
  "/help": ["Support", "Help"],
  "/contact": ["Support", "Contact"],
  "/account": [null, "Account"],
  "/login": ["Account", "Sign in"],
  "/signup": ["Account", "Create account"],
};

const TERMINAL_TITLES = { running: "Running", results: "Results" } as const;

/**
 * Where the reader is, as a trail. One crumb for a top-level page; for a
 * topic, the section, the topic and the step (or the run screen).
 */
export function crumbsFor(pathname: string): Crumb[] {
  const path = pathname.replace(/\/+$/, "") || "/";
  const trail = PAGE_TRAILS[path];
  if (trail) {
    const [section, title] = trail;
    return section ? [{ label: section }, { label: title }] : [{ label: title }];
  }

  const slug = currentTopic(path);
  if (slug) {
    const topic = getTopic(slug) as Topic;
    const segment = path.split("/")[3] ?? "";
    const step = stepForSegment(segment);
    const leaf = step
      ? step.label
      : isTerminalSegment(segment)
        ? TERMINAL_TITLES[segment]
        : null;
    const trail: Crumb[] = [{ label: "Analysis", href: "/#topics" as Route }];
    if (!leaf) return [...trail, { label: topic.name }];
    return [...trail, { label: topic.name, href: `/topics/${slug}` as Route }, { label: leaf }];
  }

  // Every real route is named above, so anything else is the not-found page.
  return [{ label: "Page not found" }];
}
