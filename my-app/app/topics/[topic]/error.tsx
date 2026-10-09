"use client";

/**
 * The error boundary for every route under a topic: the steps, the running
 * screen and the result.
 *
 * Only for what nothing else catches. The service being down is not an error
 * here: the routes answer that with RunProblem, in words. This is the case
 * where a render itself threw, so the page says so, offers to try again (the
 * `retry` Next passes, which re-fetches the segment rather than only
 * re-rendering it), and gives a way back to the topic that does not depend on
 * the broken page.
 */

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Route } from "next";
import { ArrowClockwise20Regular, ArrowLeft20Regular, ErrorCircle20Regular } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { StateBlock } from "@/components/ui/StateBlock";
import { FRAME } from "@/components/shell/Page";

export default function TopicError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const params = useParams<{ topic?: string }>();
  const topicHref = (params.topic ? `/topics/${params.topic}` : "/") as Route;

  useEffect(() => {
    // In the console for whoever is debugging; the digest is what matches the
    // server log line when the error came from a server component.
    console.error(error);
  }, [error]);

  return (
    <div className={`${FRAME} py-8 lg:py-10`}>
      <StateBlock
        tone="danger"
        icon={<ErrorCircle20Regular />}
        title="This page could not be shown"
        className="mx-auto max-w-2xl"
        actions={
          <>
            <Button
              type="button"
              variant="primary"
              icon={<ArrowClockwise20Regular />}
              onClick={() => retry()}
            >
              Try again
            </Button>
            <Link href={topicHref} className={buttonClasses()}>
              <ArrowLeft20Regular aria-hidden="true" />
              Back to the topic
            </Link>
          </>
        }
      >
        <p>
          Something on this page failed while it was being drawn. Try again to fetch it
          afresh, or go back to the topic and pick up from there.
        </p>
        {error.digest ? (
          <p className="type-caption1 mt-2 text-ink-faint">
            Reference <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
      </StateBlock>
    </div>
  );
}
