/**
 * The data explorer's model: which layers exist, under which headings, and
 * the stack of those on the map. No React, no MapLibre, no `window`, so all of
 * it is tested in the node lane. Import from here, never from a file inside.
 */
export * from "./categories";
export * from "./layers";
export * from "./stack";
export * from "./popup";
