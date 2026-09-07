/**
 * The contract boundary.
 *
 * Services communicate through these types only. A page or a service that
 * reaches into another service's internals instead of importing from here is a
 * bug, not a shortcut.
 */
export * from "./catalog";
export * from "./geo";
export * from "./analysis";
export * from "./auth";
