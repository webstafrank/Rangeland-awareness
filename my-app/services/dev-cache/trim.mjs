#!/usr/bin/env node
/**
 * Cap Turbopack's on-disk dev cache before `next dev` starts.
 *
 * Runs as the `predev` script, so every `npm run dev` passes through it. It is
 * best-effort: any error is logged and the script still exits 0, because a
 * speed-up that can stop `next dev` from starting is worse than none.
 *
 * Why it exists: Turbopack persists its dev cache in .next/dev/cache/turbopack
 * and never shrinks it. On the dev machine (a 5400rpm laptop HDD, ~23 MB/s
 * measured) it had grown to 685 MB. Reading it back took ~29s on its own,
 * compaction rewrote ~420 MB at a time, and the first GET / after a start
 * took 50 to 325s across ~60 sessions in .next/dev/trace. On a fresh `.next`
 * the compile of / itself takes ~6 to 8s (Next's own "next.js:" timing).
 *
 * Why a cap rather than turning the cache off: a small cache is the fastest
 * option on a warm restart. Measured on the same machine, wall clock from
 * process start to / served:
 *
 *                          fresh .next   restart, cold disk   restart, warm
 *   cache on, small            14.8s            55.8s               3.7s
 *   cache off                  10.3s            37.2s               9.2s
 *
 * So the cache is kept, and only cleared when it has grown past the point
 * where reading it costs more than rebuilding. 300 MB is ~13s of reads at the
 * measured disk speed, against ~90 MB for a cache warmed across every route.
 * Override with DEV_CACHE_CAP_MB.
 *
 * It never clears a cache a running dev server is using: Next writes
 * .next/dev/lock with that server's pid, and a live pid that is still a Next
 * process means skip. A lock left by a crash, whose pid is dead or now belongs
 * to some other program, does not block the trim.
 *
 *   node services/dev-cache/trim.mjs              (what predev runs)
 *   DEV_CACHE_CAP_MB=150 npm run dev
 */

import { readFileSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_CAP_MB = 300;
const MB = 1024 * 1024;

/**
 * Total bytes of every file under `dir`; 0 when it does not exist. A file or
 * directory that disappears mid-walk counts as 0 rather than throwing, since
 * Turbopack replaces its .sst files while it compacts.
 */
export function dirSize(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return 0;
    throw err;
  }
  let total = 0;
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      total += dirSize(p);
    } else if (e.isFile()) {
      try {
        total += statSync(p).size;
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
    }
  }
  return total;
}

/**
 * True when `pid` is a running Next process. Where /proc exists (Linux) the
 * command line is checked, so a pid the OS has since handed to an unrelated
 * program does not count; elsewhere a live pid is the best available signal.
 * EPERM means the process exists but belongs to another user.
 */
export function pidAlive(pid, readCmdline = (p) => readFileSync(`/proc/${p}/cmdline`, "utf8")) {
  try {
    process.kill(pid, 0);
  } catch (err) {
    if (err.code !== "EPERM") return false;
  }
  let cmdline;
  try {
    cmdline = readCmdline(pid);
  } catch {
    return true;
  }
  return /next/.test(cmdline);
}

/**
 * Whether a dev server currently holds .next/dev/lock. A missing, unreadable
 * or pid-less lock is not held: Next leaves the file behind after a crash, and
 * treating a stale lock as live would stop the cap from ever firing.
 */
export function lockHeld(lockPath, isAlive = pidAlive) {
  let pid;
  try {
    pid = JSON.parse(readFileSync(lockPath, "utf8")).pid;
  } catch {
    return false;
  }
  return Number.isInteger(pid) && pid > 0 && isAlive(pid);
}

/**
 * Parse DEV_CACHE_CAP_MB. Anything that is not a positive number falls back to
 * the default, and `rejected` says so, so the log can tell the user.
 */
export function capFromEnv(value) {
  if (value == null || value === "") return { capMb: DEFAULT_CAP_MB, rejected: false };
  const n = Number(value);
  return Number.isFinite(n) && n > 0
    ? { capMb: n, rejected: false }
    : { capMb: DEFAULT_CAP_MB, rejected: true };
}

/** The decision, separated from the filesystem so it can be tested exhaustively. */
export function decide({ sizeBytes, capMb, serverRunning }) {
  if (sizeBytes === 0) return "absent";
  if (sizeBytes <= capMb * MB) return "keep";
  if (serverRunning) return "skip-running";
  return "trim";
}

/** Measure, decide, act, and return one log line describing what happened. */
export function trimDevCache({ appDir, capMb = DEFAULT_CAP_MB, isAlive = pidAlive }) {
  const cacheDir = join(appDir, ".next", "dev", "cache", "turbopack");
  // Lock first: walking a cache a live server is compacting is the riskier read.
  const serverRunning = lockHeld(join(appDir, ".next", "dev", "lock"), isAlive);
  const sizeBytes = dirSize(cacheDir);
  const action = decide({ sizeBytes, capMb, serverRunning });
  const size = `${Math.round(sizeBytes / MB)} MB`;

  switch (action) {
    case "absent":
      return { action, message: "[dev-cache] no Turbopack cache yet" };
    case "keep":
      return { action, message: `[dev-cache] ${size}, under the ${capMb} MB cap, kept` };
    case "skip-running":
      return {
        action,
        message: `[dev-cache] ${size} is over the ${capMb} MB cap, but a dev server is running on it; stop it and rerun to clear`,
      };
    case "trim":
      rmSync(cacheDir, { recursive: true, force: true });
      return {
        action,
        message: `[dev-cache] ${size} was over the ${capMb} MB cap, cleared; this start recompiles from scratch`,
      };
  }
}

/**
 * The predev entry point. Never throws, so it can never stop `next dev` starting.
 *
 * @param {{ appDir: string, env?: Record<string, string | undefined>, log?: (line: string) => void }} opts
 */
export function main({ appDir, env = process.env, log = console.log }) {
  try {
    const { capMb, rejected } = capFromEnv(env.DEV_CACHE_CAP_MB);
    if (rejected) {
      log(`[dev-cache] DEV_CACHE_CAP_MB=${JSON.stringify(env.DEV_CACHE_CAP_MB)} is not a positive number, using ${capMb}`);
    }
    log(trimDevCache({ appDir, capMb }).message);
  } catch (err) {
    log(`[dev-cache] skipped, ${err.code ?? err.message}; starting dev anyway`);
  }
}

/**
 * Whether this module is the process entry point. Node reports
 * `import.meta.url` as the real path but leaves argv[1] as typed, so both are
 * resolved through symlinks before comparing, or a symlinked checkout would
 * silently never trim.
 */
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main({ appDir: fileURLToPath(new URL("../../", import.meta.url)) });
}
