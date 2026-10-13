import type { CSSProperties } from "react";

/**
 * A place in the `.rise` entrance (app/globals.css): the element's index in
 * the order it should arrive, read there as --i.
 */
export const stagger = (index: number): CSSProperties => ({ "--i": index }) as CSSProperties;
