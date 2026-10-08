import {
  FoodGrains20Regular,
  FoodGrains24Regular,
  LeafThree20Regular,
  LeafThree24Regular,
  WeatherRainShowersDay20Regular,
  WeatherRainShowersDay24Regular,
  WeatherSunny20Regular,
  WeatherSunny24Regular,
} from "@/components/ui/icons";
import type { TopicSlug } from "@/services/analysis/topics";

/**
 * A topic's tile: one Fluent System Icon on the brand's soft fill.
 *
 * The registry's `accent` classes are NOT read here, deliberately. They were
 * written for the four-colour system, which told the topics apart by giving
 * two of them red; two of those class names no longer exist in the palette,
 * and a second hue per topic would break the design system's "no colour that
 * carries no meaning" rule anyway. So all four tiles share the one brand
 * treatment and the ICON carries identity, which is also the channel that
 * survives colour blindness and greyscale print. `services/` is untouched;
 * this is presentation, and it lives beside the components that present it.
 *
 * Exhaustive over TopicSlug, so a fifth topic is a type error here rather
 * than a blank tile.
 */
const ICONS: Record<TopicSlug, { sm: typeof LeafThree20Regular; lg: typeof LeafThree24Regular }> = {
  "flood-risk": { sm: WeatherRainShowersDay20Regular, lg: WeatherRainShowersDay24Regular },
  "drought-monitoring": { sm: WeatherSunny20Regular, lg: WeatherSunny24Regular },
  "rangeland-dynamics": { sm: LeafThree20Regular, lg: LeafThree24Regular },
  "food-security": { sm: FoodGrains20Regular, lg: FoodGrains24Regular },
};

const SIZES = {
  sm: "h-8 w-8 rounded-fluent-medium",
  md: "h-10 w-10 rounded-fluent-large",
  lg: "h-12 w-12 rounded-fluent-xlarge",
} as const;

export default function TopicIcon({
  slug,
  size = "md",
  className = "",
}: {
  slug: TopicSlug;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const Icon = size === "lg" ? ICONS[slug].lg : ICONS[slug].sm;
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center bg-accent-soft text-accent ${SIZES[size]} ${className}`}
    >
      <Icon />
    </span>
  );
}

/**
 * The topic's bare 20px glyph, no tile: for places that draw their own
 * ground, like a sidebar row on navy.
 */
export function TopicGlyph({ slug, className }: { slug: TopicSlug; className?: string }) {
  const Icon = ICONS[slug].sm;
  return <Icon aria-hidden="true" className={className} />;
}
