/**
 * The route fade.
 *
 * A template, not a layout, because Next re-mounts a template on every
 * navigation between its child segments, and a fresh mount is what replays a
 * CSS animation. The fade itself (`page-enter`) is in globals.css; this file
 * only gives it an element to run on. No client JavaScript ships for it.
 *
 * The wrapper repeats `main`'s flex column so a page that grows with flex-1
 * (the topic flow, the map pages) still fills the screen through it.
 *
 * Scope: the root template re-mounts when the first URL segment changes
 * (/ to /data, /data to /reports, / to /topics/...). Moving between the steps
 * of one topic does not re-mount it, so the step rail and the map stay put
 * instead of flashing on every Next.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="page-enter" className="page-enter flex flex-1 flex-col">
      {children}
    </div>
  );
}
