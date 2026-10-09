"use client";

import { Badge } from "@fluentui/react-components";
import {
  CheckmarkCircle16Regular,
  Circle16Regular,
  DismissCircle16Regular,
  Warning16Regular,
} from "@/components/ui/icons";

/**
 * The Overview's status chip: icon plus word in a tinted Fluent badge, the
 * same recipe as components/run/JobBadge, so a state reads the same on the
 * homepage as on the running screen. The icon's shape changes with the state,
 * so colour never carries it alone.
 *
 * A client module because Fluent's Badge is one; the server-rendered
 * catalogue row passes it plain props.
 */

export type StatusTone = "good" | "warn" | "bad" | "idle";

const LOOK = {
  good: { color: "success", Icon: CheckmarkCircle16Regular },
  warn: { color: "warning", Icon: Warning16Regular },
  bad: { color: "danger", Icon: DismissCircle16Regular },
  idle: { color: "informative", Icon: Circle16Regular },
} as const;

export function StatusBadge({ tone, word }: { tone: StatusTone; word: string }) {
  const { color, Icon } = LOOK[tone];
  return (
    <Badge
      appearance="tint"
      color={color}
      size="medium"
      shape="rounded"
      icon={<Icon aria-hidden="true" />}
    >
      {word}
    </Badge>
  );
}
