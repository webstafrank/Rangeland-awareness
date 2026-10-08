"use client";

/**
 * The live service indicator in the top bar.
 *
 * Polls the app's own `/api/health` (which probes the Django service and,
 * through it, GeoServer) on mount, every minute while the tab is visible, and
 * again the moment a hidden tab comes back. A run cannot start while the
 * service is down, so saying so before someone builds a request is the point.
 *
 * Deliberately not a live region: the state changes rarely and on its own
 * clock, and announcing it mid-task would interrupt whatever the reader is
 * doing. The label is plain text, and the detail is the tooltip.
 */

import { useEffect, useState } from "react";
import { CHECKING, UNREACHABLE, readHealth, type ServiceReading } from "./service-status";

const POLL_MS = 60_000;

const DOT: Record<ServiceReading["state"], string> = {
  checking: "bg-edge-strong",
  online: "bg-success",
  degraded: "bg-warn",
  offline: "bg-danger",
};

const INK: Record<ServiceReading["state"], string> = {
  checking: "text-ink-faint",
  online: "text-ink-muted",
  degraded: "text-warn",
  offline: "text-danger",
};

export function ServiceStatus({ className = "" }: { className?: string }) {
  const [reading, setReading] = useState<ServiceReading>(CHECKING);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    const probe = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (!cancelled) setReading(readHealth(body));
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        if (!cancelled) setReading(UNREACHABLE);
      }
    };

    void probe();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void probe();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void probe();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <span
      data-testid="service-status"
      data-state={reading.state}
      title={reading.detail}
      className={`type-caption1 inline-flex h-7 items-center gap-2 rounded-full border border-edge bg-surface px-2.5 font-semibold ${INK[reading.state]} ${className}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[reading.state]}`} />
      {reading.label}
      <span className="sr-only">. {reading.detail}</span>
    </span>
  );
}
