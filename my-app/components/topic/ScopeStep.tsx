"use client";

/**
 * Step 1: how many areas this run is about.
 *
 * First because it is the only decision that changes what the later steps
 * permit — the analysis type carries the area cap, so choosing it last is what
 * produced the "switching to single removed 4 of your areas" notice on the old
 * single page. It can still happen (an analyst can walk back to this step), so
 * the notice and its undo are still here, directly under the control that
 * causes them.
 */

import RadioCards from "@/components/topic/RadioCards";
import SelectionNotice from "@/components/topic/SelectionNotice";
import StepShell from "@/components/topic/StepShell";
import { useWizard } from "@/components/topic/useWizard";
import { ANALYSIS_TYPES, type AnalysisTypeId } from "@/lib/analysis/models";
import { switchWouldDrop, undoRestoreCount } from "@/lib/analysis/selection";
import type { Topic } from "@/lib/analysis/topics";
import type { UrlSelection } from "@/lib/analysis/url-state";

export interface ScopeStepProps {
  topic: Topic;
  initial: UrlSelection;
}

export default function ScopeStep({ topic, initial }: ScopeStepProps) {
  const wizard = useWizard(topic.slug, initial);
  const { state, dispatch } = wizard;

  const options = ANALYSIS_TYPES.map((type) => {
    const dropped = switchWouldDrop(state, type.id);
    return {
      id: type.id,
      label: type.label,
      description: type.description,
      // Warn before the click, not only after. RadioCards wires this to
      // aria-describedby too, so it is heard as well as seen.
      note:
        dropped > 0
          ? `Switching to ${type.label.toLowerCase()} removes ${dropped} of ` +
            `your ${state.areas.length} selected areas.`
          : undefined,
    };
  });

  return (
    <StepShell topic={topic} step="scope" wizard={wizard}>
      <RadioCards
        legend="Analysis type"
        hideLegend
        name="analysis-type"
        value={state.analysisType}
        options={options}
        onChange={(analysisType: AnalysisTypeId) =>
          dispatch({ type: "setAnalysisType", analysisType })
        }
        // Side by side: two cards with room, and the choice reads as a fork
        // rather than as a list where the first option is the default.
        layout="row"
      />

      {state.notice !== null && (
        <div className="mt-5 max-w-2xl">
          <SelectionNotice
            message={state.notice}
            restoreCount={undoRestoreCount(state)}
            onUndo={() => dispatch({ type: "undoTypeSwitch" })}
            onDismiss={() => dispatch({ type: "dismissNotice" })}
          />
        </div>
      )}

      {/* What this topic actually returns. It belongs on the first step: it is
          the last chance to notice you opened the wrong topic before spending
          four screens on it. */}
      <dl className="mt-10 grid gap-5 border-t border-edge pt-8 sm:grid-cols-2">
        <div>
          <dt className="eyebrow">What comes back</dt>
          <dd className="mt-2 text-sm leading-relaxed text-ink-muted">
            {topic.output}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Model inputs</dt>
          <dd className="mt-2 flex flex-wrap gap-1.5">
            {topic.inputs.map((input) => (
              <span
                key={input}
                className="rounded-md border border-edge bg-sunken px-2 py-1 text-xs font-medium text-ink-muted"
              >
                {input}
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </StepShell>
  );
}
