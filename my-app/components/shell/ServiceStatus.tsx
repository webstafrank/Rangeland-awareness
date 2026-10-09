"use client";

/**
 * The live service indicator in the top bar.
 *
 * `useServiceReading` reads one shared poll of the app's own `/api/health`
 * (which probes the Django service and, through it, GeoServer): on the first
 * reader's mount, every minute while the tab is visible, and again the moment
 * a hidden tab comes back. A run cannot start while the service is down, so
 * saying so before someone builds a request is the point. The top bar hands
 * the reading to whichever view its breakpoint shows (the labelled pill on a
 * desktop, the state-shaped glyph on a phone), and the Overview's status card
 * reads the same one.
 *
 * Deliberately not a live region: the state changes rarely and on its own
 * clock, and announcing it mid-task would interrupt whatever the reader is
 * doing. The label is text, and the detail, with how fast the service
 * answered and when it was last checked, is the tooltip.
 */

import { useSyncExternalStore } from "react";
import {
  CheckmarkCircle16Filled,
  Circle16Regular,
  DismissCircle16Regular,
  Warning16Regular,
} from "@/components/ui/icons";
import {
  CHECKING,
  UNREACHABLE,
  readHealth,
  tooltipFor,
  type ServiceReading,
} from "./service-status";

/** The phone indicator's glyph: its shape changes with the state, so colour never carries it alone. */
const GLYPH: Record<ServiceReading["state"], typeof Circle16Regular> = {
  checking: Circle16Regular,
  online: CheckmarkCircle16Filled,
  degraded: Warning16Regular,
  offline: DismissCircle16Regular,
};

const GLYPH_INK: Record<ServiceReading["state"], string> = {
  checking: "text-ink-faint",
  online: "text-success",
  degraded: "text-warn",
  offline: "text-danger",
};

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

/*
 * One reading per tab, however many components ask. Two independent polls
 * meant two requests a minute and two answers that could briefly disagree on
 * one screen. An external store: the first subscriber starts the poll, the
 * last one stops it.
 */
let current: ServiceReading = CHECKING;
const listeners = new Set<() => void>();
let stopPolling: (() => void) | null = null;

function publish(next: ServiceReading) {
  current = { ...next, checkedAt: Date.now() };
  for (const listener of listeners) listener();
}

function startPolling(): () => void {
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
      publish(readHealth(body));
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      publish(UNREACHABLE);
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
    controller?.abort();
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (stopPolling === null) stopPolling = startPolling();
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && stopPolling !== null) {
      stopPolling();
      stopPolling = null;
    }
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => CHECKING;

export function useServiceReading(): ServiceReading {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** The labelled pill, for the desktop top bar. */
export function ServiceStatus({ reading }: { reading: ServiceReading }) {
  return (
    <span
      data-testid="service-status"
      data-state={reading.state}
      title={tooltipFor(reading)}
      className={`type-caption1 inline-flex h-7 items-center gap-2 rounded-full border border-edge bg-surface px-2.5 font-semibold ${INK[reading.state]}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[reading.state]}`} />
      {reading.label}
      <span className="sr-only">. {reading.detail}</span>
    </span>
  );
}

/**
 * The compact indicator, for the phone top bar, where the three links take the
 * width: a 16px glyph whose shape and colour both follow the state, named for
 * screen readers and in the tooltip.
 */
export function ServiceDot({
  reading,
  className = "",
}: {
  reading: ServiceReading;
  className?: string;
}) {
  const Glyph = GLYPH[reading.state];
  return (
    <span
      data-testid="service-dot"
      data-state={reading.state}
      title={`${reading.label}. ${tooltipFor(reading)}`}
      className={`grid h-9 w-6 shrink-0 place-items-center ${className}`}
    >
      <Glyph aria-hidden="true" className={GLYPH_INK[reading.state]} />
      <span className="sr-only">{reading.label}</span>
    </span>
  );
}
