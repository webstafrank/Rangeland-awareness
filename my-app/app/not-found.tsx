import Link from "next/link";
import { TOPICS } from "@/lib/analysis/topics";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-widest text-ink-faint">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        Page not found
      </h1>
      <p className="mt-3 text-ink-muted">
        That address does not match anything in this app. Pick a topic to start
        an analysis.
      </p>

      <ul className="mt-8 grid gap-2 sm:grid-cols-2">
        {TOPICS.map((topic) => (
          <li key={topic.slug}>
            <Link
              href={`/topics/${topic.slug}`}
              className="block rounded-lg border border-edge bg-surface px-4 py-3 text-sm font-medium hover:border-edge-strong"
            >
              {topic.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
