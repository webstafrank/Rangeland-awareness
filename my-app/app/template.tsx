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
 * (/ to /data, /data to /reports, / to /topics/...). Three moves it cannot
 * see each have a template of their own, nearer the change:
 *   one topic to another        app/topics/template.tsx
 *   one step to the next        app/topics/[topic]/template.tsx, which fades
 *                               the step and holds the rail and footer still
 *   sign in to create account   app/(auth)/template.tsx
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="page-enter" className="page-enter flex flex-1 flex-col">
      {children}
    </div>
  );
}
