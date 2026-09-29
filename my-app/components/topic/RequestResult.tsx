"use client";

/**
 * What running an analysis produced.
 *
 * There is no model backend in this repo yet, so this shows the exact
 * validated AnalysisRequest the service will receive. That is the honest thing
 * to render: a fake progress bar or a mock result would be a lie with a
 * spinner on it.
 *
 * When nothing has been run it renders a short explanation of what will appear
 * here rather than nothing, so the section is never a mystery gap.
 */

import { useState } from "react";
import type { AnalysisRequest } from "@/services/analysis/request";
import { formatArea } from "@/services/geo/area";
import { Checkmark16Regular, Copy16Regular } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";

export interface RequestResultProps {
  request: AnalysisRequest | null;
}

export default function RequestResult({ request }: RequestResultProps) {
  const [copied, setCopied] = useState(false);

  if (request === null) {
    return (
      <div className="rounded-fluent-xlarge border border-dashed border-edge-strong bg-surface px-6 py-8 text-center">
        <p className="type-body1 font-semibold text-ink-muted">
          No analysis run yet
        </p>
        <p className="type-caption1 mx-auto mt-1 max-w-md text-ink-faint">
          Once the request is complete, running it will show the validated
          payload here, exactly as the model service will receive it.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-edge px-4 py-3 lg:px-5">
        <div>
          <h2 className="type-subtitle2 text-ink">Analysis request</h2>
          <p className="type-caption1 mt-0.5 text-ink-faint">
            Validated and ready to send. Schema{" "}
            <span className="font-mono">{request.schemaVersion}</span>.
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          icon={copied ? <Checkmark16Regular /> : <Copy16Regular />}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(JSON.stringify(request, null, 2))
              .then(
                () => setCopied(true),
                () => setCopied(false),
              );
          }}
        >
          {copied ? "Copied" : "Copy JSON"}
        </Button>
      </div>

      {/* A readable summary first. The JSON is the contract, but nobody reads
          a payload to find out which areas they picked. Identifiers in
          dataMono, as the design system sets every id and code. */}
      <dl className="grid gap-x-8 gap-y-3 border-b border-edge px-4 py-3 sm:grid-cols-3 lg:px-5">
        <div>
          <dt className="type-caption1 text-ink-faint">Topic</dt>
          <dd className="type-body1 mt-0.5 font-mono text-ink">{request.topic}</dd>
        </div>
        <div>
          <dt className="type-caption1 text-ink-faint">Analysis type</dt>
          <dd className="type-body1 mt-0.5 font-mono text-ink">{request.analysisType}</dd>
        </div>
        <div>
          <dt className="type-caption1 text-ink-faint">Model</dt>
          <dd className="type-body1 mt-0.5 font-mono text-ink">{request.model}</dd>
        </div>
      </dl>

      <div className="border-b border-edge px-4 py-3 lg:px-5">
        <p className="type-caption1 text-ink-faint">
          Areas ({request.areas.length})
        </p>
        <ol className="mt-1 divide-y divide-edge">
          {request.areas.map((area, index) => (
            <li
              key={area.id}
              className="type-body1 flex flex-wrap items-baseline gap-x-3 py-2"
            >
              <span className="type-caption1 font-mono text-ink-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-semibold text-ink">{area.label}</span>
              <span className="type-caption1 text-ink-faint">
                {area.source} &middot; {formatArea(area.areaKm2)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <pre
        data-testid="analysis-request"
        className="type-caption1 max-h-80 overflow-auto bg-surface-subtle px-4 py-3 font-mono text-ink-muted lg:px-5"
      >
        {JSON.stringify(request, null, 2)}
      </pre>
    </div>
  );
}
