"use client";

/**
 * The application frame every page renders inside.
 *
 *   lg and up   [ navy sidebar | top bar / page / footer ]
 *   below lg    [ top bar (menu, mark, three links) / page / footer ]
 *               with the same sidebar in a drawer behind the menu button
 *
 * The sidebar is sticky at full viewport height rather than fixed, so it
 * takes its width out of the flex row and nothing to its right needs a
 * matching left margin. Collapsing it is a preference kept in localStorage
 * (sidebar-store.ts); the server always renders it expanded, so the first
 * paint matches the server's HTML and a stored collapse applies right after.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Session } from "@/contracts/auth";
import { MobileDrawer } from "./MobileDrawer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import {
  getSidebarServerSnapshot,
  getSidebarSnapshot,
  setSidebarCollapsed,
  subscribeSidebar,
} from "./sidebar-store";

const FOOTER_LINKS = [
  ["About", "/about"],
  ["Help", "/help"],
  ["Contact", "/contact"],
  ["Account", "/account"],
] as const;

/**
 * Full-height map workspaces. They fill the viewport under the top bar, so
 * the site footer would sit under the map and push it off the fold, the way
 * no map workspace (EO Browser, ArcGIS) does. The map credits its own data in
 * its attribution control.
 */
const WORKSPACE_ROUTES = new Set(["/data"]);

/** The breakpoint the sidebar docks at; below it the drawer takes over. */
const DOCKED = "(min-width: 64rem)";

export function AppShell({ session, children }: { session: Session | null; children: ReactNode }) {
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    getSidebarSnapshot,
    getSidebarServerSnapshot,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const workspace = WORKSPACE_ROUTES.has(usePathname());

  // A drawer left open while the window widens past the breakpoint would sit
  // over a docked sidebar showing the same links. Close it when that happens.
  useEffect(() => {
    if (!drawerOpen) return;
    const query = window.matchMedia(DOCKED);
    const onChange = () => {
      if (query.matches) setDrawerOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-full flex-1">
      <aside
        aria-label="Application"
        className={`sticky top-0 hidden h-svh shrink-0 transition-[width] duration-200 ease-out lg:block ${
          collapsed ? "w-17" : "w-62"
        }`}
      >
        <Sidebar
          session={session}
          collapsed={collapsed}
          onToggleCollapsed={() => setSidebarCollapsed(!collapsed)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setDrawerOpen(true)} menuOpen={drawerOpen} />

        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>

        {workspace ? null : (
          <footer className="mt-auto border-t border-edge bg-surface">
            <div className="mx-auto flex w-full max-w-band flex-col gap-3 px-gutter py-5 sm:flex-row sm:items-center sm:justify-between lg:px-gutter-lg">
              <div className="type-caption1 flex max-w-2xl flex-col gap-0.5 text-ink-faint">
                <p>
                  Earth observation analysis for Kenya&apos;s rangelands. Model outputs are decision
                  support, not a forecast of record.
                </p>
                <p>
                  Basemaps &copy; OpenStreetMap contributors. Imagery &copy; Esri, Maxar, Earthstar
                  Geographics.
                </p>
              </div>
              <nav
                aria-label="Footer navigation"
                className="type-caption1 flex flex-wrap gap-x-5 gap-y-2"
              >
                {FOOTER_LINKS.map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    className="rounded-fluent-small font-semibold text-ink-muted hover:text-accent-link hover:underline"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </footer>
        )}
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Sidebar
          session={session}
          onNavigate={() => setDrawerOpen(false)}
          onClose={() => setDrawerOpen(false)}
        />
      </MobileDrawer>
    </div>
  );
}
