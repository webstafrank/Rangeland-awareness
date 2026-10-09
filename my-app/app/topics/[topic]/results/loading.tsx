import { FRAME } from "@/components/shell/Page";

/**
 * Shown while the results route reads the run's result on the server.
 *
 * The result's own outline in grey blocks: the white header band, four KPI
 * tiles, then the class table beside the area panel. Same frame and rhythm as
 * ResultView, so the page fills in rather than rearranging.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true">
      <p className="sr-only">Loading the result</p>
      <div aria-hidden="true" className="border-b border-edge bg-surface">
        <div className={`${FRAME} py-6 lg:py-8`}>
          <div className="skeleton h-6 w-32 rounded-fluent-medium" />
          <div className="skeleton mt-3 h-8 w-64 max-w-full rounded-fluent-medium" />
          <div className="skeleton mt-2 h-4 w-80 max-w-full rounded-fluent-small" />
          <div className="skeleton mt-5 h-14 w-full rounded-fluent-large" />
        </div>
      </div>

      <div aria-hidden="true" className={`${FRAME} flex flex-col gap-8 py-8 lg:gap-10 lg:py-10`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((tile) => (
            <div key={tile} className="card p-4">
              <div className="skeleton h-4 w-24 rounded-fluent-small" />
              <div className="skeleton mt-3 h-8 w-32 rounded-fluent-medium" />
              <div className="skeleton mt-4 h-3 w-28 rounded-fluent-small" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="card">
            <div className="border-b border-edge px-4 py-3 lg:px-5">
              <div className="skeleton h-5 w-28 rounded-fluent-small" />
            </div>
            <div className="flex flex-col gap-3 p-4 lg:p-5">
              <div className="skeleton h-3 w-full rounded-fluent-small" />
              {[0, 1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="skeleton h-6 w-full rounded-fluent-small" />
              ))}
            </div>
          </div>
          <div className="card p-4 lg:p-5">
            <div className="skeleton h-5 w-28 rounded-fluent-small" />
            <div className="skeleton mt-4 aspect-4/3 w-full rounded-fluent-medium" />
          </div>
        </div>
      </div>
    </div>
  );
}
