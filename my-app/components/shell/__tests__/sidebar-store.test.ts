import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SIDEBAR_STORAGE_KEY,
  getSidebarServerSnapshot,
  getSidebarSnapshot,
  resetSidebarStoreForTests,
  setSidebarCollapsed,
  subscribeSidebar,
} from "@/components/shell/sidebar-store";

beforeEach(() => {
  localStorage.clear();
  resetSidebarStoreForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sidebar store", () => {
  it("renders expanded on the server, whatever storage says", () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, "1");
    expect(getSidebarServerSnapshot()).toBe(false);
  });

  it("reads a stored collapse on the client", () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, "1");
    expect(getSidebarSnapshot()).toBe(true);
  });

  it("persists a change and tells subscribers", () => {
    const heard = vi.fn();
    const off = subscribeSidebar(heard);
    setSidebarCollapsed(true);
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("1");
    expect(getSidebarSnapshot()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    off();
    setSidebarCollapsed(false);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("does not notify when nothing changed", () => {
    const heard = vi.fn();
    subscribeSidebar(heard);
    setSidebarCollapsed(false);
    expect(heard).not.toHaveBeenCalled();
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getSidebarSnapshot()).toBe(false);
    expect(() => setSidebarCollapsed(true)).not.toThrow();
    expect(getSidebarSnapshot()).toBe(true);
  });
});
