#!/usr/bin/env bash
# Bring this checkout's main up to date with origin/main, then make the running
# app match it.
#
#   scripts/sync.sh              # from anywhere inside the repo
#   scripts/sync.sh --no-docker  # update the code and deps, leave containers alone
#
# Run it after a PR merges. In order, it:
#
#   1. Refuses unless you are on main with no uncommitted changes to tracked
#      files. Untracked files are fine: every way main moves below refuses,
#      rather than overwrite one, if origin now tracks a file of that name.
#   2. Fetches origin and moves main to origin/main:
#        - behind:   fast-forward.
#        - ahead:    stops. Commits that exist only on your main go out
#                    through a branch and a PR, not by this script.
#        - diverged: if origin/main already contains everything on your main,
#                    byte for byte (the rebased or squashed copies a merged
#                    PR leaves behind), it saves your main as
#                    backup-main-<time> and moves main to origin/main.
#                    Otherwise it stops and lists the commits involved.
#   3. Runs `npm ci` in my-app/ if package-lock.json changed, or if
#      node_modules is missing.
#   4. Rebuilds the docker compose services that are running AND whose image
#      inputs changed (`docker compose up -d --build <those>`). Stopped
#      services are left stopped. `npm run dev` needs nothing; it reloads by
#      itself (restart it if step 3 ran, since npm ci replaces node_modules).
#
# Steps 3 and 4 compare against the commit the last fully successful run
# finished at (kept in .git/sync-last), not just this run's pull, so a failed
# npm ci or docker build is retried by simply running this again, a manual
# `git pull` beforehand is still picked up, and containers skipped with
# --no-docker are rebuilt by the next run without it.
#
# Never pushes, never touches another branch, never moves main without a
# backup branch when commits would leave it. Exit status is non-zero on any stop.
#
# Tests: scripts/tests/test_sync.sh, which CI runs.

set -euo pipefail

say() { printf '%s\n' "$*"; }
stop() { printf 'sync: %s\n' "$*" >&2; exit 1; }

docker_on=1
for arg in "$@"; do
  case "$arg" in
    --no-docker) docker_on=0 ;;
    -h | --help) sed -n '2,/^$/s/^# \{0,1\}//p' "$0"; exit 0 ;;
    *) stop "unknown option: $arg (try --help)" ;;
  esac
done

root=$(git rev-parse --show-toplevel 2>/dev/null) || stop "not inside a git repository"
cd "$root"

# ------------------------------------------------------------------ 1. guards
branch=$(git branch --show-current)
[ "$branch" = main ] || stop "on '${branch:-a detached HEAD}', not main. Run: git switch main"

dirty=$(git status --porcelain --untracked-files=no)
[ -z "$dirty" ] || stop "uncommitted changes to tracked files, commit or stash them first:
$dirty"

git remote get-url origin >/dev/null 2>&1 || stop "this checkout has no remote named origin"

# ------------------------------------------------------------------ 2. update
say "fetching origin"
git fetch --quiet origin || stop "git fetch origin failed (offline?). Nothing was changed."
new=$(git rev-parse -q --verify 'origin/main^{commit}') || stop "origin has no main branch"
old=$(git rev-parse HEAD)

if [ "$old" = "$new" ]; then
  say "main is already at origin/main ($(git log -1 --format='%h %s' HEAD))"
elif git merge-base --is-ancestor "$old" "$new"; then
  git merge --quiet --ff-only origin/main || stop "fast-forward refused (see git's message above). Nothing was changed."
  say "main fast-forwarded:"
  git --no-pager log --oneline "$old..$new"
elif git merge-base --is-ancestor "$new" "$old"; then
  stop "main has commits that are not on origin. Push them on a branch and open a PR:
$(git --no-pager log --oneline "$new..$old")"
else
  # Does origin/main already hold everything local main has? Two exact proofs,
  # either is enough. Both compare whole trees byte for byte, so unlike git
  # cherry (whose patch ids ignore whitespace) a change that only moved
  # Python indentation is never mistaken for landed, and both see what cherry
  # cannot: a squash, and a merge commit carrying its own edit.
  #
  #   a. Origin once had exactly this tree. A PR that rebased the whole local
  #      stack reproduces its tip's tree, so some commit since the fork point
  #      matches; everything after it is upstream's own later edits. This is
  #      the common case, and the one (b) misses when upstream later edited
  #      the same lines again, which reads as a conflict to a merge.
  #   b. Merging local main into origin/main in memory changes nothing: the
  #      result is exactly origin/main's tree. Covers a squash or a partial
  #      rebase that (a) cannot match.
  head_tree=$(git rev-parse 'HEAD^{tree}')
  fork=$(git merge-base origin/main HEAD 2>/dev/null) || fork=""
  landed=0
  git log --format=%T "${fork:+$fork..}origin/main" | grep -qx "$head_tree" && landed=1
  if [ "$landed" = 0 ]; then
    merged=$(git merge-tree --write-tree origin/main HEAD 2>/dev/null | head -n 1) || merged=""
    [ "$merged" = "$(git rev-parse 'origin/main^{tree}')" ] && landed=1
  fi
  if [ "$landed" = 0 ]; then
    stop "main and origin/main have diverged, and your main has changes origin does not:
