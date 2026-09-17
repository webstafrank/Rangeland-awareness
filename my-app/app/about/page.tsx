import type { Metadata } from "next";
import Link from "next/link";
import { TOPICS } from "@/lib/analysis/topics";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Rangeland Awareness: Earth observation analysis for Kenya's rangelands.",
};

export default function AboutPage() {
  return (
    <>
      {/* Hero band */}
      <section className="band-chrome">
        <div className="mx-auto w-full max-w-band px-gutter py-16 lg:px-gutter-lg lg:py-24">
          <div className="max-w-3xl">
            <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.14em] text-on-chrome-muted">
              <span aria-hidden="true" className="h-[3px] w-8 bg-action" />
              About the platform
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-white lg:text-6xl">
              Rangeland Awareness
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-white lg:text-2xl">
              Earth observation decision support for Kenya&apos;s rangelands.
            </p>
          </div>
        </div>
      </section>

      {/* Mission section */}
      <section className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
        <div className="max-w-3xl">
          <Eyebrow>Mission</Eyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">
            Turning satellite data into rangeland decisions
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">
            Rangeland Awareness connects Kenya&apos;s rangeland managers with
            machine learning analysis built on satellite imagery and climate
            data. The platform makes earth observation accessible to the people
            who manage Kenya&apos;s vast rangelands, from Marsabit to the coast.
          </p>
          <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">
            Four analysis topics cover the critical questions: flood risk,
            drought monitoring, rangeland dynamics, and food security. Each
            topic runs against real satellite data and returns actionable
            results that can be traced back to their inputs.
          </p>
        </div>
      </section>

      {/* Who it's for */}
      <section className="border-y border-edge bg-surface">
        <div className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
          <div className="max-w-3xl">
            <Eyebrow>Who it&apos;s for</Eyebrow>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">
              Built for rangeland managers
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">
              The platform serves county-level rangeland managers, national
              planning agencies, and research institutions working across
              Kenya&apos;s arid and semi-arid lands. It is designed for people
              who need to make decisions about land use, livestock movement, and
              disaster preparedness based on current satellite-derived data.
            </p>
          </div>

          <dl className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                label: "County governments",
                description:
                  "Data-driven decisions for rangeland management and disaster preparedness.",
              },
              {
                label: "National agencies",
                description:
                  "Consistent, reproducible analysis across Kenya&apos;s 23 ASAL counties.",
              },
              {
                label: "Research institutions",
                description:
                  "Traceable analysis with inputs documented for academic rigour.",
              },
              {
                label: "Development partners",
                description:
                  "Evidence-based monitoring of rangeland condition and food security.",
              },
              {
                label: "Community organisations",
                description:
                  "Accessible satellite data for local land use planning.",
              },
              {
                label: "Conservation groups",
                description:
                  "Tracking vegetation change and grazing pressure over time.",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-edge bg-surface p-6 shadow-card"
              >
                <dt className="font-mono text-sm font-semibold tracking-tight text-accent">
                  {item.label}
                </dt>
                <dd
                  className="mt-2 text-sm leading-relaxed text-ink-muted"
                  dangerouslySetInnerHTML={{ __html: item.description }}
                />
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Data sources */}
      <section className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
        <div className="max-w-3xl">
          <Eyebrow>Data sources</Eyebrow>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">
            What feeds the analysis
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted lg:text-lg">
            The analysis runs on freely available satellite imagery and climate
            reanalysis data. No proprietary datasets are used, which means
            every result can be independently verified and reproduced.
          </p>
        </div>

        <dl className="mt-8 grid gap-5 sm:grid-cols-2">
          {[
            {
              label: "Sentinel-2",
              description:
                "Optical satellite imagery at 10m resolution for vegetation and land cover analysis.",
            },
            {
              label: "MODIS",
              description:
                "Daily surface reflectance and vegetation indices at 250m-1km resolution.",
            },
            {
              label: "CHIRPS",
              description:
                "Daily rainfall estimates at 5km resolution, calibrated against rain gauge data.",
            },
            {
              label: "ERA5",
              description:
                "Climate reanalysis providing temperature, humidity, and evapotranspiration estimates.",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-edge bg-surface p-6 shadow-card"
            >
              <dt className="font-mono text-sm font-semibold tracking-tight text-accent">
                {item.label}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-ink-muted">
                {item.description}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* CTA band */}
      <section className="border-y border-edge bg-surface">
        <div className="mx-auto w-full max-w-band px-gutter py-14 lg:px-gutter-lg lg:py-20">
          <h2 className="text-2xl font-semibold tracking-tight lg:text-3xl">
            Ready to analyse?
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Four topics, each answering one question about Kenya&apos;s
            rangelands. No account required to start.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            {TOPICS.slice(0, 2).map((topic) => (
              <Link
                key={topic.slug}
                href={`/topics/${topic.slug}`}
                className="rounded-lg bg-action px-6 py-3 text-sm font-semibold text-white shadow-card transition-colors hover:bg-action-hover"
              >
                Start with {topic.name.toLowerCase()}{" "}
                <span aria-hidden="true">&rarr;</span>
              </Link>
            ))}
            <Link
              href="/"
              className="rounded-lg border border-edge-strong bg-surface px-6 py-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              See all topics
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
