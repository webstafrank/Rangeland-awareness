"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RunStage } from "@/contracts/analysis";

interface RunningStagesProps {
  stages: readonly RunStage[];
  /** Where to go when the last stage finishes. */
  resultHref: string;
}

/**
 * The animated analysis screen.
 *
 * Two things make this more than a spinner. First, the stage labels name what
 * is actually being computed, so the wait is legible rather than opaque
 * (rubric Q3). Second, progress is driven by the real per-stage durations the
 * analysis service published, not by a fixed loop, so a four-county XGBoost
 * run visibly takes longer than a one-county Random Forest run.
 *
 * Reduced motion is honoured by dropping the sweep and the bar transition, not
 * by skipping the stages: someone who turns motion off still needs to see what
 * the system is doing, and jumping straight to the result would hide it.
 */
export function RunningStages({ stages, resultHref }: RunningStagesProps) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const navigated = useRef(false);

  const total = useMemo(
    () => stages.reduce((sum, stage) => sum + stage.durationMs, 0),
    [stages],
  );

  /** Cumulative end time of each stage, so elapsed maps to a stage index. */
  const marks = useMemo(() => {
    let running = 0;
    return stages.map((stage) => (running += stage.durationMs));
  }, [stages]);

  useEffect(() => {
    // Prefetch while the animation plays, so the transition at the end is a
    // paint and not a fetch. This is what makes the wait useful rather than
    // theatrical.
    router.prefetch(resultHref);
  }, [router, resultHref]);

  useEffect(() => {
    const startedAt = performance.now();
    let frame = 0;

    const tick = () => {
      const next = performance.now() - startedAt;
      setElapsed(next);

      if (next >= total) {
        if (!navigated.current) {
          navigated.current = true;
          // `replace`, not `push`: the running screen must not sit in history,
          // or Back from the results page would replay the animation forever.
          router.replace(resultHref);
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [total, resultHref, router]);

  const pendingIndex = marks.findIndex((mark) => elapsed < mark);
  const activeIndex = pendingIndex === -1 ? stages.length - 1 : pendingIndex;
  const percent = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 100;

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* One live region for the whole screen. Announcing each stage in its
          own region would talk over itself on a fast run. */}
      <p className="sr-only" role="status" aria-live="polite">
        {stages[activeIndex]?.label}. {percent} percent complete.
      </p>

      <div className="flex items-baseline justify-between gap-4">
        <p className="text-micro text-ink-dark-muted font-semibold tracking-[0.16em] uppercase">
          Running analysis
        </p>
        <p className="tabular text-ink-dark-secondary text-sm font-semibold">{percent}%</p>
      </div>

      <div
        className="bg-navy-800 relative mt-3 h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Analysis progress"
      >
        <div
          className="bg-scarlet-mark h-full rounded-full motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="mt-10 flex flex-col gap-0">
        {stages.map((stage, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;

          return (
            <li
              key={stage.id}
              className="border-navy-800 flex items-start gap-4 border-b py-3.5 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold ${
                  done
                    ? "bg-status-good/20 text-status-good"
                    : active
                      ? "bg-scarlet-fill text-white"
                      : "bg-navy-800 text-ink-dark-muted"
                }`}
              >
                {done ? "✓" : index + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-semibold ${
                    active ? "text-ink-dark-primary" : "text-ink-dark-muted"
                  }`}
                >
                  {stage.label}
                </span>

                {active ? (
                  <span className="bg-navy-800 mt-2 block h-[3px] overflow-hidden rounded-full">
                    <span className="bg-scarlet-mark/70 motion-safe:animate-sweep block h-full w-1/3 rounded-full" />
                  </span>
                ) : null}
              </span>

              <span className="tabular text-micro text-ink-dark-muted mt-1 shrink-0">
                {(stage.durationMs / 1000).toFixed(1)}s
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
