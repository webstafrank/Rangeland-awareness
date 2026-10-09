"use client";

/**
 * The top bar: the first `<header>` on every page.
 *
 * Desktop: where you are (the breadcrumb) on the left, the live service state
 * on the right. Navigation lives in the sidebar beside it.
 *
 * Phone and tablet (below lg, where the sidebar becomes a drawer): the menu
 * button that opens the drawer, the KSA mark, and the three product sections
 * as plain links, so the primary destinations are one tap away without
 * opening anything. That is why this header carries its own "Primary" nav:
 * it is display:none from lg up, the sidebar's is display:none below, and so
 * exactly one is ever in the accessibility tree.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight12Regular, Navigation20Regular } from "@/components/ui/icons";
import { PRIMARY_ITEMS, crumbsFor } from "./nav-model";
import { ServiceDot, ServiceStatus, useServiceReading } from "./ServiceStatus";

export function TopBar({
  onOpenMenu,
  menuOpen,
}: {
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);
  const reading = useServiceReading();

  return (
    <header className="band-chrome sticky top-0 z-header border-b border-edge">
      <div className="flex h-14 items-center gap-2 px-gutter lg:gap-4 lg:px-gutter-lg">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          aria-controls="app-drawer"
          className="-ml-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-fluent-medium text-ink-muted hover:bg-page hover:text-ink lg:hidden"
        >
          <Navigation20Regular aria-hidden="true" />
        </button>

        <Link
          href="/"
          aria-label="Disaster Monitor overview"
          className="flex shrink-0 items-center rounded-fluent-medium lg:hidden"
        >
          <Image src="/ksa-logo.png" alt="" width={35} height={28} priority />
        </Link>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 lg:block">
          <ol className="type-body1 flex min-w-0 items-center gap-1.5">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 ? (
                    <ChevronRight12Regular aria-hidden="true" className="shrink-0 text-ink-faint" />
                  ) : null}
                  {crumb.href && !last ? (
                    <Link
                      href={crumb.href}
                      className="truncate rounded-fluent-small text-ink-faint hover:text-ink hover:underline"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      aria-current={last ? "page" : undefined}
                      className={`truncate ${last ? "font-semibold text-ink" : "text-ink-faint"}`}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <nav aria-label="Primary" className="ml-auto flex items-center gap-0.5 lg:hidden">
          {PRIMARY_ITEMS.map((item) => {
            const current = item.current(pathname);
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`type-body1 relative rounded-fluent-medium px-2 py-1.5 hover:bg-page hover:text-ink sm:px-2.5 ${
                  current
                    ? "font-semibold text-ink after:absolute after:inset-x-2 after:-bottom-[11px] after:h-0.5 after:rounded-full after:bg-accent"
                    : "text-ink-muted"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden shrink-0 lg:block">
          <ServiceStatus reading={reading} />
        </div>
        <ServiceDot reading={reading} className="-mr-1.5 lg:hidden" />
      </div>
    </header>
  );
}
