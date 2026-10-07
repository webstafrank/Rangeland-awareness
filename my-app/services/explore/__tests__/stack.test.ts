import { describe, expect, it } from "vitest";
import {
  DEFAULT_STACK_OPACITY,
  EMPTY_STACK,
  stackReducer,
  type LayerStack,
  type StackAction,
} from "@/services/explore";

const run = (...actions: StackAction[]): LayerStack => actions.reduce(stackReducer, EMPTY_STACK);

describe("stackReducer", () => {
  it("puts a new layer on top, visible, at the default opacity, loading", () => {
    const stack = run({ type: "add", id: "a" }, { type: "add", id: "b" });
    expect(stack.order).toEqual(["b", "a"]);
    expect(stack.entries.b).toEqual({
      visible: true,
      opacity: DEFAULT_STACK_OPACITY,
      status: "loading",
      errorMessage: null,
    });
  });

  it("ignores adding a layer that is already on, rather than moving it", () => {
    const stack = run({ type: "add", id: "a" }, { type: "add", id: "b" });
    expect(stackReducer(stack, { type: "add", id: "a" })).toBe(stack);
  });

  it("moves a layer up and down one place, and stops at either end", () => {
    const stack = run(
      { type: "add", id: "c" },
      { type: "add", id: "b" },
      { type: "add", id: "a" },
    );
    expect(stack.order).toEqual(["a", "b", "c"]);
    expect(stackReducer(stack, { type: "move-down", id: "a" }).order).toEqual(["b", "a", "c"]);
    expect(stackReducer(stack, { type: "move-up", id: "c" }).order).toEqual(["a", "c", "b"]);
    expect(stackReducer(stack, { type: "move-up", id: "a" })).toBe(stack);
    expect(stackReducer(stack, { type: "move-down", id: "c" })).toBe(stack);
    expect(stackReducer(stack, { type: "move-up", id: "missing" })).toBe(stack);
  });

  it("hides without losing the place in the stack or the opacity", () => {
    const stack = run(
      { type: "add", id: "b" },
      { type: "add", id: "a" },
      { type: "set-opacity", id: "b", opacity: 0.3 },
      { type: "toggle", id: "b" },
    );
    expect(stack.order).toEqual(["a", "b"]);
    expect(stack.entries.b.visible).toBe(false);
    expect(stack.entries.b.opacity).toBe(0.3);
  });

  it("clamps opacity to 0..1", () => {
    const stack = run({ type: "add", id: "a" }, { type: "set-opacity", id: "a", opacity: 7 });
    expect(stack.entries.a.opacity).toBe(1);
    const zero = stackReducer(stack, { type: "set-opacity", id: "a", opacity: -1 });
    expect(zero.entries.a.opacity).toBe(0);
  });

  it("removes a layer from both the order and the entries", () => {
    const stack = run(
      { type: "add", id: "a" },
      { type: "add", id: "b" },
      { type: "remove", id: "a" },
    );
    expect(stack.order).toEqual(["b"]);
    expect(stack.entries.a).toBeUndefined();
  });

  it("records a tile failure with its message, and drops it once tiles load", () => {
    const failed = run(
      { type: "add", id: "a" },
      { type: "status", id: "a", status: "error", errorMessage: "502" },
    );
    expect(failed.entries.a).toMatchObject({ status: "error", errorMessage: "502" });
    const ready = stackReducer(failed, { type: "status", id: "a", status: "ready" });
    expect(ready.entries.a).toMatchObject({ status: "ready", errorMessage: null });
    expect(stackReducer(ready, { type: "status", id: "a", status: "ready" })).toBe(ready);
  });

  it("ignores every action for a layer that is not on the map", () => {
    const stack = run({ type: "add", id: "a" });
    for (const type of ["remove", "toggle", "move-up", "move-down"] as const) {
      expect(stackReducer(stack, { type, id: "x" })).toBe(stack);
    }
    expect(stackReducer(stack, { type: "status", id: "x", status: "ready" })).toBe(stack);
  });

  it("clears everything", () => {
    expect(run({ type: "add", id: "a" }, { type: "clear" })).toBe(EMPTY_STACK);
  });
});
