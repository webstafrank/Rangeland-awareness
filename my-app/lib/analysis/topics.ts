/**
 * The topic registry. One source of truth for the four analysis topics.
 *
 * Both the homepage and the topic page read from here. Nothing else in the app
 * is allowed to hardcode a topic name, slug or blurb: a topic added here shows
 * up on the homepage and gets a working route with no other edit.
 */

export const TOPIC_SLUGS = [
  "flood-risk",
  "drought-monitoring",
  "rangeland-dynamics",
  "food-security",
] as const;

export type TopicSlug = (typeof TOPIC_SLUGS)[number];

export interface Topic {
  slug: TopicSlug;
  /** Short label, used in nav, breadcrumbs and cards. */
  name: string;
  /** The question an analyst brings to this topic. One sentence, plain language. */
  question: string;
  /** What the model actually returns, so the card is not just a name. */
  output: string;
  /** Inputs the topic leans on. Shown as chips; also documents the data contract. */
  inputs: readonly string[];
  /**
   * Tailwind accent classes, kept here so topic colour is data, not scattered
   * CSS. Muted on purpose: these are wayfinding, so a reader can tell the four
   * topics apart at a glance, not branding. The app has one light theme, so
   * each value is a single class with no variant.
   */
  accent: {
    /** Text colour for the topic name and its icon glyph. */
    text: string;
    /** Subtle fill behind the icon glyph. */
    tile: string;
    /** Border for the icon tile and the card's hover state. */
    border: string;
  };
}

export const TOPICS: readonly Topic[] = [
  {
    slug: "flood-risk",
    name: "Flood risk",
    question: "Which areas are likely to flood, and how badly?",
    output:
      "A per-pixel flood susceptibility score with the contributing drivers ranked.",
    inputs: ["Rainfall", "Terrain and slope", "Drainage density", "Soil moisture"],
    accent: {
      text: "text-sky-800",
      tile: "bg-sky-50",
      border: "border-sky-200",
    },
  },
  {
    slug: "drought-monitoring",
    name: "Drought monitoring",
    question: "Where is drought setting in, and how far has it progressed?",
    output:
      "Drought severity classes over time, with the onset date per selected area.",
    inputs: [
      "Rainfall anomaly",
      "Land surface temperature",
      "NDVI anomaly",
      "Evapotranspiration",
    ],
    accent: {
      text: "text-amber-800",
      tile: "bg-amber-50",
      border: "border-amber-200",
    },
  },
  {
    slug: "rangeland-dynamics",
    name: "Rangeland dynamics",
    question: "How is grazing land changing across seasons and years?",
    output:
      "Vegetation condition and cover-change trajectories, with degradation flagged.",
    inputs: [
      "NDVI and EVI series",
      "Land cover",
      "Grazing pressure",
      "Rainfall seasonality",
    ],
    accent: {
      text: "text-emerald-800",
      tile: "bg-emerald-50",
      border: "border-emerald-200",
    },
  },
  {
    slug: "food-security",
    name: "Food security assessment",
    question: "Which populations are at risk of food insecurity, and when?",
    output:
      "An IPC-style phase estimate per area with the strongest risk drivers named.",
    inputs: [
      "Crop and pasture condition",
      "Market prices",
      "Livestock body condition",
      "Rainfall forecast",
    ],
    accent: {
      text: "text-rose-800",
      tile: "bg-rose-50",
      border: "border-rose-200",
    },
  },
];

const TOPIC_BY_SLUG: ReadonlyMap<string, Topic> = new Map(
  TOPICS.map((t) => [t.slug, t]),
);

/** Type guard so a raw route param can be narrowed before use. */
export function isTopicSlug(value: string): value is TopicSlug {
  return TOPIC_BY_SLUG.has(value);
}

/**
 * Look up a topic. Returns undefined for anything unknown so the caller can
 * decide (the route calls notFound(); tests assert undefined).
 */
export function getTopic(slug: string): Topic | undefined {
  return TOPIC_BY_SLUG.get(slug);
}
