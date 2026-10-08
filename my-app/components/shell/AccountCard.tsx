"use client";

/**
 * Who is signed in, at the foot of the sidebar.
 *
 * Before this the session was set by every auth action and read by nothing:
 * the header had no user state and there was no way to sign out. The shell's
 * server layout now reads the cookie once and hands it down, and this card
 * shows it, with sign out as a real form posting to the existing server
 * action (so it works before hydration too).
 */

import Link from "next/link";
import type { Session } from "@/contracts/auth";
import { signOutAction } from "@/services/auth/actions";
import { Person20Regular, SignOut20Regular } from "@/components/ui/icons";

/** Up to two initials from a display name, for the avatar. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function AccountCard({
  session,
  collapsed,
  onNavigate,
}: {
  session: Session | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  if (!session) {
    if (collapsed) {
      return (
        <Link
          href="/login"
          title="Sign in"
          aria-label="Sign in"
          onClick={onNavigate}
          className="nav-row mx-auto grid h-9 w-9 place-items-center rounded-fluent-medium text-nav-ink-muted hover:bg-nav-raised hover:text-nav-ink"
        >
          <Person20Regular aria-hidden="true" />
        </Link>
      );
    }
    return (
      <div className="flex flex-col gap-2 rounded-fluent-large bg-nav-raised p-3">
        <p className="type-caption1 text-nav-ink-muted">
          Browsing as a visitor. Sign in to keep your runs.
        </p>
        <div className="flex gap-2">
          <Link
            href="/login"
            onClick={onNavigate}
            className="type-caption1 inline-flex h-7 flex-1 items-center justify-center rounded-fluent-medium bg-white font-semibold text-nav hover:bg-accent-soft"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            onClick={onNavigate}
            className="type-caption1 inline-flex h-7 flex-1 items-center justify-center rounded-fluent-medium border border-nav-edge font-semibold text-nav-ink hover:bg-nav-active"
          >
            Create account
          </Link>
        </div>
      </div>
    );
  }

  const role = session.kind === "guest" ? "Guest session" : (session.email ?? "Member");

  return (
    <div
      className={`flex items-center rounded-fluent-large ${collapsed ? "flex-col gap-1" : "gap-2.5 bg-nav-raised p-2"}`}
    >
      <Link
        href="/account"
        title={collapsed ? `${session.name}, account` : undefined}
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-fluent-medium"
      >
        <span
          aria-hidden="true"
          className="type-caption1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-nav-accent font-semibold text-nav"
        >
          {initialsOf(session.name)}
        </span>
        <span className={collapsed ? "sr-only" : "flex min-w-0 flex-col"}>
          <span className="type-caption1 truncate font-semibold text-nav-ink">{session.name}</span>
          <span className="type-caption1 truncate text-nav-ink-faint">{role}</span>
        </span>
      </Link>
      <form action={signOutAction}>
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="nav-row grid h-8 w-8 place-items-center rounded-fluent-medium text-nav-ink-muted hover:bg-nav-active hover:text-nav-ink"
        >
          <SignOut20Regular aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
