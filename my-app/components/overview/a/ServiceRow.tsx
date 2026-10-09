"use client";

import { useServiceReading } from "@/components/shell/ServiceStatus";
import type { ServiceReading } from "@/components/shell/service-status";
import { StatusBadge, type StatusTone } from "./StatusBadge";

/**
 * The analysis service's state, as a row of the Overview's status card.
 *
 * The same reading as the top bar's pill: useServiceReading polls the app's
 * own /api/health (the Django service and, through it, GeoServer). It is a
 * second subscriber, so the homepage makes one extra small request a minute;
 * the top bar's reading is local to the shell and not shared.
 *
 * Not the shell's ServiceStatus component: that one carries
 * data-testid="service-status", which the shell evals expect once per page.
 */

const TONE: Record<ServiceReading["state"], StatusTone> = {
  checking: "idle",
  online: "good",
  degraded: "warn",
  offline: "bad",
};

const WORD: Record<ServiceReading["state"], string> = {
  checking: "Checking",
  online: "Online",
  degraded: "Degraded",
  offline: "Offline",
};

export function ServiceRow() {
  const reading = useServiceReading();
  return (
    <div className="py-3 first:pt-0">
      <dt className="flex items-center justify-between gap-3">
        <span className="type-body1 font-semibold text-ink">Analysis service</span>
        <StatusBadge tone={TONE[reading.state]} word={WORD[reading.state]} />
      </dt>
      <dd className="type-caption1 mt-1 text-ink-muted">{reading.detail}</dd>
    </div>
  );
}
