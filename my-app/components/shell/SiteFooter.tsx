import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

/**
 * The footer carries the data provenance, which is not decoration: an analysis
 * product that does not say where its geometry came from cannot be checked by
 * the person reading it.
 *
 * NOTE: nothing renders this today; app/layout.tsx has its own footer. It is
 * kept, restyled into the same Fluent neutral chrome, for the day the richer
 * three-column footer is wanted.
 */
export function SiteFooter() {
  return (
    <footer className="band-chrome mt-auto border-t border-edge">
      <div className="mx-auto grid w-full max-w-band gap-8 px-gutter py-8 sm:grid-cols-[1.4fr_1fr_1fr] lg:px-gutter-lg">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="type-caption1 max-w-xs text-ink-muted">
            Earth observation analysis over Kenya&rsquo;s 47 counties: flood risk, drought,
            food security and rangeland dynamics.
          </p>
        </div>

        <nav aria-label="Product" className="flex flex-col gap-2">
          <h2 className="eyebrow">Product</h2>
          {/*
            `as const` is load-bearing with typedRoutes. Without it the array
            literal widens to string[], `href` is a plain string, and Link
            rejects it; WITH it each href stays a literal and is checked
            against the routes that actually exist, so deleting a page turns
            this footer into a build error instead of three silent 404s.
          */}
          {(
            [
              ["Topics of study", "/"],
              ["Create an account", "/signup"],
              ["Sign in", "/login"],
            ] as const
          ).map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="type-caption1 rounded-fluent-small text-accent-link hover:underline"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-2">
          <h2 className="eyebrow">Data provenance</h2>
          <p className="type-caption1 text-ink-muted">
            County boundaries: geoBoundaries gbOpen KEN ADM1 (2020), sourced from the RCMRD
            Africa GeoPortal. Public Domain.
          </p>
          <p className="type-caption1 text-ink-faint">
            Indicator values in this build are synthetic and seeded, for interface review only.
          </p>
        </div>
      </div>
    </footer>
  );
}
