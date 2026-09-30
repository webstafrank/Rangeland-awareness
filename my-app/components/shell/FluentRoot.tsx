"use client";

/**
 * Fluent UI React v9 at the root of the app, rendered on the server too.
 *
 * Fluent styles through Griffel, a CSS-in-JS engine that inserts atomic rules
 * at runtime. Without the three pieces below, every Fluent component would
 * arrive in the server HTML unstyled and snap into place once the client
 * bundle ran, which on a slow link is a visible flash on every page:
 *
 *   RendererProvider   one Griffel renderer for the whole tree, so the server
 *                      pass collects every rule it used into one place.
 *   useServerInsertedHTML
 *                      Next's hook for CSS-in-JS: hands those rules to the
 *                      HTML stream as <style> elements before the markup that
 *                      needs them. Once, on the first flush: the renderer is
 *                      cumulative, so a second call would duplicate it.
 *   SSRProvider        keeps Fluent's generated ids stable between the server
 *                      and the client render, so hydration matches.
 *
 * The provider's own div would paint `colorNeutralBackground1` (white) over
 * the whole app and hide the canvas grey the body sets. It is made
 * transparent with an inline style rather than a class, because Griffel's
 * rules are not in a cascade layer and so outrank every Tailwind utility,
 * which are. An inline style is the one thing that beats both.
 *
 * `webLightTheme`, unmodified: the @theme block in app/globals.css declares
 * the same values under the app's own token names, so a Fluent Button and a
 * Tailwind `bg-accent` are the same blue by construction, not by coincidence.
 */

import { useRef, useState, type ReactNode } from "react";
import { useServerInsertedHTML } from "next/navigation";
import {
  FluentProvider,
  RendererProvider,
  SSRProvider,
  createDOMRenderer,
  renderToStyleElements,
  webLightTheme,
} from "@fluentui/react-components";

export function FluentRoot({ children }: { children: ReactNode }) {
  const [renderer] = useState(() => createDOMRenderer());
  const inserted = useRef(false);

  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <>{renderToStyleElements(renderer)}</>;
  });

  return (
    <RendererProvider renderer={renderer}>
      <SSRProvider>
        <FluentProvider
          theme={webLightTheme}
          className="flex min-h-full flex-1 flex-col"
          style={{
            backgroundColor: "transparent",
            fontFamily: "var(--font-sans)",
            color: "var(--color-ink)",
          }}
        >
          {children}
        </FluentProvider>
      </SSRProvider>
    </RendererProvider>
  );
}
