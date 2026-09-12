import type { Tone } from "./tone";

interface LogoProps {
  tone?: Tone;
  /** Mark only, for the compact app header. */
  markOnly?: boolean;
  size?: number;
  className?: string;
}

/**
 * The mark: an earth limb with three rangeland contour lines and a scarlet
 * orbiter. It is drawn rather than imported so it inherits the tone and stays
 * crisp at 24px, where a raster logo would blur.
 *
 * `currentColor` carries the limb and contours, so the mark works on any
 * ground without a second asset.
 */
export function Logo({ tone = "light", markOnly = false, size = 30, className = "" }: LogoProps) {
  const wordInk = tone === "dark" ? "text-white" : "text-navy-900";
  const subInk = tone === "dark" ? "text-ink-dark-muted" : "text-ink-light-muted";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className={wordInk}
      >
        {/* Earth limb: an arc, not a full circle, so the mark reads as a horizon. */}
        <path
          d="M2.6 21.4a15 15 0 1 1 26.8 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Three contours, tightening downward: the rangeland surface. */}
        <path d="M6.4 21.4h19.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.9" />
        <path d="M8.8 25.2h14.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
        <path d="M11.8 29h8.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.32" />
        {/* The orbiter. The only scarlet in the mark, and the only fill. */}
        <circle cx="24.4" cy="8.2" r="3.1" fill="var(--color-scarlet-mark)" />
      </svg>

      {markOnly ? null : (
        <span className="flex flex-col leading-none">
          <span className={`text-sm font-bold tracking-tight ${wordInk}`}>Rangeland Watch</span>
          <span className={`text-micro mt-0.5 tracking-[0.1em] uppercase ${subInk}`}>
            Kenya · Earth Observation
          </span>
        </span>
      )}
    </span>
  );
}
