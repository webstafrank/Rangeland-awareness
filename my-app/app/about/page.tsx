import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight20Regular } from "@/components/ui/icons";
import { TOPICS } from "@/services/analysis/topics";
import { InfoGrid, PageHero, PageSection } from "@/components/shell/Page";
import { buttonClasses } from "@/components/ui/button-classes";
import { StatTile } from "@/components/ui/StatTile";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Disaster Monitor: Earth observation analysis for Kenya's rangelands.",
};

const AUDIENCES = [
  {
    label: "County governments",
    description: "Data-driven decisions for rangeland management and disaster preparedness.",
  },
  {
    label: "National agencies",
    description: "Consistent, reproducible analysis across Kenya's 23 ASAL counties.",
  },
  {
    label: "Research institutions",
    description: "Traceable analysis with inputs documented for academic rigour.",
  },
  {
    label: "Development partners",
    description: "Evidence-based monitoring of rangeland condition and food security.",
  },
  {
    label: "Community organisations",
    description: "Accessible satellite data for local land use planning.",
  },
  {
    label: "Conservation groups",
    description: "Tracking vegetation change and grazing pressure over time.",
  },
] as const;

const SOURCES = [
  {
    label: "Sentinel-2",
    description:
      "Optical satellite imagery at 10 m resolution for vegetation and land cover analysis.",
  },
  {
    label: "MODIS",
    description: "Daily surface reflectance and vegetation indices at 250 m to 1 km resolution.",
  },
  {
    label: "CHIRPS",
    description: "Daily rainfall estimates at 5 km resolution, calibrated against rain gauge data.",
  },
  {
    label: "ERA5",
    description:
      "Climate reanalysis providing temperature, humidity, and evapotranspiration estimates.",
  },
] as const;

/**
 * About: what the platform is for, who it serves, what feeds it, and the way
 * into an analysis. The three figures under the mission are counted from the
 * topic registry and the source list on this page, so they cannot drift from
 * what the page itself names. The eyebrow names the section, not the page:
 * the top bar already says "About".
 */
export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Programme"
        title="Disaster Monitor"
        lead="Earth observation decision support for Kenya's rangelands."
      />

      <PageSection
        eyebrow="Mission"
        title="Turning satellite data into rangeland decisions"
        intro={
          <>
            <p>
              Disaster Monitor connects Kenya&apos;s rangeland managers with analysis built
              on satellite imagery and climate data. The platform makes earth observation
              accessible to the people who manage Kenya&apos;s vast rangelands, from Marsabit
              to the coast.
            </p>
            <p className="mt-3">
              Four analysis topics cover the critical questions: flood risk, drought
              monitoring, rangeland dynamics, and food security. Each topic returns results
              that can be traced back to their inputs.
            </p>
          </>
        }
      >
        <dl className="grid grid-cols-3 gap-2 sm:gap-4">
          <StatTile compact label="Analysis topics" value={String(TOPICS.length)} />
          <StatTile compact label="Counties covered" value="47" />
          <StatTile compact label="Open data sources" value={String(SOURCES.length)} />
        </dl>
      </PageSection>

      <PageSection
        tier="panel"
        eyebrow="Who it's for"
        title="Built for rangeland managers"
        intro="The platform serves county-level rangeland managers, national planning agencies, and research institutions working across Kenya's arid and semi-arid lands: people who decide on land use, livestock movement, and disaster preparedness from current satellite-derived data."
      >
        <InfoGrid items={AUDIENCES} />
      </PageSection>

      <PageSection
        eyebrow="Data sources"
        title="What feeds the analysis"
        intro="The analysis runs on freely available satellite imagery and climate reanalysis data. No proprietary datasets are used, so every result can be independently verified and reproduced."
      >
        <InfoGrid items={SOURCES} columns={2} />
      </PageSection>

      <PageSection
        tier="panel"
        title="Ready to analyse?"
        intro="Four topics, each answering one question about Kenya's rangelands. No account required to start."
      >
        <div className="flex flex-wrap gap-2">
          {TOPICS.slice(0, 2).map((topic, index) => (
            <Link
              key={topic.slug}
              href={`/topics/${topic.slug}`}
              className={buttonClasses({ appearance: index === 0 ? "primary" : "secondary" })}
            >
              Start with {topic.name.toLowerCase()}
              <ArrowRight20Regular aria-hidden="true" />
            </Link>
          ))}
          <Link href="/" className={buttonClasses({ appearance: "subtle" })}>
            See all topics
          </Link>
        </div>
      </PageSection>
    </>
  );
}
