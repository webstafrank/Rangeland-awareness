/**
 * The explorer's layer stack: which layers are on the map, in what order, and
 * how each is drawn.
 *
 * `order` is TOP FIRST, the way the panel lists it and the way an analyst
 * thinks about it ("move rivers above the riparian extent"). The map draws it
 * bottom first, so the map half walks it in reverse. Keeping one canonical
 * order here, rather than one per consumer, is what stops the panel and the
 * map disagreeing about which layer is on top.
 *
 * A pure reducer, so every move is provable in node.
 */

export type StackTileStatus = "loading" | "ready" | "error";

export interface StackEntry {
  /** Hidden layers keep their place in the stack and their opacity. */
  visible: boolean;
  /** 0..1. */
  opacity: number;
  status: StackTileStatus;
  errorMessage: string | null;
}

export interface LayerStack {
  /** Layer ids on the map, top first. */
  order: readonly string[];
  entries: Readonly<Record<string, StackEntry>>;
}

export type StackAction =
  | { type: "add"; id: string }
  | { type: "remove"; id: string }
  | { type: "toggle"; id: string }
  | { type: "set-opacity"; id: string; opacity: number }
  | { type: "move-up"; id: string }
  | { type: "move-down"; id: string }
  | { type: "status"; id: string; status: StackTileStatus; errorMessage?: string | null }
  | { type: "clear" };

export const DEFAULT_STACK_OPACITY = 0.8;

export const EMPTY_STACK: LayerStack = { order: [], entries: {} };

function swap(order: readonly string[], i: number, j: number): string[] {
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function stackReducer(state: LayerStack, action: StackAction): LayerStack {
  switch (action.type) {
    case "add": {
      // Already there: adding again is a no-op, not a duplicate or a jump to
      // the top, so a double click cannot reorder the stack.
      if (state.entries[action.id] !== undefined) return state;
      return {
        // New layers go on top, where the analyst is looking for them.
        order: [action.id, ...state.order],
        entries: {
          ...state.entries,
          [action.id]: {
            visible: true,
            opacity: DEFAULT_STACK_OPACITY,
            status: "loading",
            errorMessage: null,
          },
        },
      };
    }
    case "remove": {
      if (state.entries[action.id] === undefined) return state;
      const entries = { ...state.entries };
      delete entries[action.id];
      return { order: state.order.filter((id) => id !== action.id), entries };
    }
    case "toggle": {
      const entry = state.entries[action.id];
      if (entry === undefined) return state;
      return {
        ...state,
        entries: { ...state.entries, [action.id]: { ...entry, visible: !entry.visible } },
      };
    }
    case "set-opacity": {
      const entry = state.entries[action.id];
      if (entry === undefined) return state;
      const opacity = Math.min(1, Math.max(0, action.opacity));
      if (opacity === entry.opacity) return state;
      return {
        ...state,
        entries: { ...state.entries, [action.id]: { ...entry, opacity } },
      };
    }
    case "move-up": {
      const index = state.order.indexOf(action.id);
      if (index <= 0) return state;
      return { ...state, order: swap(state.order, index, index - 1) };
    }
    case "move-down": {
      const index = state.order.indexOf(action.id);
      if (index === -1 || index === state.order.length - 1) return state;
      return { ...state, order: swap(state.order, index, index + 1) };
    }
    case "status": {
      const entry = state.entries[action.id];
      if (entry === undefined) return state;
      const errorMessage = action.status === "error" ? (action.errorMessage ?? null) : null;
      // Tiles report on every load; unchanged reports must not re-render.
      if (entry.status === action.status && entry.errorMessage === errorMessage) return state;
      return {
        ...state,
        entries: {
          ...state.entries,
          [action.id]: { ...entry, status: action.status, errorMessage },
        },
      };
    }
    case "clear":
      return state.order.length === 0 ? state : EMPTY_STACK;
  }
}
