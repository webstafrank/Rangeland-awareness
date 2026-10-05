/**
 * The topic fade: going from one topic straight to another fades the new one in.
 *
 * The root template does not cover this. Its child segment is `topics` for
 * every topic, so /topics/flood to /topics/drought does not re-mount it. This
 * one's child segment is the topic itself, so it re-mounts exactly when the
 * topic changes, and not when the step under that topic does (that is
 * app/topics/[topic]/template.tsx).
 *
 * Arriving from another section re-mounts this and the root template
 * together. Both are opacity fades with the same curve and length, so they
 * run as one slightly steeper fade, not two in a row.
 */
export default function TopicsTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="topic-enter" className="page-enter flex flex-1 flex-col">
      {children}
    </div>
  );
}
