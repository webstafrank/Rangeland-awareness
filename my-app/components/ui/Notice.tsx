"use client";

import type { ReactNode } from "react";
import {
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
} from "@fluentui/react-components";

export interface NoticeProps {
  /** Fluent's four intents. Each brings its own icon, so no notice is colour alone. */
  intent?: "info" | "warning" | "error" | "success";
  /** Bold lead-in, set inline before the body text as Fluent does. */
  title?: ReactNode;
  children: ReactNode;
  /** Buttons under the message: Fluent `Button`s, secondary or subtle. */
  actions?: ReactNode;
  /**
   * The live-region role, when the notice reports something the user caused
   * and must hear. Replaces MessageBar's default `group`. Omit for a static
   * note that is part of the page.
   */
  role?: "status" | "alert";
  "aria-live"?: "polite" | "assertive";
  "data-testid"?: string;
  className?: string;
}

/**
 * A Fluent `MessageBar`, the design system's component for validation,
 * warnings and notes that sit in the flow of a page.
 *
 * Always the multiline layout. These messages are sentences with an
 * instruction at the end ("Remove one to pick a different county"), and the
 * singleline layout truncates, which would cut exactly that part.
 *
 * Why a wrapper: the Fluent package has no "use client" at its barrel, so a
 * server component cannot render a MessageBar directly. This module is the
 * client boundary, and it pins the two decisions every caller would otherwise
 * repeat (multiline, and a role override when the notice is live).
 */
export function Notice({
  intent = "info",
  title,
  children,
  actions,
  role,
  className,
  ...rest
}: NoticeProps) {
  return (
    <MessageBar
      intent={intent}
      layout="multiline"
      className={className}
      {...(role ? { role } : {})}
      {...rest}
    >
      <MessageBarBody>
        {title ? <MessageBarTitle>{title}</MessageBarTitle> : null}
        {children}
      </MessageBarBody>
      {actions ? <MessageBarActions>{actions}</MessageBarActions> : null}
    </MessageBar>
  );
}
