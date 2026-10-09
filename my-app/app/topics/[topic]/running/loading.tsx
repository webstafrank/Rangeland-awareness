import { FRAME } from "@/components/shell/Page";

/**
 * Shown while the running route reads the run's status on the server.
 *
 * The same two columns RunningScreen draws (status card, stage timeline), in
 * grey blocks, so nothing jumps when the real screen lands. No progressbar and
 * no live region here: the running screen owns the one of each, and the evals
 * look both up by role.
 */
export default function Loading() {
  return (
    <div className={`${FRAME} py-8 lg:py-10`} aria-busy="true">
      <p className="sr-only">Loading the run</p>
      <div
        aria-hidden="true"
        className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
      >
        <div className="card p-4 lg:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="skeleton h-6 w-24 rounded-fluent-medium" />
            <div className="skeleton h-4 w-28 rounded-fluent-small" />
          </div>
          <div className="skeleton mt-4 h-7 w-40 rounded-fluent-medium" />
          <div className="skeleton mt-2 h-5 w-3/4 rounded-fluent-small" />
          <div className="skeleton mt-5 h-24 w-full rounded-fluent-large" />
        </div>
        <div className="card">
          <div className="border-b border-edge px-4 py-3 lg:px-5">
            <div className="skeleton h-5 w-20 rounded-fluent-small" />
          </div>
          <div className="flex flex-col gap-5 px-4 py-4 lg:px-5">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
                <div className="skeleton h-4 min-w-0 flex-1 rounded-fluent-small" />
                <div className="skeleton h-6 w-20 shrink-0 rounded-fluent-medium" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
