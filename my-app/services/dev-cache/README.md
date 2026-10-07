# dev-cache

Caps Turbopack's on-disk dev cache (`.next/dev/cache/turbopack`) so `npm run dev`
stays fast. Runs as the `predev` script and prints one line on every start:

```
[dev-cache] 92 MB, under the 300 MB cap, kept
[dev-cache] 683 MB was over the 300 MB cap, cleared; this start recompiles from scratch
[dev-cache] 683 MB is over the 300 MB cap, but a dev server is running on it; stop it and rerun to clear
```

## Why

The cache only grows. On the dev machine's 5400rpm HDD (~23 MB/s) it reached
685 MB, and the first `GET /` after a start took 50 to 325s. A fresh cache
serves `/` 3.7s after a warm restart, against 9.2s with the cache off, so the
cache is kept and only cleared once it has outgrown that benefit. Measurements
and reasoning are in the header of `trim.mjs`.

## Use

| | |
|---|---|
| Normal | `npm run dev` (trim runs first) |
| Different cap | `DEV_CACHE_CAP_MB=150 npm run dev` |
| Run alone | `node services/dev-cache/trim.mjs` |
| Tests | `npm test -- services/dev-cache` |

It never deletes under a running server: Next records that server's pid in
`.next/dev/lock`, and a pid that is alive and still a Next process means skip.
A lock left behind by a crash does not block the trim, whether its pid is dead
or has since been reused by another program (checked via `/proc/<pid>/cmdline`
on Linux; elsewhere a live pid is treated as a running server).

It is best-effort. Any filesystem error is logged as
`[dev-cache] skipped, <code>; starting dev anyway` and the script exits 0, so
it can never stop `next dev` from starting. A `DEV_CACHE_CAP_MB` that is not a
positive number is logged and replaced with the 300 MB default.

Plain `.mjs` rather than TypeScript so `predev` runs it with bare `node`, no
loader and no build step in front of every dev start.
