"use client";

/**
 * The navy application frame: brand, the three product sections, the topic
 * shortcuts, support links and the account.
 *
 * One component, two placements. On a desktop it is the sticky left rail
 * (AppShell), collapsible to an icon rail. On a phone or tablet the same
 * contents open in the drawer behind the top bar's menu button, always
 * expanded. Rendering one component in both places is what keeps the two from
 * drifting into different navigation.
 *
 * The section navs carry their own names ("Primary", "Topics", "Support"), so
 * a screen reader's landmark list reads the sidebar as three navigations
 * rather than one long run of links. On a phone the top bar carries its own
 * "Primary" nav, visible beside the menu button; the two never show at once,
 * because each is display:none at the other's breakpoint, and a hidden
 * element is not in the accessibility tree.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Session } from "@/contracts/auth";
import {
  DataBarVertical20Regular,
  Dismiss20Regular,
  Home20Regular,
  DocumentText20Regular,
  Info20Regular,
  Mail20Regular,
  Map20Regular,
  PanelLeftContract20Regular,
  PanelLeftExpand20Regular,
  QuestionCircle20Regular,
} from "@/components/ui/icons";
import { TopicGlyph } from "@/components/topic/TopicIcon";
import { AccountCard } from "./AccountCard";
import {
  PRIMARY_ITEMS,
  SUPPORT_ITEMS,
  TOPIC_ITEMS,
  currentTopic,
  type PrimaryItem,
  type SupportItem,
} from "./nav-model";

const PRIMARY_ICONS: Record<PrimaryItem["icon"], typeof Map20Regular> = {
  explore: Map20Regular,
  analysis: DataBarVertical20Regular,
  reports: DocumentText20Regular,
};

const SUPPORT_ICONS: Record<SupportItem["icon"], typeof Map20Regular> = {
  help: QuestionCircle20Regular,
  about: Info20Regular,
  contact: Mail20Regular,
};

/**
 * One sidebar row. The label stays in the DOM when collapsed, visually
 * hidden, so the link keeps its accessible name; `title` gives a pointer
 * user the same name as a tooltip.
 */
function NavRow({
  href,
  label,
  icon,
  current,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  current: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <li>
      <Link
        href={href as never}
        aria-current={current ? "page" : undefined}
        title={collapsed ? label : undefined}
        onClick={onNavigate}
        className={`nav-row group relative flex h-9 items-center gap-3 rounded-fluent-medium px-2.5 type-body1 transition-colors duration-150 ${
          current
            ? "bg-nav-active font-semibold text-nav-ink"
            : "text-nav-ink-muted hover:bg-nav-raised hover:text-nav-ink"
        } ${collapsed ? "justify-center px-0" : ""}`}
      >
        {current ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-nav-accent"
          />
        ) : null}
        <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center">
          {icon}
        </span>
        <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{label}</span>
      </Link>
    </li>
  );
}

function SectionLabel({ children, collapsed }: { children: string; collapsed: boolean }) {
  if (collapsed) return <span aria-hidden="true" className="mx-3 my-2 block h-px bg-nav-edge" />;
  return (
    <p aria-hidden="true" className="px-2.5 pb-1.5 type-caption1 font-semibold text-nav-ink-faint">
      {children}
    </p>
  );
}

export function Sidebar({
  session,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
  onClose,
  className = "",
}: {
  session: Session | null;
  collapsed?: boolean;
  /** Absent in the drawer, which is always expanded. */
  onToggleCollapsed?: () => void;
  /** Called after any link is followed, so the drawer can close itself. */
  onNavigate?: () => void;
  /** The drawer's close button. Absent on the docked sidebar. */
  onClose?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const topic = currentTopic(pathname);

  return (
    <div className={`band-nav flex h-full min-h-0 flex-col ${className}`}>
      <div
        className={`flex h-14 shrink-0 items-center border-b border-nav-edge ${
          collapsed ? "justify-center px-2" : "gap-3 px-4"
        }`}
      >
        <Link
          href="/"
          aria-label="Disaster Monitor overview"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-3 rounded-fluent-medium"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-fluent-large bg-white p-1">
            <Image src="/ksa-logo.png" alt="" width={33} height={26} priority />
          </span>
          {collapsed ? null : (
            <span className="flex min-w-0 flex-col">
              <span className="type-body1 truncate font-semibold text-nav-ink">
                Disaster Monitor
              </span>
              <span className="type-caption1 truncate text-nav-ink-faint">
                Kenya Space Agency
              </span>
            </span>
          )}
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="nav-row ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-fluent-medium text-nav-ink-muted hover:bg-nav-raised hover:text-nav-ink"
          >
            <Dismiss20Regular aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
        <div>
          <SectionLabel collapsed={collapsed}>Workspace</SectionLabel>
          {/*
            The Overview sits above the Primary nav rather than in it: the
            three product sections are the same three the phone top bar shows,
            and the acceptance rubric pins that nav to exactly those. It is
            still a row like the others, marked when you are on it.
          */}
          <ul className="mb-0.5 flex flex-col">
            <NavRow
              href="/"
              label="Overview"
              icon={<Home20Regular />}
              current={pathname === "/"}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          </ul>
          <nav aria-label="Primary">
            <ul className="flex flex-col gap-0.5">
              {PRIMARY_ITEMS.map((item) => {
                const Icon = PRIMARY_ICONS[item.icon];
                return (
                  <NavRow
                    key={item.label}
                    href={item.href}
                    label={item.label}
                    icon={<Icon />}
                    current={item.current(pathname)}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                );
              })}
            </ul>
          </nav>
        </div>

        <div>
          <SectionLabel collapsed={collapsed}>Topics</SectionLabel>
          <nav aria-label="Topics">
            <ul className="flex flex-col gap-0.5">
              {TOPIC_ITEMS.map((item) => (
                <NavRow
                  key={item.slug}
                  href={item.href}
                  label={item.label}
                  icon={<TopicGlyph slug={item.slug} />}
                  current={topic === item.slug}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-auto">
          <SectionLabel collapsed={collapsed}>Support</SectionLabel>
          <nav aria-label="Support">
            <ul className="flex flex-col gap-0.5">
              {SUPPORT_ITEMS.map((item) => {
                const Icon = SUPPORT_ICONS[item.icon];
                return (
                  <NavRow
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={<Icon />}
                    current={pathname === item.href}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                );
              })}
            </ul>
          </nav>
        </div>
      </div>

      <div className="shrink-0 border-t border-nav-edge p-3">
        <AccountCard session={session} collapsed={collapsed} onNavigate={onNavigate} />
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`nav-row mt-2 flex h-8 w-full items-center gap-3 rounded-fluent-medium px-2.5 type-caption1 text-nav-ink-faint transition-colors duration-150 hover:bg-nav-raised hover:text-nav-ink ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            {collapsed ? (
              <PanelLeftExpand20Regular aria-hidden="true" />
            ) : (
              <>
                <PanelLeftContract20Regular aria-hidden="true" />
                <span>Collapse</span>
              </>
            )}
          </button>
        ) : null}
      </div>

      <div
        className={`flex shrink-0 items-center border-t border-nav-edge py-3 ${
          collapsed ? "justify-center px-2" : "gap-2.5 px-4"
        }`}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-fluent-medium bg-white p-0.5">
          <Image src="/wfp-logo.png" alt="World Food Programme" width={24} height={23} />
        </span>
        {collapsed ? null : (
          <span className="type-caption1 text-nav-ink-faint">With the World Food Programme</span>
        )}
      </div>
    </div>
  );
}
