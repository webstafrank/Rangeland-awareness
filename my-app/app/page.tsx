import Link from "next/link";
import { catalog } from "@/services/catalog";
import { geo } from "@/services/geo";
import { getSession } from "@/services/auth";
import { continueAsGuestAction } from "@/services/auth/actions";
import { Band } from "@/components/ui/Band";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Graticule } from "@/components/ui/Graticule";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";

export default async function HomePage() {
  const session = await getSession();
  const topics = catalog.listTopics();
  const areaCount = geo.listAreas().length;

  return (
    <>
      <SiteHeader session={session} />

      <main id="main" className="flex flex-1 flex-col">
        {/* ---------------------------------------------------------- hero */}
        <section className="band-navy relative overflow-hidden" data-band="navy">
          <Graticule />

          <div className="relative mx-auto w-full max-w-5xl px-5 py-20 sm:px-8 sm:py-28">
            <Eyebrow tone="dark">
              Kenya · {areaCount} counties · Earth observation
            </Eyebrow>

            <h1 className="mt-6 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-display">
              Flood, drought and rangeland analysis for every county in Kenya.
            </h1>

            <p className="text-ink-dark-secondary mt-6 max-w-2xl text-lg leading-relaxed">
              Choose what to study, where, and over which months. You get a map with overlays, a
              summary in plain language, and a time series you can compare county by county.
            </p>

            {/*
              The three entry paths from the user story, in the order a
              first-time visitor should read them. One scarlet action only:
              the accent stops meaning "most important" the moment there are two.
            */}
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href="/analysis" variant="scarlet" size="lg" tone="dark">
                View analysis
              </ButtonLink>
              <ButtonLink href="/signup" variant="solid" size="lg" tone="dark">
                Create an account
              </ButtonLink>
              <form action={continueAsGuestAction} className="sm:ml-1">
                <Button type="submit" variant="ghost" size="lg" tone="dark">
                  Continue as guest
                </Button>
              </form>
            </div>

            <p className="text-caption text-ink-dark-muted mt-5 max-w-xl">
              A guest session gives you every topic, every county and every model. An account only
              adds saved runs.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- topics */}
        <Band ground="white" width="wide" pad="normal">
          <div className="flex flex-col gap-3">
            <Eyebrow>Topics of study</Eyebrow>
            <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
              Four questions, each with its own indicator and its own model.
            </h2>
          </div>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {topics.map((topic) => (
              <li key={topic.id}>
                <Link
                  href={`/analysis/${topic.id}`}
                  className="border-edge hover:border-navy-900/35 group flex h-full flex-col gap-3 rounded border p-5 transition-colors duration-150"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-navy-900 text-lg font-bold tracking-tight">{topic.label}</h3>
                    <span
                      className="text-ink-light-muted group-hover:text-scarlet-ink-light text-sm transition-colors"
                      aria-hidden="true"
                    >
                      &rarr;
                    </span>
                  </div>
                  <p className="text-ink-light-secondary text-sm leading-relaxed">{topic.blurb}</p>
                  <p className="text-micro text-ink-light-muted mt-auto tracking-[0.08em] uppercase">
                    Reports {topic.indicator.label}
                    {topic.indicator.unit ? ` (${topic.indicator.unit})` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Band>

        {/* ---------------------------------------------------- how it works */}
        <Band ground="paper" width="wide" pad="normal">
          <div className="flex flex-col gap-3">
            <Eyebrow>How a run works</Eyebrow>
            <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
              Four decisions, then the model runs.
            </h2>
          </div>

          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "01",
                title: "Pick a topic",
                body: "Flood risk, drought, food security or rangeland dynamics. Each one reports a different indicator.",
              },
              {
                n: "02",
                title: "Pick the areas",
                body: "One county on its own, or up to four side by side when you want a comparison.",
              },
              {
                n: "03",
                title: "Set the window",
                body: "Any range from one month upward. A longer window narrows the confidence interval.",
              },
              {
                n: "04",
                title: "Choose a model",
                body: "Random Forest is steadier on short records. XGBoost picks up sharper thresholds.",
              },
            ].map((step) => (
              <li key={step.n} className="flex flex-col gap-2.5">
                <span className="text-scarlet-ink-light text-caption tabular font-bold tracking-[0.1em]">
                  {step.n}
                </span>
                <h3 className="text-navy-900 text-base font-bold">{step.title}</h3>
                <p className="text-ink-light-secondary text-sm leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="border-edge mt-12 flex flex-col gap-4 border-t pt-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ink-light-secondary max-w-md text-sm">
              Every run is reproducible: the configuration travels in the URL, so the same link
              always renders the same result.
            </p>
            <ButtonLink href="/analysis" variant="solid" size="md" tone="light">
              Start an analysis
            </ButtonLink>
          </div>
        </Band>
      </main>

      <SiteFooter />
    </>
  );
}
