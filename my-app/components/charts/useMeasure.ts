"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Measures an element's content width.
 *
 * The charts render at real pixel size rather than scaling a fixed viewBox,
 * because a scaled viewBox scales the strokes with it: a 2px line becomes 3.4px
 * on a wide screen and 1.2px on a narrow one, and the mark specs are in pixels
 * for a reason. Measuring costs one observer per chart and keeps every stroke
 * exact.
 *
 * `fallback` is what server rendering and the first client paint use, so the
 * chart draws something sensible before the observer fires rather than
 * collapsing to zero width and flashing.
 */
export function useMeasure<T extends HTMLElement>(fallback = 720) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // jsdom has no layout engine, so `clientWidth` is 0 in tests. Keeping the
    // fallback in that case is what lets component tests assert on real
    // geometry instead of on a degenerate zero-width chart.
    const measure = () => {
      const next = node.clientWidth;
      if (next > 0) setWidth(next);
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
