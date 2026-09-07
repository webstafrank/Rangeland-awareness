import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

/**
 * The footer carries the data provenance, which is not decoration: an analysis
 * product that does not say where its geometry came from cannot be checked by
 * the person reading it.
 */
export function SiteFooter() {
  return (
    <footer className="band-navy-deep border-navy-700 mt-auto border-t">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-12 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-8">
        <div className="flex flex-col gap-3">
          <Logo tone="dark" />
          <p className="text-caption text-ink-dark-secondary max-w-xs">
            Earth observation analysis over Kenya&rsquo;s 47 counties: flood risk, drought,
            food security and rangeland dynamics.
          </p>
        </div>

        <nav aria-label="Product" className="flex flex-col gap-2">
          <h2 className="text-micro text-ink-dark-muted font-semibold tracking-[0.14em] uppercase">
            Product
          </h2>
          {[
            ["Topics of study", "/analysis"],
            ["Create an account", "/signup"],
            ["Sign in", "/login"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="text-caption text-ink-dark-secondary hover:text-ink-dark-primary rounded"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-2">
          <h2 className="text-micro text-ink-dark-muted font-semibold tracking-[0.14em] uppercase">
            Data provenance
          </h2>
          <p className="text-caption text-ink-dark-secondary">
            County boundaries: geoBoundaries gbOpen KEN ADM1 (2020), sourced from the RCMRD
            Africa GeoPortal. Public Domain.
          </p>
          <p className="text-caption text-ink-dark-muted">
            Indicator values in this build are synthetic and seeded, for interface review only.
          </p>
        </div>
      </div>
    </footer>
  );
}
