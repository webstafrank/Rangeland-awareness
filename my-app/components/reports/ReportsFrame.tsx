import type { ReactNode } from "react";

const FRAME = "mx-auto w-full max-w-band px-gutter lg:px-gutter-lg";

/**
 * The Reports page's shape, shared by the page and its loading.tsx so the
 * heading never moves between the two.
 *
 * The heading on the panel tier with a stroke under it, like every content
 * page's hero but compact: this page is a tool, and its tabs belong near the
 * top. Below it, on the canvas, whatever the caller passes: the tabs and their
 * panel, or the loading placeholder for them.
 */
export function ReportsFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <section className="border-b border-edge bg-surface">
        <div className={`${FRAME} py-8 lg:py-10`}>
          <h1 className="type-title1 text-ink lg:type-large-title">Reports</h1>
          <p className="type-subtitle1 mt-2 max-w-3xl font-normal text-ink-muted">
            One report per topic. Choose a topic to see its report.
          </p>
        </div>
      </section>
      <div className={`${FRAME} py-6 lg:py-8`}>{children}</div>
    </>
  );
}
