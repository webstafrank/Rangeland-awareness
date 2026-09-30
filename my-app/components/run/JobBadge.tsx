"use client";

import { Badge } from "@fluentui/react-components";
import {
  ArrowSync16Regular,
  CheckmarkCircle16Regular,
  Circle16Regular,
  Clock16Regular,
  DismissCircle16Regular,
  ErrorCircle16Regular,
  SubtractCircle16Regular,
} from "@/components/ui/icons";
import type { RunStatus, StageState } from "@/services/backend-api";

/**
 * The design system's JobStatus badge: a Fluent `Badge`, tint appearance,
 * always icon plus word.
 *
 * One component for both vocabularies the contract speaks. A RUN is Queued,
 * Running, Succeeded, Failed or Cancelled, the design system's own five job
 * states. A STAGE inside it is Pending, Running, Done, Skipped or Failed, and
 * those words are kept as the contract names them because the stage list's
 * tests and screen-reader output read them.
 *
 * Colour follows the design system exactly: running is brand, succeeded is
 * the success pair, failed the danger pair, and every waiting or inert state
 * is neutral. The icon is the design system's list (Clock queued, ArrowSync
 * running, CheckmarkCircle succeeded, ErrorCircle failed, DismissCircle
 * cancelled), so the state survives greyscale and colour blindness; the word
 * survives a screen reader. Neither is ever dropped.
 */

type Look = {
  word: string;
  color: "brand" | "success" | "danger" | "informative";
  Icon: typeof Clock16Regular;
};

const RUN: Record<RunStatus, Look> = {
  queued: { word: "Queued", color: "informative", Icon: Clock16Regular },
  running: { word: "Running", color: "brand", Icon: ArrowSync16Regular },
  succeeded: { word: "Succeeded", color: "success", Icon: CheckmarkCircle16Regular },
  failed: { word: "Failed", color: "danger", Icon: ErrorCircle16Regular },
  cancelled: { word: "Cancelled", color: "informative", Icon: DismissCircle16Regular },
};

const STAGE: Record<StageState, Look> = {
  pending: { word: "Pending", color: "informative", Icon: Circle16Regular },
  running: { word: "Running", color: "brand", Icon: ArrowSync16Regular },
  done: { word: "Done", color: "success", Icon: CheckmarkCircle16Regular },
  skipped: { word: "Skipped", color: "informative", Icon: SubtractCircle16Regular },
  failed: { word: "Failed", color: "danger", Icon: ErrorCircle16Regular },
};

/** The word a stage state is read as. Exported so a row can use it in text. */
export function stageWord(state: StageState): string {
  return STAGE[state].word;
}

export function JobBadge(
  props: { kind: "run"; state: RunStatus } | { kind: "stage"; state: StageState },
) {
  const look = props.kind === "run" ? RUN[props.state] : STAGE[props.state];
  const { Icon } = look;
  // The running icon turns, and only while running. The reduced-motion block
  // in globals.css flattens it to a still icon for anyone who asked.
  const spin = props.state === "running" ? "animate-spin [animation-duration:2s]" : "";

  return (
    <Badge
      appearance="tint"
      color={look.color}
      size="medium"
      shape="rounded"
      icon={<Icon className={spin} aria-hidden="true" />}
    >
      {look.word}
    </Badge>
  );
}
