"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { Area } from "@/contracts/geo";
import type { AnalysisType, RunConfig } from "@/contracts/analysis";
import {
  MAX_COMPARISON_AREAS,
  MIN_RANGE_DAYS,
  RunConfigSchema,
  buildRunQuery,
  rangeDays,
} from "@/contracts/analysis";
import type { ModelId, TopicId } from "@/contracts/catalog";
import { AreaPicker } from "@/components/ui/AreaPicker";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextInput } from "@/components/ui/TextInput";

/** Only what the picker needs. The SVG paths stay on the server. */
export type PickerArea = Pick<Area, "id" | "name" | "climateZone" | "asal">;

export interface ModelOption {
  id: ModelId;
  label: string;
  blurb: string;
  strength: string;
}

interface PreAnalysisFormProps {
  topicId: TopicId;
  topicLabel: string;
  indicatorLabel: string;
  indicatorUnit: string;
  areas: readonly PickerArea[];
  models: readonly ModelOption[];
  dataStart: string;
  /** Today in ISO, resolved on the server so the default is stable per render. */
  today: string;
  defaultStart: string;
}

/**
 * The pre-analysis configuration.
 *
 * Validation runs against the SAME zod schema the API route and the results
 * page use (`RunConfigSchema` from the contract), not a hand-written client
 * copy, so the form cannot accept something the server will reject. Rubric R5
 * requires Run to be blocked with a visible reason until the config is valid,
 * which is why the reasons render as a list rather than only as field errors:
 * a disabled button with no stated cause is the thing being avoided.
 */
