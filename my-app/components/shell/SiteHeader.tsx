import Link from "next/link";
import { signOutAction } from "@/services/auth/actions";
import type { Session } from "@/contracts/auth";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";

interface SiteHeaderProps {
  session: Session | null;
  /** Hides the marketing actions on the in-app screens. */
  compact?: boolean;
}

/**
 * A session-aware app header, in the same Fluent chrome as the one
 * app/layout.tsx renders: 48px of colorNeutralBackground4 with dark ink and a
 * colorNeutralStroke2 rule beneath it.
 *
 * NOTE: nothing renders this today. The root layout carries its own header,
 * which has no session to show because no route reads one yet. This is kept
 * restyled rather than deleted so the day a signed-in header is wanted it
 * matches the rest of the app instead of resurrecting the navy band.
 */
export function SiteHeader({ session, compact = false }: SiteHeaderProps) {
  return (
    <header className="band-chrome border-b border-edge">
      <div className="mx-auto flex h-12 w-full max-w-band items-center justify-between gap-4 px-gutter lg:px-gutter-lg">
        <Link href="/" className="rounded-fluent-medium" aria-label="Rangeland Awareness home">
          <Logo markOnly={compact} size={30} />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {compact ? null : (
            <>
              <ButtonLink href="/" variant="subtle" size="sm" className="hidden sm:inline-flex">
                Analysis
              </ButtonLink>
              <ButtonLink href="/data" variant="subtle" size="sm" className="hidden sm:inline-flex">
                Explore data
              </ButtonLink>
            </>
          )}

          {session ? (
            <>
              <span className="type-caption1 hidden items-center gap-2 sm:flex">
                <span className="text-ink-faint">
                  {session.kind === "guest" ? "Guest session" : "Signed in"}
                </span>
                <span className="font-semibold text-ink">{session.name}</span>
              </span>
              {session.kind === "guest" ? (
                <ButtonLink href="/signup" variant="secondary" size="sm">
                  Sign up
                </ButtonLink>
              ) : null}
              <form action={signOutAction}>
                <Button type="submit" variant="subtle" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="subtle" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup" variant="secondary" size="sm">
                Sign up
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
