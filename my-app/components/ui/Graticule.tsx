/**
 * The plus-grid: the design system's spatial motif, as a backdrop.
 *
 * Lifted from the Spatial Analytics Dashboard cover, where a graticule of
 * small plus marks is cut from the ground over the brand block. Plus marks
 * rather than full lines because a full lat/lon grid at this density reads as
 * a table border; a plus at every intersection reads as a map's tick marks.
 * The pitch is Fluent's spacingXXL (24px), so it sits on the same 4px grid as
 * everything else on the page.
 *
 * `ground` says what it is drawn over. On the brand fill the marks are the
 * page ground showing through, as on the cover; on a light panel they are a
 * faint ink so they orient without competing with the copy on top.
 *
 * Decorative and aria-hidden. One inline SVG with a pattern, so it costs no
 * request and scales without artefacts. The pattern id is suffixed by ground
 * so two graticules on one page cannot collide.
 */
export function Graticule({
  className = "",
  ground = "light",
  behindText = false,
}: {
  className?: string;
  ground?: "light" | "brand";
  /** Set when copy sits on top of the grid, which fades it to a texture. */
  behindText?: boolean;
}) {
  const id = `plus-grid-${ground}${behindText ? "-text" : ""}`;
  const stroke = ground === "brand" ? "var(--color-surface)" : "var(--color-ink)";
  // Behind copy the marks drop to a whisper, so they read as texture and
  // never as a second layer of glyphs competing with the words on top.
  const opacity = behindText ? 0.16 : ground === "brand" ? 0.55 : 0.14;

  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    >
      <defs>
        <pattern id={id} width="24" height="24" patternUnits="userSpaceOnUse">
          <path
            d="M8 12h8M12 8v8"
            fill="none"
            stroke={stroke}
            strokeOpacity={opacity}
            strokeWidth="1.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
