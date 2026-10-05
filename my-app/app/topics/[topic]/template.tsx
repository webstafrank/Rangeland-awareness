/**
 * The step fade: every move inside one topic fades the new step in.
 *
 * Sits under the topic band (layout > template > page), so the band never
 * fades, and re-mounts each time the step segment changes (/topics/x to
 * /topics/x/areas, review to running, running to results).
 *
 * What fades depends on the page, and CSS decides it (globals.css, step-enter):
 *
 *   The four wizard steps render StepShell, whose rail and sticky footer are
 *   the same on every step. Fading those would flash the furniture that is
 *   meant to stay put, so StepShell marks its rail data-step-rail, this
 *   wrapper stays still, and only StepShell's step-body fades.
 *
 *   The running and results pages, and the problem screens, have no rail.
 *   The whole wrapper fades.
 *
 * Decided by :has() rather than by reading the pathname here, so this stays a
 * server component with no JavaScript, and a new step that renders StepShell
 * gets the right fade without anyone editing this file.
 */
export default function StepTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="step-enter" className="step-enter flex flex-1 flex-col">
      {children}
    </div>
  );
}
