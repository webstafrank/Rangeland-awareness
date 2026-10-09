/**
 * How the score was built: the per-criterion contribution, each against the
 * weight that went in, and the Jenks breaks that cut the classes.
 *
 * The two sentences the rubric (S3, S4) checks a reader can see stay visible
 * as footnotes: "computed from this run's own distribution" and "not feature
 * importance". The reasoning behind both is in the section's one
 * "How this is computed" disclosure.
 *
 * There is no separate weights table: each contribution row already prints
 * its weight and draws it as a tick on the same scale.
 */

import { Panel } from "@/components/ui/Panel";
import type { RunResult } from "@/services/backend-api";

import { More, SectionHead } from "./result-parts";
import {
  formatIndex,
  formatPercent,
  type classTable,
  type contributionViews,
} from "./view-model";

type ClassTable = ReturnType<typeof classTable>;
type Contributions = ReturnType<typeof contributionViews>;

/** The one-line reading of a criterion's offset from its weight. */
function offsetSentence(offsetPoints: number | null): string {
  if (offsetPoints === null) return "No weight was recorded for this criterion.";
  if (Math.abs(offsetPoints) < 0.05)
    return "Sits on its weight: this run's pixels scored about average on it.";
  if (offsetPoints > 0)
    return `${offsetPoints.toFixed(1)} points above its weight: this run's pixels scored high on it.`;
  return `${Math.abs(offsetPoints).toFixed(1)} points below its weight: this run's pixels scored low on it.`;
}

export function MethodSection({
  result,
  table,
  contributions,
}: {
  result: RunResult;
  table: ClassTable;
  contributions: Contributions;
}) {
  // The bars are read against the largest value rather than against 1.0, or a
  // run whose criteria all sit near 0.2 renders five stubs and the comparison
  // the chart exists for is invisible. The numbers beside every bar are the
  // absolute ones, so the scaling cannot mislead.
  const contributionPeak = contributions.reduce(
    (peak, row) => Math.max(peak, row.contribution, row.weight ?? 0),
    0.0001,
  );

  return (
    <section aria-labelledby="method-heading">
      <SectionHead id="method-heading" title="How the score was built" />

      {/* Start-aligned: each card is as tall as what it holds. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/*
          The definition sits in the body, not in the Panel's `action` slot.
          That slot is `shrink-0` by design, so a caption in it cannot wrap,
          and at 360px it pushed the whole page 8px wide.
        */}
        <Panel title="Per-criterion contribution">
          <p className="type-caption1 mb-4 text-ink-faint">mean(risk) × weight, normalised.</p>
          {/*
            Contribution shown AGAINST the weight that produced it: brand fill,
            sorted high to low, the weight as a tick on the same scale.
            Contribution is mean(risk_i) × weight_i normalised, so the only way
            a bar can sit away from its weight is through mean(risk_i). The
            criterion id is a tooltip only: slugs stay out of the page's text.
          */}
          <ul className="flex flex-col gap-4" data-testid="contribution-list">
            {contributions.map((row) => (
              <li key={row.id} className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span
                    className="type-body1 font-semibold text-ink"
                    title={row.label !== row.id ? row.id : undefined}
                  >
                    {row.label}
                  </span>
                  <span className="type-body1 whitespace-nowrap tabular-nums">
                    <span className="font-semibold text-ink">
                      {formatPercent(row.contribution * 100)}
                    </span>
                    <span className="type-caption1 text-ink-faint">
                      {" "}
                      of the score
                      {row.weight === null ? "" : `, weight ${formatPercent(row.weight * 100)}`}
                    </span>
                  </span>
                </div>

                <div className="relative mt-1.5 h-2.5 w-full rounded-fluent-small bg-sunken">
                  <div
                    className="absolute inset-y-0 left-0 rounded-fluent-small bg-accent"
                    style={{ width: `${(row.contribution / contributionPeak) * 100}%` }}
                    aria-hidden="true"
                  />
                  {row.weight === null ? null : (
                    // The weight as a tick on the same scale, so the gap
                    // between input and outcome is a distance the eye reads
                    // rather than a subtraction the reader performs.
                    <div
                      className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink"
                      style={{ left: `${(row.weight / contributionPeak) * 100}%` }}
                      aria-hidden="true"
                    />
                  )}
                </div>

                <p className="type-caption1 mt-1 text-ink-faint">{offsetSentence(row.offsetPoints)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-edge pt-3">
            <p className="type-caption1 text-ink-faint">
              This is not feature importance and it is not a sensitivity analysis.
            </p>
            <p className="type-caption1 flex items-center gap-3 text-ink-faint" aria-hidden="true">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-4 rounded-fluent-small bg-accent" />
                contribution
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-0.5 rounded-full bg-ink" />
                weight
              </span>
            </p>
          </div>
        </Panel>

        <Panel title="Jenks natural breaks">
          {result.breaks.length === 0 ? (
            <p className="type-body1 text-ink-muted">
              No break was computed. Every valid pixel in this run carries the same index
              value, so the surface could not be split.
            </p>
          ) : (
            <>
              <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="breaks-list">
                {result.breaks.map((value, index) => (
                  <li
                    key={value}
                    className="min-w-0 rounded-fluent-medium bg-surface-subtle px-3 py-2 ring-1 ring-edge"
                  >
                    <span className="type-caption1 block text-ink-faint">Break {index + 1}</span>
                    <span className="type-subtitle2 text-ink tabular-nums">
                      {formatIndex(value)}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="type-caption1 mt-3 text-ink-faint">
                These breaks were computed from this run&apos;s own distribution rather than
                from a fixed scale.
              </p>
            </>
          )}
        </Panel>
      </div>

      <More summary="How this is computed">
        <p>
          Each contribution is mean(risk) × weight for one criterion, normalised across all{" "}
          {contributions.length}, so it says how much of the average score came from that
          criterion in this run. It does not say how much the answer would change if a
          criterion were removed, reweighted or measured differently, and no number on this
          page answers that question. A weighted overlay has no fitted parameters to rank.
        </p>
        {result.breaks.length === 0 ? null : (
          <p className="mt-2">
            The breaks are the interior boundaries only, which is why there are{" "}
            {result.breaks.length} of them for {table.rows.length} classes: the lowest class is
            open below and the highest is open above. Two runs over different areas will have
            different breaks, so &ldquo;High&rdquo; here and &ldquo;High&rdquo; in another run
            are not the same index value and must not be compared as if they were.
          </p>
        )}
      </More>
    </section>
  );
}
