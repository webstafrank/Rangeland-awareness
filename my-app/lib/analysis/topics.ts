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
   * Two-letter tile glyph. Explicit rather than derived from the name: "Flood
   * risk" and "Food security assessment" both start with F, so a first-letter
   * slice gave two topics the same tile and the tile stopped being a way to
   * recognise a topic at a glance. A test asserts all four stay distinct.
   */
  glyph: string;
  /**
   * Tailwind accent classes, kept here so topic colour is data, not scattered
   * CSS. These are wayfinding, so a reader can tell the four topics apart at a
   * glance, not branding. The app has one light theme, so each value is a
   * single class with no variant.
   *
   * The palette is four colours, which is fewer than the six a "one hue per
   * topic" scheme would need, so the four topics are separated by TREATMENT as
   * well as by hue: navy solid, red solid, navy on its wash, red on its wash.
   * Two axes, four distinct tiles, and no fifth colour smuggled in to make the
   * arithmetic work.
   */
  accent: {
    /** Text colour for the topic name. Always a token that passes AA on a panel. */
    text: string;
    /** Fill behind the icon glyph. Distinct per topic; a test asserts it. */
    tile: string;
    /** Border for the icon tile and the card's hover state. */
    border: string;
    /** Glyph colour, which has to invert on the two solid tiles. */
    tileText: string;
  };
}

export const TOPICS: readonly Topic[] = [
  {
    slug: "flood-risk",
    glyph: "FL",
    name: "Flood risk",
    question: "Which areas are likely to flood, and how badly?",
    output:
      "A per-pixel flood susceptibility score with the contributing drivers ranked.",
    inputs: ["Rainfall", "Terrain and slope", "Drainage density", "Soil moisture"],
    accent: {
      text: "text-accent",
      tile: "bg-accent",
      border: "border-accent",
      tileText: "text-white",
    },
  },
  {
    slug: "drought-monitoring",
    glyph: "DR",
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
      text: "text-action",
      tile: "bg-action",
      border: "border-action",
      tileText: "text-white",
    },
  },
  {
    slug: "rangeland-dynamics",
    glyph: "RD",
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
      text: "text-accent",
      tile: "bg-accent-soft",
      border: "border-accent-border",
      tileText: "text-accent",
    },
  },
  {
    slug: "food-security",
    glyph: "FS",
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
      text: "text-action",
      tile: "bg-action-soft",
      border: "border-action-border",
      tileText: "text-action",
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
