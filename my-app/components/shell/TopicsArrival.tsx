"use client";

import { useEffect } from "react";

/**
 * Plays the topic cards' entrance when someone arrives at the homepage's
 * #topics section: Run Analysis in the hero, the header's Analysis link, or
 * opening /#topics from anywhere, Back included.
 *
 * Why not :target. Every way in is a next/link, and Next moves to a hash with
 * history.pushState, which never updates :target. A plain <a href="#topics">
 * would, but its history entry carries no Next state, Next's popstate handler
 * ignores state-less entries, and Back from a topic then left the topic page
 * on screen under the homepage URL. So the links stay next/link, Next keeps
 * owning history and the scroll, and this island sets data-arriving on the
 * section, which is what globals.css keys topic-arrive on.
 *
 * It also moves focus to the section heading (tabIndex -1, no scroll), so a
 * screen reader announces where the click went and the next Tab is the first
 * card. Programmatic focus after a mouse click shows no focus ring.
 *
 * Renders nothing. Under reduced motion the CSS plays no animation, the
 * attribute comes straight off, and the focus move still happens.
 */
export default function TopicsArrival({ id }: { id: string }) {
  useEffect(() => {
    const section = document.getElementById(id);
    if (!section) return;
    let run = 0;

    const arrive = () => {
      const token = ++run;
      // Off, a forced style flush, then on: a second arrival restarts the
      // animation rather than finding the attribute already set.
      section.removeAttribute("data-arriving");
      void section.offsetWidth;
      section.setAttribute("data-arriving", "");
      section.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
      // Off again once every card has finished, so the section's own scroll
      // reveal is back for the next time it is scrolled to by hand. The
      // optional call is for jsdom, which has no Web Animations API.
      Promise.all((section.getAnimations?.({ subtree: true }) ?? []).map((a) => a.finished))
        .catch(() => {})
        .then(() => {
          if (token === run) section.removeAttribute("data-arriving");
        });
    };

    const onClick = (event: MouseEvent) => {
      // A modified click opens a new tab and does not scroll this page.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      const url = new URL(link.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.hash === `#${id}`) {
        // Already at /#topics (scrolled back up by hand): Next sees the same
        // URL and does not scroll, so the click would do nothing visible.
        // No options, so the html rule decides smooth or instant and
        // scroll-margin still applies.
        if (location.hash === url.hash) section.scrollIntoView();
        arrive();
      }
    };

    // Arrived from another page, by Back, or by a reload of /#topics.
    if (location.hash === `#${id}`) arrive();
    document.addEventListener("click", onClick);
    return () => {
      run++;
      document.removeEventListener("click", onClick);
    };
  }, [id]);

  return null;
}
