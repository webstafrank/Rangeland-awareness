"use client";

/**
 * Watching a run that already exists.
 *
 * Nine lines of substance, and it earns its file: RunningScreen needs a `poll`
 * function, and a server component cannot pass a function to a client one. So
 * the boundary has to be crossed by something, and this is the smallest thing
 * that can do it. Everything else about the screen, including the timer, stays
 * in RunningScreen where it is tested.
 *
 * The same reason MapPanel exists for `ssr: false`: a directive that only works
 * inside a client component needs a client component to sit in.
 */

import type { Route } from "next";
import RunningScreen from "@/components/run/RunningScreen";
import { createBackendClient } from "@/services/backend-api";
import type { RunStatus, Stage } from "@/services/backend-api";
import type { Topic } from "@/services/analysis/topics";

export interface RunWatchProps {
  topic: Topic;
  runId: string;
  initialStatus: RunStatus;
  initialStages: readonly Stage[];
  initialProgress: number;
  resultHref: Route;
  reviewHref: Route;
}

export default function RunWatch(props: RunWatchProps) {
  return (
    <RunningScreen
      {...props}
      // Built per call rather than once at module scope: the client reads the
      // base URL when it is constructed, and a module-level instance would
      // capture whatever the environment was at import time.
      poll={(id) => createBackendClient().runStatus(id)}
    />
  );
}
