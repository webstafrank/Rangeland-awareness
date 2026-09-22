"use client";

/**
 * Step 2: which model runs.
 *
 * Its own screen because the choice is made on a trade-off, and a trade-off
 * needs the sentence explaining it to be readable. Squeezed into a rail beside
 * a map, the three descriptions were the first thing an analyst skipped, which
 * turned a real decision into "leave it on the default".
 */

import RadioCards from "@/components/topic/RadioCards";
import StepShell from "@/components/topic/StepShell";
import { useWizard } from "@/components/topic/useWizard";
import { MODELS, type ModelId } from "@/services/analysis/models";
import type { Topic } from "@/services/analysis/topics";
import type { UrlSelection } from "@/services/analysis/url-state";

export interface ModelStepProps {
  topic: Topic;
  initial: UrlSelection;
}

export default function ModelStep({ topic, initial }: ModelStepProps) {
  const wizard = useWizard(topic.slug, initial);
  const { state, dispatch } = wizard;

  return (
    <StepShell topic={topic} step="model" wizard={wizard}>
      <RadioCards
        legend="Model"
        hideLegend
        name="model"
        value={state.modelId}
        options={MODELS.map((model) => ({
          id: model.id,
          label: model.label,
          description: model.tradeoff,
        }))}
        onChange={(modelId: ModelId) => dispatch({ type: "setModel", modelId })}
        layout="row"
      />

      <p className="mt-8 max-w-2xl rounded-xl border border-edge bg-sunken px-5 py-4 text-sm leading-relaxed text-ink-muted">
        <span className="font-semibold text-ink">Note.</span> The model backend
        is not connected yet. Running an analysis validates your request and
        shows the exact payload the service will receive, so the whole flow can
        be used and reviewed today.
      </p>
    </StepShell>
  );
}
