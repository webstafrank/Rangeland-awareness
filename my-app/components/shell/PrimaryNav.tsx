"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

/**
 * The header's three destinations, with the current one marked.
 *
 * A client island only because the current page is read from the URL; the
 * header around it stays a server component. The mark is `aria-current`, so
 * a screen reader hears "current page" where a sighted reader sees the
 * accent underline.
 *
 * Analysis has no page of its own: the homepage's topic grid is where every
 * analysis starts, so the link goes there, and it is marked current anywhere
 * inside a topic's steps.
 */
const ITEMS: readonly { label: string; href: Route; current: (path: string) => boolean }[] = [
  { label: "Explore", href: "/data", current: (p) => p === "/data" },
  { label: "Analysis", href: "/#topics", current: (p) => p.startsWith("/topics/") },
  { label: "Reports", href: "/reports", current: (p) => p === "/reports" },
];

export function PrimaryNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="ml-auto flex items-center gap-0.5 sm:gap-1">
      {ITEMS.map((item) => {
        const current = item.current(pathname);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={`type-body1 relative rounded-fluent-medium px-2 py-1.5 hover:bg-page hover:text-ink sm:px-2.5 ${
              current
                ? "font-semibold text-ink after:absolute after:inset-x-2 after:-bottom-[7px] after:h-[3px] after:rounded-full after:bg-accent"
                : "text-ink-muted"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
