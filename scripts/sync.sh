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
#      files. Untracked files are fine; git refuses on its own if one would
#      be overwritten.
#   2. Fetches origin and moves main to origin/main:
#        - behind:   fast-forward.
#        - ahead:    stops. Commits that exist only on your main go out
#                    through a branch and a PR, not by this script.
#        - diverged: if every local-only commit already landed on origin as a
#                    different commit (a rebase or a cherry-pick, like the
#                    rebased copies after a PR merge), it saves main to
#                    backup/main-<time> and resets to origin/main. If any
#                    commit has not landed, it stops and lists it.
#   3. Runs `npm ci` in my-app/ if package-lock.json changed, or if
#      node_modules is missing.
#   4. Rebuilds the docker compose services that are running AND whose inputs
#      changed (`docker compose up -d --build <those>`). Stopped services are
#      left stopped. `npm run dev` needs nothing; it reloads by itself (restart
#      it if step 3 ran, since npm ci replaces node_modules underneath it).
#
# Never pushes, never touches another branch, never runs a destructive git
# command without a backup ref first. Exit status is non-zero on any stop.
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

# ------------------------------------------------------------------ 2. update
say "fetching origin"
git fetch --quiet origin
old=$(git rev-parse HEAD)
new=$(git rev-parse origin/main)

if [ "$old" = "$new" ]; then
  say "main is already at origin/main ($(git log -1 --format='%h %s' HEAD))"
elif git merge-base --is-ancestor "$old" "$new"; then
  git merge --quiet --ff-only origin/main
  say "main fast-forwarded:"
  git --no-pager log --oneline "$old..$new"
elif git merge-base --is-ancestor "$new" "$old"; then
  stop "main has commits that are not on origin. Push them on a branch and open a PR:
$(git --no-pager log --oneline "$new..$old")"
else
  # git cherry marks a local commit "-" when an equivalent patch is already
  # upstream and "+" when it is not. Only "-" commits are safe to drop. A
  # multi-commit squash matches no single local patch, so it shows "+" and
  # stops here: the safe direction for a false negative.
  unlanded=$(git cherry origin/main HEAD | sed -n 's/^+ //p')
  # git cherry skips merge commits entirely. A merge is only safe to drop if
  # it added nothing of its own: an empty combined diff (--cc) means it just
  # joined its parents. One that resolved a conflict or carried an edit has
  # content no other commit holds, so it counts as unlanded.
  for m in $(git rev-list --merges origin/main..HEAD); do
    [ -z "$(git diff-tree --cc --no-commit-id -p "$m")" ] || unlanded="$unlanded $m"
  done
  if [ -n "$unlanded" ]; then
    stop "main and origin/main have diverged, and these local commits are not on origin:
$(for c in $unlanded; do git --no-pager log -1 --oneline "$c"; done)
Nothing was changed. Move them to a branch and open a PR, then run this again."
  fi
  backup="backup/main-$(date +%Y%m%d-%H%M%S)"
  git branch "$backup" "$old"
  git reset --quiet --hard origin/main
  say "main had diverged, but every local-only commit is already on origin."
  say "reset main to origin/main; the old main is saved as $backup"
  say "  (undo: git reset --hard $backup)"
fi

# Nothing below runs on an unchanged tree, except the missing-node_modules check.
changed=""
[ "$old" = "$new" ] || changed=$(git diff --name-only "$old" "$new")

touched() { # touched <path prefix>...: did anything under these change?
  local p
  for p in "$@"; do
    printf '%s\n' "$changed" | grep -q "^$p" && return 0
  done
  return 1
}

# ------------------------------------------------------------- 3. dependencies
if [ -f my-app/package-lock.json ]; then
  if [ ! -d my-app/node_modules ]; then
    say "my-app/node_modules is missing: npm ci"
    (cd my-app && npm ci --no-audit --no-fund)
  elif touched my-app/package-lock.json; then
    say "my-app/package-lock.json changed: npm ci (restart npm run dev if it is running)"
    (cd my-app && npm ci --no-audit --no-fund)
  fi
fi

# --------------------------------------------------------------- 4. containers
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
      web) touched my-app/ contracts/ Dockerfile.web docker-compose.yml && rebuild+=(web) ;;
      backend) touched services/backend/ contracts/ Dockerfile.backend docker-compose.yml && rebuild+=(backend) ;;
    esac
  done
  if [ "${#rebuild[@]}" -gt 0 ]; then
    say "rebuilding running containers: ${rebuild[*]}"
    docker compose up -d --build "${rebuild[@]}"
  elif [ -n "$running" ]; then
    say "running containers ($(printf '%s' "$running" | tr '\n' ' ' | sed 's/ $//')) are unaffected by this update"
  fi
fi

say "done: main is at $(git log -1 --format='%h %s' HEAD)"
