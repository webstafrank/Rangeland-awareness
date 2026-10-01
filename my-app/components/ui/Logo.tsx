import Image from "next/image";
import type { Tone } from "./tone";

interface LogoProps {
  /** Accepted for compatibility. There is one light chrome now. */
  tone?: Tone;
  /** Mark only, for a compact header. */
  markOnly?: boolean;
  /** The mark's height in px. Its width follows the artwork's 207:165 ratio. */
  size?: number;
  className?: string;
  /** Classes for the wordmark alone, e.g. to hide it below a breakpoint. */
  wordmarkClassName?: string;
}

const RATIO = 207 / 165;

/**
 * The Kenya Space Agency mark beside the product name.
 *
 * The raster is the agency's own artwork, not a redraw: a hand-drawn stand-in
 * for a government agency's logo is exactly the thing that should not ship.
 * It is served from /public and sized to its intrinsic ratio so it never
 * stretches.
 *
 * With the wordmark beside it the image is decorative (alt=""): the text names
 * the link, and a screen reader hearing "Kenya Space Agency logo, Disaster
 * Monitor, Kenya Space Agency" is hearing one name three times. Mark only,
 * the image carries the name itself.
 */
export function Logo({
  markOnly = false,
  size = 32,
  className = "",
  wordmarkClassName = "flex",
}: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src="/ksa-logo.png"
        alt={markOnly ? "Kenya Space Agency" : ""}
        width={Math.round(size * RATIO)}
        height={size}
        priority
        className="shrink-0"
      />
      {markOnly ? null : (
        <span className={`min-w-0 flex-col ${wordmarkClassName}`}>
          <span className="type-body1 font-semibold whitespace-nowrap text-ink">
            Disaster Monitor
          </span>
          <span className="type-caption1 whitespace-nowrap text-ink-faint">
            Kenya Space Agency
          </span>
        </span>
      )}
    </span>
  );
}
