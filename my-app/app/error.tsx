"use client";

import Link from "next/link";
import { ErrorCircle20Regular, Home20Regular } from "@/components/ui/icons";
import { FRAME } from "@/components/shell/Page";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { StateBlock } from "@/components/ui/StateBlock";

/**
 * The root error boundary: any route below the root layout that throws while
 * rendering lands here, inside the app shell, instead of on Next's bare
 * error page.
 *
 * Built on StateBlock like every other failure state. "Try again" calls
 * Next's `reset()`, which re-renders the segment without a full reload, so a
 * transient failure (a service that was briefly down) recovers in place.
 * The error's message is not shown: in production Next replaces it with a
 * generic string anyway, and a stack trace is not something a reader can act
 * on. The digest is shown when present, because it is the one value that
 * matches this failure to the server log.
 *
 * A client component, as Next requires of error.tsx.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className={`${FRAME} flex flex-1 flex-col justify-center py-10 lg:py-16`}>
      <StateBlock
        icon={<ErrorCircle20Regular />}
        tone="danger"
        title="This page could not be shown"
        actions={
          <>
            <Button variant="primary" onClick={() => reset()}>
              Try again
            </Button>
            <Link href="/" className={buttonClasses()}>
              <Home20Regular aria-hidden="true" />
              Back to home
            </Link>
          </>
        }
      >
        <p>Something failed while this page was loading. Try again, or start from the homepage.</p>
        {error.digest ? (
          <p className="type-caption1 mt-2 text-ink-faint">
            Reference <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </StateBlock>
    </section>
  );
}