export function PreAnalysisForm({
  topicId,
  topicLabel,
  indicatorLabel,
  indicatorUnit,
  areas,
  models,
  dataStart,
  today,
  defaultStart,
}: PreAnalysisFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [analysisType, setAnalysisType] = useState<AnalysisType>("single");
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(today);
  const [model, setModel] = useState<ModelId>(models[0]?.id ?? "random-forest");

  const candidate = useMemo(
    () => ({
      topic: topicId,
      analysisType,
      areas: [...selected],
      dateRange: { start, end },
      model,
    }),
    [topicId, analysisType, selected, start, end, model],
  );

  const parsed = useMemo(() => RunConfigSchema.safeParse(candidate), [candidate]);

  /**
   * Blocking reasons, in the order the user should fix them. These are derived
   * from the schema's own issues plus the two soft checks the schema cannot
   * express (coverage start is data availability, not a validation rule).
   */
  const blockers = useMemo(() => {
    const reasons: string[] = [];

    if (analysisType === "single" && selected.length !== 1) {
      reasons.push(
        selected.length === 0
          ? "Choose one county to analyse."
          : "Single-location analysis takes one county. Remove the extras or switch to comparison.",
      );
    }
    if (analysisType === "comparison" && selected.length < 2) {
      reasons.push(`Choose at least two counties to compare (up to ${MAX_COMPARISON_AREAS}).`);
    }

    const days = rangeDays({ start, end });
    if (!Number.isFinite(days)) {
      reasons.push("Enter both a start and an end date.");
    } else if (days <= 0) {
      reasons.push("The start date must be on or before the end date.");
    } else if (days < MIN_RANGE_DAYS) {
      reasons.push(`The window must cover at least ${MIN_RANGE_DAYS} days. It currently covers ${days}.`);
    }

    if (start < dataStart) {
      reasons.push(`Input coverage for ${topicLabel} starts on ${dataStart}.`);
    }
    if (end > today) {
      reasons.push("The end date cannot be in the future.");
    }

    return reasons;
  }, [analysisType, selected.length, start, end, dataStart, today, topicLabel]);

  const ready = parsed.success && blockers.length === 0;
  const days = rangeDays({ start, end });

  function run() {
    if (!ready || !parsed.success) return;
    const config: RunConfig = parsed.data;
    startTransition(() => {
      router.push(`/analysis/${topicId}/running?${buildRunQuery(config)}`);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
      {/* ------------------------------------------------ the four decisions */}
      <form
        className="flex flex-col gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <Field
          label="Analysis type"
          htmlFor="analysis-type-single"
          step={1}
          hint="A comparison puts up to four counties on the same axes."
        >
          <SegmentedControl
            name="analysis-type"
            legend="Analysis type"
            hideLegend
            value={analysisType}
            onChange={(next) => {
              setAnalysisType(next);
              // Switching to single mode keeps the FIRST pick rather than
              // clearing everything: the user's earlier choice is still their
              // most likely intent, and silently emptying the list is worse.
              if (next === "single" && selected.length > 1) setSelected(selected.slice(0, 1));
            }}
            segments={[
              { value: "single", label: "One location", hint: "A single county in depth" },
              {
                value: "comparison",
                label: "Comparison",
                hint: `Two to ${MAX_COMPARISON_AREAS} counties, side by side`,
              },
            ]}
          />
        </Field>

        <Field
          label={analysisType === "single" ? "Area of interest" : "Areas of interest"}
          htmlFor="area-search"
          step={2}
          hint={
            analysisType === "single"
              ? "Pick one of Kenya's 47 counties."
              : `Pick between two and ${MAX_COMPARISON_AREAS} counties. The number beside each one is its colour order on the charts.`
          }
        >
          <AreaPicker
            areas={areas as readonly Area[]}
            selected={selected}
            onChange={setSelected}
            max={analysisType === "single" ? 1 : MAX_COMPARISON_AREAS}
            single={analysisType === "single"}
          />
        </Field>

        <Field
          label="Date range"
          htmlFor="date-start"
          step={3}
          hint={
            Number.isFinite(days) && days > 0
              ? `${days} days selected. A longer window narrows the confidence interval.`
              : `Input coverage begins ${dataStart}.`
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="date-start" className="text-caption text-ink-light-secondary font-medium">
                From
              </label>
              <TextInput
                id="date-start"
                type="date"
                value={start}
                min={dataStart}
                max={today}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="date-end" className="text-caption text-ink-light-secondary font-medium">
                To
              </label>
              <TextInput
                id="date-end"
                type="date"
                value={end}
                min={dataStart}
                max={today}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>
        </Field>

        <Field label="Model" htmlFor="model-random-forest" step={4}>
          <SegmentedControl
            name="model"
            legend="Model"
            hideLegend
            value={model}
            onChange={setModel}
            segments={models.map((m) => ({ value: m.id, label: m.label, hint: m.strength }))}
          />
          <p className="text-caption text-ink-light-muted mt-1">
            {models.find((m) => m.id === model)?.blurb}
          </p>
        </Field>
      </form>

      {/* -------------------------------------------------- the run summary */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Panel tone="light" title="Run summary" pad="normal">
          <dl className="flex flex-col gap-3.5">
            {[
              ["Topic", topicLabel],
              ["Indicator", indicatorUnit ? `${indicatorLabel} (${indicatorUnit})` : indicatorLabel],
              ["Type", analysisType === "single" ? "One location" : "Comparison"],
              [
                "Areas",
                selected.length === 0
                  ? "None selected"
                  : selected
                      .map((id) => areas.find((a) => a.id === id)?.name ?? id)
                      .join(", "),
              ],
              ["Window", Number.isFinite(days) && days > 0 ? `${start} to ${end}` : "Incomplete"],
              ["Model", models.find((m) => m.id === model)?.label ?? model],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-micro text-ink-light-muted font-semibold tracking-[0.14em] uppercase">
                  {label}
                </dt>
                <dd className="text-ink-light-primary text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="border-edge mt-6 border-t pt-5">
            {blockers.length > 0 ? (
              <div id="run-blockers" className="mb-4" aria-live="polite">
                <p className="text-caption text-ink-light-secondary mb-2 font-semibold">
                  Before you can run:
                </p>
                <ul className="flex flex-col gap-1.5">
                  {blockers.map((reason) => (
                    <li key={reason} className="text-caption text-ink-light-secondary flex gap-2">
                      <span className="text-scarlet-ink-light mt-px shrink-0" aria-hidden="true">
                        &bull;
                      </span>
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-caption text-ink-light-secondary mb-4" aria-live="polite">
                Configuration is complete.
              </p>
            )}

            <Button
              type="button"
              variant="scarlet"
              size="lg"
              tone="light"
              block
              onClick={run}
              disabled={!ready || pending}
              /* The reason list above is the accessible explanation for the
                 disabled state, so it is referenced rather than repeated. */
              aria-describedby={blockers.length > 0 ? "run-blockers" : undefined}
            >
              {pending ? "Starting run…" : "Run analysis"}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
