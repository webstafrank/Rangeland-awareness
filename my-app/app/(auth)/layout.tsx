import type { ReactNode } from "react";
import { Checkmark16Regular } from "@/components/ui/icons";
import { Graticule } from "@/components/ui/Graticule";

/**
 * Two panels: the form, and beside it the reason to have an account.
 *
 * Both are light. The navy sidebar is the application frame and already
 * carries the brand (on a phone the top bar carries the mark), so this page
 * is content beside it: the form on white (`band-chrome`, which sets the
 * white ground and the ink together), the explanation on the cool page grey,
 * opened by a 3px accent rule. A navy panel here ran straight into the navy
 * sidebar with no edge between them and repeated the logos and the name.
 *
 * The plus-grid sits only in the panel's lower part, faded out towards the
 * copy by a mask, so no mark ever sits under a word. It is hidden on a phone,
 * where the panel is only as tall as its text.
 *
 * The copy says only what the build does. The session carries a name and an
 * email and nothing else (services/auth/README.md), so the panel does not
 * promise saved runs or history: it says they are not built.
 *
 * The form comes first in the DOM, so on a phone it is the first thing on
 * screen and first in the tab order; from lg up the explanation moves to the
 * left visually. The form fade lives in template.tsx, inside this layout, so
 * only the form animates between /login and /signup (journey M8).
 *
 * The form side is a `div`, not a second `<main>`: the root layout already
 * renders the one `<main id="main">` the skip link targets. Typed as a plain
 * `children` prop because a route group has no route literal of its own.
 */
const FACTS = [
  "All four topics, all 47 counties and every model, as a guest",
  "Nothing gated, nothing behind a paywall",
  "Signing in puts your name and email on this browser's session",
] as const;

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="band-chrome flex items-start justify-center px-gutter py-8 sm:px-10 lg:items-center lg:py-14">
        <div className="w-full max-w-sm">{children}</div>
      </div>

      <aside className="relative overflow-hidden border-t border-edge bg-page text-ink lg:order-first lg:border-t-0 lg:border-r">
        <div aria-hidden="true" className="rule-action h-[3px] w-full" />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 hidden h-1/3 [mask-image:linear-gradient(to_top,black,transparent)] lg:block"
        >
          <Graticule />
        </div>

        <div className="relative max-w-md px-gutter py-8 sm:px-10 lg:py-14">
          <p className="eyebrow">Why an account</p>
          <h2 className="type-title3 mt-2 text-ink">Every topic is open without one.</h2>
          <p className="type-body1 mt-3 text-ink-muted">
            An account does not unlock analysis. In this build it names your session, so the app
            shows who is working. Saving runs to an account is not built yet.
          </p>

          <ul className="mt-5 flex flex-col gap-2.5">
            {FACTS.map((item) => (
              <li key={item} className="type-body1 flex items-start gap-2.5 text-ink">
                <Checkmark16Regular aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
