import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Person20Regular, SignOut20Regular } from "@/components/ui/icons";
import { FRAME, InfoGrid, PageHero, PageSection } from "@/components/shell/Page";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import type { Session } from "@/contracts/auth";
import { getSession } from "@/services/auth";
import { continueAsGuestAction, signOutAction } from "@/services/auth/actions";

export const metadata: Metadata = {
  title: "Account",
  description: "Your Disaster Monitor session: who is signed in, since when, and how to sign out.",
};

/**
 * The account page, read from the real session cookie on every request.
 *
 * Three states, because services/auth has three: no cookie at all, a guest
 * session (Continue as guest), and a member session (sign in or sign up).
 * It shows only what the session holds, which is a name, an email for a
 * member, the kind and the start time. The organisation typed at sign up is
 * not stored, so it is not shown, and nothing here is invented to fill the
 * page.
 *
 * Nothing on this page advertises a feature the build lacks. Saved runs, run
 * history, notifications and profile editing do not exist yet, and the last
 * section says so in one place instead of rendering locks that never open.
 */

const START = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Nairobi",
});

function startedLabel(iso: string): string {
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? "Not recorded" : `${START.format(when)} EAT`;
}

const IN_THIS_BUILD = [
  {
    label: "Every analysis is open",
    description:
      "All four topics, all 47 counties and every model work the same for a guest, a member, or no session at all.",
  },
  {
    label: "A named session",
    description:
      "Signing in puts your name and email on a cookie in this browser, so the sidebar shows who is working. Signing out clears it.",
  },
  {
    label: "No credential check yet",
    description:
      "There is no password and no account store behind the form. Saved runs, run history, notifications and profile editing are not built.",
  },
] as const;

function SessionDetails({ session }: { session: Session }) {
  const rows: [string, ReactNode][] = [
    ["Name", session.name],
    ...(session.email ? ([["Email", session.email]] as [string, ReactNode][]) : []),
    ["Session", session.kind === "member" ? "Signed in" : "Guest"],
    ["Started", <time key="t" dateTime={session.startedAt}>{startedLabel(session.startedAt)}</time>],
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-edge px-4 py-4 lg:px-5">
        <span
          aria-hidden="true"
          className="type-subtitle2 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"
        >
          {session.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0">
          <p className="type-subtitle2 truncate text-ink">{session.name}</p>
          <p className="type-caption1 truncate text-ink-faint">
            {session.kind === "member" ? (session.email ?? "Member") : "Guest session"}
          </p>
        </div>
      </div>
      <dl className="divide-y divide-edge">
        {rows.map(([term, value]) => (
          <div
            key={term}
            className="grid gap-0.5 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4 lg:px-5"
          >
            <dt className="type-body1 text-ink-faint">{term}</dt>
            <dd className="type-body1 min-w-0 break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SignOutForm({ label }: { label: string }) {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="secondary" icon={<SignOut20Regular aria-hidden="true" />}>
        {label}
      </Button>
    </form>
  );
}

export default async function AccountPage() {
  const session = await getSession();
  const member = session?.kind === "member";

  return (
    <>
      <PageHero
        eyebrow="Profile"
        title="Your account"
        lead={
          member
            ? `Signed in as ${session.name}.`
            : session
              ? "Browsing as a guest. Every analysis is open to you."
              : "Not signed in. Every analysis is open without an account."
        }
        actions={session ? <SignOutForm label={member ? "Sign out" : "End guest session"} /> : undefined}
      />

      {session ? (
        <PageSection
          eyebrow="Session"
          title="Session details"
          intro={
            member
              ? "What this browser's session holds. It lasts until you sign out or the cookie expires."
              : "A guest session holds no email. Sign in to put your name on the session."
          }
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <SessionDetails session={session} />
            {member ? null : (
              <div className="card flex flex-col gap-3 p-4 lg:p-5">
                <p className="type-subtitle2 text-ink">Sign in instead</p>
                <p className="type-body1 text-ink-muted">
                  Replaces the guest session with one in your name.
                </p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link href="/login" className={buttonClasses({ appearance: "primary" })}>
                    Sign in
                  </Link>
                  <Link href="/signup" className={buttonClasses()}>
                    Create account
                  </Link>
                </div>
              </div>
            )}
          </div>
        </PageSection>
      ) : (
        <section aria-label="Sign in" className={`${FRAME} py-8 lg:py-10`}>
          <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center lg:p-5">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-fluent-large bg-accent-soft text-accent"
            >
              <Person20Regular />
            </span>
            <p className="type-body1 min-w-0 flex-1 text-ink-muted">
              Sign in to put your name on this browser&apos;s session, or carry on as a guest.
              Nothing in the analysis depends on it.
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href="/login" className={buttonClasses({ appearance: "primary" })}>
                Sign in
              </Link>
              <Link href="/signup" className={buttonClasses()}>
                Create account
              </Link>
              <form action={continueAsGuestAction}>
                <Button type="submit" variant="subtle">
                  Continue as guest
                </Button>
              </form>
            </div>
          </div>
        </section>
      )}

      <PageSection
        tier="panel"
        eyebrow="In this build"
        title="What an account does today"
        intro="Accounts are a stub while the analysis is built. This is the full list of what one changes."
      >
        <InfoGrid items={IN_THIS_BUILD} />
      </PageSection>
    </>
  );
}
