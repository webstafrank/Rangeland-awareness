"use client";

/**
 * The navigation drawer below lg, as a native modal <dialog>.
 *
 * Native rather than Fluent's OverlayDrawer, for a measured reason: merely
 * mounting OverlayDrawer, closed, stopped arrow-key navigation in every Fluent
 * TabList on the page (the Reports tabs, evals/reports.spec.ts R4 failed with
 * it present and passed with it removed, same build otherwise). Both live on
 * Fluent's keyboard layer, tabster, and the drawer's modal machinery broke the
 * tab list's arrow-key mover. A native dialog has nothing on that layer, and
 * `showModal()` already gives what the drawer was for: focus held inside,
 * Escape to close, the page behind made inert, and focus handed back to the
 * menu button on close.
 *
 * The open state stays in React (AppShell); this mirrors it onto the element,
 * and reports every way the browser closes it (Escape, a backdrop click)
 * through `onClose` so the two cannot disagree.
 */

import { useEffect, useRef, type ReactNode } from "react";

export function MobileDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      id="app-drawer"
      aria-label="Navigation"
      className="app-drawer"
      onClose={onClose}
      // The drawer's contents fill it edge to edge, so a click whose target is
      // the dialog element itself landed on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
