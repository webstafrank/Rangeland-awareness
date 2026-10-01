import Image from "next/image";
import type { ReactNode } from "react";
import { Checkmark16Regular } from "@/components/ui/icons";
import { Graticule } from "@/components/ui/Graticule";

/**
 * Two panels: the reason on the left, the form on the right.
 *
 * The left panel is the one place the app sets its brand blue as a surface
 * (`band-brand`), with the design system's plus-grid cut from it exactly as on
 * its cover. It replaces a navy panel; the pairing idea is the same, but the
 * ground is now Fluent's colorBrandBackground and everything on it is
 * colorNeutralForegroundOnBrand, set by the band rather than by each child.
 *
 * On a narrow screen the two stack, brand first, so the form is still the last
 * thing on screen and the keyboard does not push the explanation out of view.
 *
 * The form side is a `div`, not a second `<main>`: the root layout already
 * renders the one `<main id="main">` the skip link targets, and a nested main
 * with the same id was two landmarks and a duplicate id on every auth page.
 *
 * Typed as a plain `children` prop rather than `LayoutProps<...>`: this is a
 * route-group layout, and a route group contributes no URL segment, so there
 * is no distinct route literal to key the generated helper off.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid flex-1 lg:grid-cols-[1fr_1fr]">
      <aside className="band-brand relative flex flex-col justify-between gap-10 overflow-hidden px-gutter py-10 sm:px-10 lg:py-14">
        <Graticule ground="brand" behindText />

        <div className="relative flex items-center gap-3">
          <span className="grid h-12 w-14 place-items-center rounded-fluent-large bg-surface shadow-8">
            <Image src="/ksa-logo.png" alt="Kenya Space Agency" width={45} height={36} />
          </span>
          <span className="type-subtitle2">Disaster Monitor</span>
        </div>

        <div className="relative max-w-md">
          <p className="type-caption1 font-semibold">Why an account</p>
          <h2 className="type-title2 mt-2">Every topic is open without one.</h2>
          <p className="type-body2 mt-3">
            An account does not unlock analysis: guests get all four topics, all 47 counties and
            every model. It saves your runs so you can come back to a result and compare it
            against a later window.
          </p>

          <ul className="mt-6 flex flex-col gap-2.5">
            {[
              "Saved runs, kept as shareable links",
              "Your recent areas of interest, ready to reuse",
              "Nothing gated behind a paywall",
            ].map((item) => (
              <li key={item} className="type-body1 flex items-start gap-2.5">
                <Checkmark16Regular aria-hidden="true" className="mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="type-caption1 relative">
          Boundaries: geoBoundaries gbOpen KEN ADM1 (2020), RCMRD Africa GeoPortal. Public Domain.
        </p>
      </aside>

      <div className="flex items-center justify-center bg-surface px-gutter py-10 sm:px-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
