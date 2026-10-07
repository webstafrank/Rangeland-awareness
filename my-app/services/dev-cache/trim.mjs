#!/usr/bin/env node
/**
 * Cap Turbopack's on-disk dev cache before `next dev` starts.
 *
 * Runs as the `predev` script, so every `npm run dev` passes through it.
 *
 * Why it exists: Turbopack persists its dev cache in .next/dev/cache/turbopack
 * and never shrinks it. On the dev machine (a 5400rpm laptop HDD, ~23 MB/s
 * measured) it had grown to 685 MB. Reading it back took ~29s on its own,
 * compaction rewrote ~420 MB at a time, and the first GET / after a start
 * took 50 to 325s across ~60 sessions in .next/dev/trace. A fresh `.next`
 * compiles / in ~8s.
 *
 * Why a cap rather than turning the cache off: a small cache is the fastest
 * option there is. Measured on the same machine, time from start to / served:
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
 * .next/dev/lock with that server's pid, and a live pid means skip.
 *
 *   node services/dev-cache/trim.mjs              (what predev runs)
 *   DEV_CACHE_CAP_MB=150 npm run dev
 */

import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_CAP_MB = 300;
const MB = 1024 * 1024;

/** Total bytes of every file under `dir`; 0 when it does not exist. */
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
    if (e.isDirectory()) total += dirSize(p);
    else if (e.isFile()) total += statSync(p).size;
  }
  return total;
}

/** True when the process exists. EPERM means it exists but belongs to someone else. */
export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
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

/** Parse DEV_CACHE_CAP_MB; anything that is not a positive number falls back to the default. */
export function capFromEnv(value) {
  const n = Number(value);
  return value != null && value !== "" && Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP_MB;
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
  const sizeBytes = dirSize(cacheDir);
  const serverRunning = lockHeld(join(appDir, ".next", "dev", "lock"), isAlive);
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

// Run only when executed, so the test can import the functions without a delete.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const appDir = fileURLToPath(new URL("../../", import.meta.url));
  console.log(trimDevCache({ appDir, capMb: capFromEnv(process.env.DEV_CACHE_CAP_MB) }).message);
}
