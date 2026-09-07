/**
 * A faint lat/lon graticule, used as a backdrop on the navy hero bands.
 *
 * It is decorative and marked `aria-hidden`, but it is not arbitrary
 * decoration: the meridian spacing and the single emphasised line at the
 * equator are what tie the hero to the thing the app actually does. Kenya
 * straddles the equator, so that one brighter line is a real reference.
 *
 * Rendered as one inline SVG with a pattern, so it costs no request and
 * scales without artefacts.
 */
export function Graticule({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id="graticule" width="72" height="72" patternUnits="userSpaceOnUse">
          <path
            d="M72 0H0V72"
            fill="none"
            stroke="var(--color-ink-dark-primary)"
            strokeOpacity="0.07"
            strokeWidth="1"
          />
        </pattern>
        <linearGradient id="graticule-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.85" />
          <stop offset="100%" stopColor="white" stopOpacity="0.15" />
        </linearGradient>
        <mask id="graticule-mask">
          <rect width="100%" height="100%" fill="url(#graticule-fade)" />
        </mask>
      </defs>

      <rect width="100%" height="100%" fill="url(#graticule)" mask="url(#graticule-mask)" />

      {/* The equator. Kenya sits on it, so this line is a reference, not a flourish. */}
      <line
        x1="0"
        y1="62%"
        x2="100%"
        y2="62%"
        stroke="var(--color-scarlet-mark)"
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeDasharray="5 7"
      />
    </svg>
  );
}
