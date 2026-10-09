/**
 * What a run needs to be reproduced, and the files that carry it away.
 *
 * Every export carries the run id, the configuration and the method note, so a
 * file detached from this page still says what produced it.
 */

import { Panel } from "@/components/ui/Panel";
import type { Topic } from "@/services/analysis/topics";
import type { RunResult } from "@/services/backend-api";

import Downloads, { type DownloadFile } from "./Downloads";
import { METHOD_NOTE } from "./exports";
import { Fact, More, SectionHead } from "./result-parts";
import { formatCount, formatDate, formatTimestamp } from "./view-model";

export function ProvenanceSection({
  topic,
  result,
  totalPixels,
  files,
}: {
  topic: Topic;
  result: RunResult;
  totalPixels: number;
  files: readonly DownloadFile[];
}) {
  const { config } = result;

  return (
    <section aria-labelledby="provenance-heading">
      <SectionHead id="provenance-heading" title="Reproduce and export" />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Panel title="Run provenance">
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Fact term="Run id">
              <span className="font-mono">{result.runId}</span>
            </Fact>
            <Fact term="Generated at">{formatTimestamp(result.generatedAt)}</Fact>
            <Fact term="Topic">
              {topic.name} <span className="font-mono text-ink-faint">({config.topic})</span>
            </Fact>
            <Fact term="Indicator">
              {result.indicator.label}{" "}
              <span className="font-mono text-ink-faint">({result.indicator.id})</span>
            </Fact>
            <Fact term="Grid">
              {result.grid
                ? `${result.grid.crs}, ${formatCount(result.grid.resolution)} m, ${formatCount(result.grid.width)} × ${formatCount(result.grid.height)} px`
                : `${config.targetCrs}, ${formatCount(config.resolution)} m, size not reported`}
            </Fact>
            <Fact term="Valid pixels">
              {typeof result.validPixels === "number"
                ? `${formatCount(result.validPixels)} of ${formatCount(totalPixels)} classified`
                : "not reported"}
            </Fact>
            <Fact term="Date window">
              {config.dateWindow
                ? `${formatDate(config.dateWindow.start)} to ${formatDate(config.dateWindow.end)}`
                : "none set, so the layers were read at their published dates"}
            </Fact>
            <Fact term="Published layers">
              {result.layers.length > 0
                ? result.layers.join(", ")
                : config.publishLayers
                  ? "requested, none reported back"
                  : "none, the run did not publish to GeoServer"}
            </Fact>
          </dl>
        </Panel>

        {/*
          Secondary, never primary. The screen gets exactly one primary control
          and it is "Run this configuration again"; brand-blue download buttons
          would make the primary stop meaning "this way".
        */}
        <Panel title="Download" pad="none" className="overflow-hidden">
          <Downloads files={files} />
          <div className="border-t border-edge px-4 py-3 lg:px-5">
            <p className="type-caption1 text-ink-faint">
              Every file carries the run id, the configuration and the method note.
            </p>
            <More summary="The note each file carries">{METHOD_NOTE}</More>
          </div>
        </Panel>
      </div>
    </section>
  );
}
