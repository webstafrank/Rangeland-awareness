import type { ReactNode } from "react";
import { FRAME } from "@/components/shell/Page";

/**
 * The Reports page's shape, shared by the page and its loading.tsx so the
 * heading never moves between the two.
 *
 * The content pages' header (title2, body2 lead on the white panel tier)
 * with no eyebrow, since the top bar already names the section, and no
 * hairline or bottom padding of its own: the tab band that follows (TabBand
 * in ReportTabs.tsx) continues the same white ground and closes it with the
 * hairline, so the tabs read as the header's last row. Below that, on the
 * canvas, the selected report.
 */
export function ReportsFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <section className="bg-surface">
        <div className={`${FRAME} pt-6 pb-2 lg:pt-8`}>
          <h1 className="type-title2 text-ink">Reports</h1>
          <p className="type-body2 mt-1 max-w-3xl text-ink-muted">
            One report per topic. Choose a topic to see its report.
          </p>
        </div>
      </section>
      {children}
    </>
  );
}
