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

export interface RequestResultProps {
  request: AnalysisRequest | null;
}

export default function RequestResult({ request }: RequestResultProps) {
  const [copied, setCopied] = useState(false);

  if (request === null) {
    return (
      <div className="rounded-xl border border-dashed border-edge-strong bg-surface px-6 py-8 text-center">
        <p className="text-sm font-medium text-ink-muted">
          No analysis run yet
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-faint">
          Once the request is complete, running it will show the validated
          payload here, exactly as the model service will receive it.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-edge px-5 py-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Analysis request
          </h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            Validated and ready to send. Schema {request.schemaVersion}.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(JSON.stringify(request, null, 2))
              .then(
                () => setCopied(true),
                () => setCopied(false),
              );
          }}
          className="rounded-lg border border-edge-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-sunken hover:text-ink"
        >
          {copied ? "Copied" : "Copy JSON"}
        </button>
      </div>

      {/* A readable summary first. The JSON is the contract, but nobody reads
          a payload to find out which areas they picked. */}
      <dl className="grid gap-x-8 gap-y-4 border-b border-edge px-5 py-4 sm:grid-cols-3">
        <div>
          <dt className="eyebrow">
            Topic
          </dt>
          <dd className="mt-1 font-mono text-sm">{request.topic}</dd>
        </div>
        <div>
          <dt className="eyebrow">
            Analysis type
          </dt>
          <dd className="mt-1 font-mono text-sm">{request.analysisType}</dd>
        </div>
        <div>
          <dt className="eyebrow">
            Model
          </dt>
          <dd className="mt-1 font-mono text-sm">{request.model}</dd>
        </div>
      </dl>

      <div className="border-b border-edge px-5 py-4">
        <p className="eyebrow">
          Areas ({request.areas.length})
        </p>
        <ol className="mt-2.5 divide-y divide-edge">
          {request.areas.map((area, index) => (
            <li
              key={area.id}
              className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm"
            >
              <span className="font-mono text-xs text-ink-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-medium">{area.label}</span>
              <span className="text-xs text-ink-faint">
                {area.source} &middot; {formatArea(area.areaKm2)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <pre
        data-testid="analysis-request"
        className="max-h-80 overflow-auto bg-sunken px-5 py-4 font-mono text-[11px] leading-relaxed text-ink-muted"
      >
        {JSON.stringify(request, null, 2)}
      </pre>
    </div>
  );
}
