import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Graticule } from "@/components/ui/Graticule";
import { Logo } from "@/components/ui/Logo";

/**
 * The alternation applied horizontally: navy on the left, white on the right.
 *
 * On a narrow screen the two stack, navy first, so the form is still the last
 * thing on screen and the keyboard does not push the explanation out of view.
 *
 * Typed as a plain `children` prop rather than `LayoutProps<...>`: this is a
 * route-group layout, and a route group contributes no URL segment, so there
 * is no distinct route literal to key the generated helper off.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="band-navy relative flex flex-col justify-between overflow-hidden px-6 py-10 sm:px-10 lg:py-14">
        <Graticule />

        <div className="relative">
          <Link href="/" className="rounded" aria-label="Rangeland Watch home">
            <Logo tone="dark" />
          </Link>
        </div>

        <div className="relative mt-12 max-w-md lg:mt-0">
          <Eyebrow tone="dark">Why an account</Eyebrow>
          <h2 className="mt-5 text-3xl font-bold tracking-tight text-balance">
            Every topic is open without one.
          </h2>
          <p className="text-ink-dark-secondary mt-4 leading-relaxed">
            An account does not unlock analysis: guests get all four topics, all 47 counties and
            both models. It saves your runs so you can come back to a result and compare it
            against a later window.
          </p>

          <ul className="mt-8 flex flex-col gap-3">
            {[
              "Saved runs, kept as shareable links",
              "Your recent areas of interest, ready to reuse",
              "Nothing gated behind a paywall",
            ].map((item) => (
              <li key={item} className="text-ink-dark-secondary flex items-start gap-3 text-sm">
                <span className="bg-scarlet-mark mt-2 h-[2px] w-4 shrink-0" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-caption text-ink-dark-muted relative mt-12 lg:mt-0">
          Boundaries: geoBoundaries gbOpen KEN ADM1 (2020), RCMRD Africa GeoPortal. Public Domain.
        </p>
      </aside>

      <main id="main" className="band-white flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
