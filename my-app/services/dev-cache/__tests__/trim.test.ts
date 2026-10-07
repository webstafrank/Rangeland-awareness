/**
 * The predev cache cap.
 *
 * The failure this guards against is the one that made `npm run dev` take
 * minutes: a Turbopack cache that only grows. The other direction matters as
 * much: deleting the cache out from under a running server, or treating a
 * stale lock left by a crash as live and so never trimming again.
 *
 * Real temp directories rather than mocks, because the bug class here is
 * filesystem shape (nested dirs, a missing cache, a junk lock file).
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CAP_MB,
  capFromEnv,
  decide,
  dirSize,
  lockHeld,
  main,
  pidAlive,
  trimDevCache,
} from "@/services/dev-cache/trim.mjs";

const MB = 1024 * 1024;

let app: string;
const cacheDir = () => join(app, ".next", "dev", "cache", "turbopack");
const lockPath = () => join(app, ".next", "dev", "lock");

/** Lay down a cache of `mb` megabytes, split across a nested dir like Turbopack's. */
function writeCache(mb: number) {
  const dir = join(cacheDir(), "v16.3.8-test");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "00000001.sst"), Buffer.alloc(Math.floor((mb * MB) / 2)));
  writeFileSync(join(cacheDir(), "CURRENT"), Buffer.alloc(Math.ceil((mb * MB) / 2)));
}

function writeLock(contents: string) {
  mkdirSync(join(app, ".next", "dev"), { recursive: true });
  writeFileSync(lockPath(), contents);
}

beforeEach(() => {
  app = mkdtempSync(join(tmpdir(), "dev-cache-"));
});
afterEach(() => {
  rmSync(app, { recursive: true, force: true });
});

describe("decide", () => {
  it("keeps a cache at exactly the cap and trims one byte over", () => {
    expect(decide({ sizeBytes: 300 * MB, capMb: 300, serverRunning: false })).toBe("keep");
    expect(decide({ sizeBytes: 300 * MB + 1, capMb: 300, serverRunning: false })).toBe("trim");
  });

  it("never trims under a running server, however large", () => {
    expect(decide({ sizeBytes: 5000 * MB, capMb: 300, serverRunning: true })).toBe("skip-running");
  });

  it("reports a missing cache as absent rather than kept", () => {
    expect(decide({ sizeBytes: 0, capMb: 300, serverRunning: true })).toBe("absent");
  });
});

describe("capFromEnv", () => {
  it.each([
    [undefined, DEFAULT_CAP_MB, false],
    ["", DEFAULT_CAP_MB, false],
    ["abc", DEFAULT_CAP_MB, true],
    ["0", DEFAULT_CAP_MB, true],
    ["-5", DEFAULT_CAP_MB, true],
    ["150", 150, false],
    ["0.5", 0.5, false],
  ])("%j -> %d (rejected: %s)", (value, capMb, rejected) => {
    expect(capFromEnv(value)).toEqual({ capMb, rejected });
  });
});

describe("pidAlive", () => {
  it("is false for a pid with no process", () => {
    // Above Linux's pid_max ceiling, so never a real process.
    expect(pidAlive(2 ** 22 + 1)).toBe(false);
  });

  it("is false when the pid was reused by something that is not Next", () => {
    expect(pidAlive(process.pid, () => "/opt/google/chrome/chrome\0--type=gpu")).toBe(false);
  });

  it("is true when the pid is a Next server", () => {
    expect(pidAlive(process.pid, () => "next-server (v16.3.8)")).toBe(true);
  });

  it("falls back to liveness where there is no /proc", () => {
    const noProc = () => {
      throw Object.assign(new Error("no /proc"), { code: "ENOENT" });
    };
    expect(pidAlive(process.pid, noProc)).toBe(true);
  });
});

describe("lockHeld", () => {
  it("is held when the lock's pid is alive", () => {
    writeLock(JSON.stringify({ pid: 4242, port: 3000 }));
    expect(lockHeld(lockPath(), (pid: number) => pid === 4242)).toBe(true);
  });

  it("is not held when the pid is dead, i.e. a lock left by a crash", () => {
    writeLock(JSON.stringify({ pid: 4242 }));
    expect(lockHeld(lockPath(), () => false)).toBe(false);
  });

  it.each([["no file", null], ["junk", "not json"], ["no pid", "{}"], ["bad pid", '{"pid":"x"}']])(
    "is not held with %s",
    (_label, contents) => {
      if (contents !== null) writeLock(contents);
      expect(lockHeld(lockPath(), () => true)).toBe(false);
    },
  );

  it("is not held by a live pid that is not a Next server", () => {
    // The real check, against this vitest worker: alive, but its cmdline is node + vitest.
    writeLock(JSON.stringify({ pid: process.pid }));
    expect(lockHeld(lockPath(), (pid: number) => pidAlive(pid, () => "node vitest"))).toBe(false);
  });
});

describe("main", () => {
  it("logs a rejected cap and still runs with the default", () => {
    const lines: string[] = [];
    main({ appDir: app, env: { DEV_CACHE_CAP_MB: "0" }, log: (l: string) => lines.push(l) });
    expect(lines[0]).toMatch(/DEV_CACHE_CAP_MB="0" is not a positive number, using 300/);
    expect(lines[1]).toBe("[dev-cache] no Turbopack cache yet");
  });

  it("never throws, so a filesystem error cannot stop next dev starting", () => {
    // A file where the .next directory should be: every read below it fails with ENOTDIR.
    writeFileSync(join(app, ".next"), "not a directory");
    const lines: string[] = [];
    expect(() => main({ appDir: app, env: {}, log: (l: string) => lines.push(l) })).not.toThrow();
    expect(lines.at(-1)).toMatch(/^\[dev-cache\] skipped, ENOTDIR; starting dev anyway$/);
  });
});

describe("dirSize", () => {
  it("sums nested files and returns 0 for a missing dir", () => {
    expect(dirSize(cacheDir())).toBe(0);
    writeCache(2);
    expect(dirSize(cacheDir())).toBe(2 * MB);
  });
});

describe("trimDevCache", () => {
  it("clears an oversized cache and leaves the rest of .next alone", () => {
    writeCache(3);
    writeLock(JSON.stringify({ pid: 4242 }));
    const { action, message } = trimDevCache({ appDir: app, capMb: 2, isAlive: () => false });
    expect(action).toBe("trim");
    expect(message).toMatch(/3 MB was over the 2 MB cap, cleared/);
    expect(existsSync(cacheDir())).toBe(false);
    expect(existsSync(lockPath())).toBe(true);
  });

  it("keeps a cache under the cap", () => {
    writeCache(1);
    const { action } = trimDevCache({ appDir: app, capMb: 2, isAlive: () => false });
    expect(action).toBe("keep");
    expect(dirSize(cacheDir())).toBe(1 * MB);
  });

  it("leaves an oversized cache in place while a server holds the lock", () => {
    writeCache(3);
    writeLock(JSON.stringify({ pid: 4242 }));
    const { action, message } = trimDevCache({ appDir: app, capMb: 2, isAlive: () => true });
    expect(action).toBe("skip-running");
    expect(message).toMatch(/stop it and rerun/);
    expect(dirSize(cacheDir())).toBe(3 * MB);
  });

  it("handles an app that has never run dev", () => {
    expect(trimDevCache({ appDir: app }).action).toBe("absent");
  });
});
