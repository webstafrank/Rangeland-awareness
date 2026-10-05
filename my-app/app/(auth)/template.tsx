/**
 * The form fade: Sign in to Create account, and back, fades the new form in.
 *
 * The root template cannot see this move. A route group adds no URL segment,
 * so /login and /signup are both its `(auth)` child and it never re-mounts
 * between them. This template sits inside the auth layout, around the form
 * only, so the brand panel beside it holds still while the form changes.
 */
export default function AuthTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="form-enter" className="content-enter">
      {children}
    </div>
  );
}
