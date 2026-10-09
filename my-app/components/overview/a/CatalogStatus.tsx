import type { ReactNode } from "react";
import { connection } from "next/server";
import { createBackendClient, failureMessage } from "@/services/backend-api";
import { StatusBadge } from "./StatusBadge";

/**
 * The live layer catalogue, as a row of the Overview's status card: whether
 * it answered, how many layers and workspaces it lists, and how fresh it is.
 *
 * An async server component inside <Suspense>, so the page streams at once
 * and only this row waits, for at most the client's 2s. It says what it read
 * or that it could not read: never an API path or raw failure text on the
 * page. failureMessage rides in a title tooltip for anyone who wants it.
 *
 * `connection()` keeps it live: without it Next would prerender the homepage
 * at build time and bake in whatever the catalogue said on the build machine.
 */

const NUMBER = new Intl.NumberFormat("en-GB");

function plural(n: number, one: string, many: string): string {
  return `${NUMBER.format(n)} ${n === 1 ? one : many}`;
}

/** "40 seconds", "12 minutes", "3 hours": the age of a cached copy. */
export function age(seconds: number): string {
  if (seconds < 60) return plural(Math.max(0, Math.round(seconds)), "second", "seconds");
  if (seconds < 3600) return plural(Math.round(seconds / 60), "minute", "minutes");
  return plural(Math.round(seconds / 3600), "hour", "hours");
}

function Row({ badge, detail, title }: { badge: ReactNode; detail: string; title?: string }) {
  return (
    <div className="py-3 last:pb-0" title={title}>
      <dt className="flex items-center justify-between gap-3">
        <span className="type-body1 font-semibold text-ink">Layer catalogue</span>
        {badge}
      </dt>
      <dd className="type-caption1 mt-1 text-ink-muted">{detail}</dd>
    </div>
  );
}

export default async function CatalogStatus() {
  await connection();
  const result = await createBackendClient({ timeoutMs: 2000 }).layerCatalog();

  if (!result.ok) {
    return (
      <Row
        badge={<StatusBadge tone="idle" word="Not reachable" />}
        detail="Layer catalogue not reachable. No layer count until it answers."
        title={failureMessage(result.failure)}
      />
    );
  }

  const { count, workspaces, stale, fetchedAgoSeconds } = result.data;
  const listing = `${plural(count, "layer", "layers")} in ${plural(workspaces.length, "workspace", "workspaces")}`;

  if (stale) {
    const when = fetchedAgoSeconds !== undefined ? ` from ${age(fetchedAgoSeconds)} ago` : "";
    return (
      <Row
        badge={<StatusBadge tone="warn" word="Cached" />}
        detail={`${listing}. A cached copy${when}: GeoServer did not answer.`}
      />
    );
  }

  return (
    <Row
      badge={<StatusBadge tone="good" word="Live" />}
      detail={`${listing}, read from GeoServer just now.`}
    />
  );
}

/** The Suspense fallback: the same row, its reading pending. */
export function CatalogStatusSkeleton() {
  return (
    <div className="py-3 last:pb-0" aria-busy="true">
      <dt className="flex items-center justify-between gap-3">
        <span className="type-body1 font-semibold text-ink">Layer catalogue</span>
        <StatusBadge tone="idle" word="Checking" />
      </dt>
      <dd className="mt-2">
        <span className="sr-only">Checking the layer catalogue</span>
        <span aria-hidden="true" className="skeleton block h-2.5 w-48 rounded-fluent-medium" />
      </dd>
    </div>
  );
}
