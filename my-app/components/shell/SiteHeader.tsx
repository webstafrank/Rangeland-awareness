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
 * The header sits on the deepest navy so it reads as chrome rather than as
 * the first band of content, and so the hero band below it is a visible step
 * lighter. That step is what starts the alternation.
 */
export function SiteHeader({ session, compact = false }: SiteHeaderProps) {
  return (
    <header className="band-navy-deep border-navy-700 border-b">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="rounded" aria-label="Rangeland Watch home">
          <Logo tone="dark" markOnly={compact} />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {compact ? null : (
            <ButtonLink href="/" variant="ghost" size="sm" tone="dark" className="hidden sm:inline-flex">
              Analysis
            </ButtonLink>
          )}

          {session ? (
            <>
              <span className="text-caption text-ink-dark-secondary hidden items-center gap-2 sm:flex">
                <span className="text-ink-dark-muted">
                  {session.kind === "guest" ? "Guest session" : "Signed in"}
                </span>
                <span className="text-ink-dark-primary font-semibold">{session.name}</span>
              </span>
              {session.kind === "guest" ? (
                <ButtonLink href="/signup" variant="outline" size="sm" tone="dark">
                  Sign up
                </ButtonLink>
              ) : null}
              <form action={signOutAction}>
                <Button type="submit" variant="ghost" size="sm" tone="dark">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm" tone="dark">
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup" variant="outline" size="sm" tone="dark">
                Sign up
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