$(git --no-pager log --oneline "$new..$old")
Nothing was changed. Move them to a branch and open a PR, then run this again."
  fi
  backup="backup-main-$(date +%Y%m%d-%H%M%S)"
  while git rev-parse -q --verify "refs/heads/$backup" >/dev/null; do backup="$backup-1"; done
  git branch "$backup" "$old"
  # --keep, not --hard: it refuses, and changes nothing, if an untracked file
  # is in the way of a file origin now tracks. --hard would overwrite it.
  if ! git reset --quiet --keep origin/main; then
    git branch --quiet -D "$backup"
    stop "an untracked file is in the way (see git's message above). Move it aside and run this again. Nothing was changed."
  fi
  say "main had diverged, but origin/main already contains all of it."
  say "moved main to origin/main; the old main is saved as $backup"
  say "  (undo: git reset --keep $backup)"
fi

# ----------------------------------------------------- what the app must catch up on
# From the last fully successful run's commit when that is still known and is
# an ancestor of where main is now, so a failed step is retried; otherwise
# from where main was when this run started.
marker=$(git rev-parse --git-path sync-last)
since=$old
if [ -f "$marker" ]; then
  last=$(cat "$marker")
  git merge-base --is-ancestor "$last" HEAD 2>/dev/null && since=$last
fi
changed=""
[ "$since" = "$new" ] || changed=$(git diff --name-only "$since" "$new")
# Recorded before the steps below, so if one of them fails the next run
# still starts from here rather than from the main this run already moved.
printf '%s\n' "$since" >"$marker"

touched() { # touched <path or dir/>...: did a changed file start with one of these?
  local p f
  while IFS= read -r f; do
    for p in "$@"; do
      [[ -n "$f" && "$f" == "$p"* ]] && return 0
    done
  done <<<"$changed"
  return 1
}

# ------------------------------------------------------------- 3. dependencies
if [ -f my-app/package-lock.json ]; then
  if [ ! -d my-app/node_modules ]; then
    say "my-app/node_modules is missing: npm ci"
    (cd my-app && npm ci --no-audit --no-fund) || stop "npm ci failed. Fix it and run this again; it will retry."
  elif touched my-app/package-lock.json; then
    say "my-app/package-lock.json changed: npm ci (restart npm run dev if it is running)"
    (cd my-app && npm ci --no-audit --no-fund) || stop "npm ci failed. Fix it and run this again; it will retry."
  fi
fi

# --------------------------------------------------------------- 4. containers
# What each image is built from, read off Dockerfile.web and Dockerfile.backend
# (both build with the repo root as context). The web image copies only
# my-app/; the app's @/contracts is my-app/contracts, not the root contracts/.
web_inputs=(my-app/ Dockerfile.web docker-compose.yml .dockerignore)
backend_inputs=(services/backend/ contracts/ Dockerfile.backend docker-compose.yml .dockerignore)

if [ "$docker_on" = 1 ] && [ -n "$changed" ] && command -v docker >/dev/null 2>&1; then
  # Fails when the daemon is down or .env is missing (the compose file has
  # required variables). Said out loud, so a skipped rebuild is never silent.
  if ! running=$(docker compose ps --services --status running 2>/dev/null); then
    running=""
    say "docker compose ps failed (daemon down, or no .env?): containers not checked"
  fi
  rebuild=()
  for svc in $running; do
    case "$svc" in
      web) touched "${web_inputs[@]}" && rebuild+=(web) ;;
      backend) touched "${backend_inputs[@]}" && rebuild+=(backend) ;;
    esac
  done
  if [ "${#rebuild[@]}" -gt 0 ]; then
    say "rebuilding running containers: ${rebuild[*]}"
    docker compose up -d --build "${rebuild[@]}" || stop "docker compose build failed. Fix it and run this again; it will retry."
  elif [ -n "$running" ]; then
    say "running containers ($(printf '%s' "$running" | tr '\n' ' ' | sed 's/ $//')) are unaffected by this update"
  fi
fi

# Only now: every step above finished, so the next run starts from here.
# Not after --no-docker with changes, since the containers were deliberately
# skipped: the next full run still has to see those changes to rebuild them.
if [ "$docker_on" = 1 ] || [ -z "$changed" ]; then
  git rev-parse HEAD >"$marker"
fi
say "done: main is at $(git log -1 --format='%h %s' HEAD)"
