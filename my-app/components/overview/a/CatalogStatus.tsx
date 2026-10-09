import { connection } from "next/server";
import { createBackendClient, failureMessage } from "@/services/backend-api";

/**
 * The live layer catalogue, as one quiet status line beside "At a glance".
 *
 * An async server component, rendered inside <Suspense> by Overview, so the
 * page streams at once and only this line waits, for at most the client's 2s.
 * It says what it read or that it could not read, nothing else: no API path
 * and no raw failure text on the page. failureMessage rides in a title
 * tooltip for anyone who wants the reason.
 *
 * `connection()` keeps it live: without it Next would prerender the homepage
 * at build time and bake in whatever the catalogue said on the build machine.
 */

const NUMBER = new Intl.NumberFormat("en-GB");

function plural(n: number, one: string, many: string): string {
  return `${NUMBER.format(n)} ${n === 1 ? one : many}`;
}

const DOT = {
  success: "bg-success",
  warn: "bg-warn",
  muted: "bg-edge-strong",
} as const;

function Dot({ tone }: { tone: keyof typeof DOT }) {
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} />;
}

export default async function CatalogStatus() {
  await connection();
  const result = await createBackendClient({ timeoutMs: 2000 }).layerCatalog();

  if (!result.ok) {
    return (
      <p
        className="type-caption1 flex items-center gap-1.5 text-ink-faint"
        title={failureMessage(result.failure)}
      >
        <Dot tone="muted" />
        Layer catalogue not reachable
      </p>
    );
  }

  const { count, workspaces, stale } = result.data;
  return (
    <p className="type-caption1 flex min-w-0 items-center gap-1.5 text-ink-muted">
      <Dot tone={stale ? "warn" : "success"} />
      <span className="truncate">
        Layer catalogue: {plural(count, "layer", "layers")} in{" "}
        {plural(workspaces.length, "workspace", "workspaces")}
        {stale ? " (cached copy)" : ""}
      </span>
    </p>
  );
}

/** The Suspense fallback: the same line, its figures pending. */
export function CatalogStatusSkeleton() {
  return (
    <p className="type-caption1 flex items-center gap-1.5 text-ink-faint" aria-busy="true">
      <Dot tone="muted" />
      <span className="sr-only">Checking the layer catalogue</span>
      <span aria-hidden="true" className="skeleton block h-2.5 w-40 rounded-fluent-medium" />
    </p>
  );
}
