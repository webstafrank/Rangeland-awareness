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
import RequestSoFar from "@/components/topic/RequestSoFar";
import StepShell from "@/components/topic/StepShell";
import { Notice } from "@/components/ui/Notice";
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
    <StepShell
      topic={topic}
      step="model"
      wizard={wizard}
      aside={<RequestSoFar topic={topic} wizard={wizard} />}
    >
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
        // Stacked, full width of the column: each trade-off is a sentence,
        // and three columns beside the rail squeezed it to a narrow ribbon.
        layout="stack"
      />

      {/* The cards' width exactly, so the note reads as part of the choice
          rather than a second, narrower block. */}
      <Notice intent="info" title="Note." className="mt-4">
        No model is trained yet. Flood risk runs a weighted overlay on the
        analysis service; the other three topics validate your request and
        show the exact payload the service will receive, so the whole flow can
        be used and reviewed today.
      </Notice>
    </StepShell>
  );
}
