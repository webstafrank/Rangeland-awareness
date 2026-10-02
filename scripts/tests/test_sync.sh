#!/usr/bin/env bash
# Tests for scripts/sync.sh. Plain bash, no framework: run it and read the
# last line.
#
#   bash scripts/tests/test_sync.sh
#
# Each case builds a fresh sandbox in a temp dir: a bare "origin", an
# "upstream" clone that plays the teammate pushing merges, and the "local"
# clone that sync.sh runs in. npm and docker are stubs on PATH that log what
# they were asked to do, so the dependency and container steps are checked
# without installing or rebuilding anything. Real git throughout, because
# git's own behaviour (fast-forward, cherry, reset) is the thing under test.

set -uo pipefail

SCRIPT="$(cd "$(dirname "$0")/.." && pwd)/sync.sh"
pass=0
fail=0
failed=()

# A sandbox git that ignores the machine's global config and hooks, so a
# developer's settings cannot change the result.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.invalid
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.invalid

new_sandbox() {
  S=$(mktemp -d)
  mkdir -p "$S/bin"
  cat >"$S/bin/npm" <<'EOF'
#!/usr/bin/env bash
echo "npm $* @ $(basename "$PWD")" >>"$SANDBOX/calls"
EOF
  cat >"$S/bin/docker" <<'EOF'
#!/usr/bin/env bash
if [ "$1 $2" = "compose ps" ]; then
  [ "${STUB_PS_FAIL:-0}" = 1 ] && exit 1
  printf '%s' "${STUB_RUNNING:-}" | tr ' ' '\n'
  exit 0
fi
echo "docker $*" >>"$SANDBOX/calls"
EOF
  chmod +x "$S/bin/npm" "$S/bin/docker"
  : >"$S/calls"

  git init -q --bare -b main "$S/origin.git"
  git clone -q "$S/origin.git" "$S/up" 2>/dev/null
  mkdir -p "$S/up/my-app" "$S/up/services/backend"
  echo v1 >"$S/up/README"
  echo '{"lock":1}' >"$S/up/my-app/package-lock.json"
  echo app1 >"$S/up/my-app/page.txt"
  echo be1 >"$S/up/services/backend/app.py"
  git -C "$S/up" add -A
  git -C "$S/up" commit -qm initial
  git -C "$S/up" push -q origin main
  git clone -q "$S/origin.git" "$S/local"
  mkdir "$S/local/my-app/node_modules"
}

# upstream <file> <content> <message>: a teammate's commit, pushed.
upstream() {
  mkdir -p "$(dirname "$S/up/$1")"
  echo "$2" >"$S/up/$1"
  git -C "$S/up" add -A
  git -C "$S/up" commit -qm "$3"
  git -C "$S/up" push -q origin main
}

# local_commit <file> <content> <message>
local_commit() {
  echo "$2" >"$S/local/$1"
  git -C "$S/local" add -A
  git -C "$S/local" commit -qm "$3"
}

# run_sync [args...]: sets $status and $out.
run_sync() {
  out=$(cd "$S/local" && SANDBOX="$S" PATH="$S/bin:$PATH" bash "$SCRIPT" "$@" 2>&1)
  status=$?
}

head_of() { git -C "$S/$1" rev-parse HEAD; }
calls() { cat "$S/calls"; }

check() { # check <description> <command...>
  local what=$1
  shift
  if "$@"; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    failed+=("$case_name: $what")
    printf '  FAIL %s: %s\n--- output ---\n%s\n--------------\n' "$case_name" "$what" "$out"
  fi
}

case_() { # case_ <name>: start a case in a fresh sandbox
  case_name=$1
  [ -n "${S:-}" ] && rm -rf "$S"
  new_sandbox
  unset STUB_RUNNING STUB_PS_FAIL
}

# ------------------------------------------------------------------- cases

case_ "already up to date"
run_sync
check "exits 0" [ "$status" = 0 ]
check "says so" grep -q "already at origin/main" <<<"$out"
check "installs nothing" [ -z "$(calls)" ]

case_ "behind: fast-forwards"
upstream my-app/page.txt app2 "feat: page"
run_sync
check "exits 0" [ "$status" = 0 ]
check "HEAD is origin's" [ "$(head_of local)" = "$(head_of up)" ]
check "lists the new commit" grep -q "feat: page" <<<"$out"
check "no npm ci for a code-only change" [ -z "$(calls)" ]

case_ "lockfile changed: npm ci in my-app"
upstream my-app/package-lock.json '{"lock":2}' "deps: bump"
run_sync
check "exits 0" [ "$status" = 0 ]
check "ran npm ci in my-app" grep -qx "npm ci --no-audit --no-fund @ my-app" <<<"$(calls)"

case_ "node_modules missing: npm ci even when up to date"
rmdir "$S/local/my-app/node_modules"
run_sync
check "exits 0" [ "$status" = 0 ]
check "ran npm ci" grep -q "^npm ci" <<<"$(calls)"

case_ "not on main: refuses"
git -C "$S/local" switch -qc feature
upstream README v2 "chore"
before=$(git -C "$S/local" rev-parse main)
run_sync
check "exits non-zero" [ "$status" != 0 ]
check "names the branch" grep -q "on 'feature', not main" <<<"$out"
check "main untouched" [ "$(git -C "$S/local" rev-parse main)" = "$before" ]

case_ "tracked change: refuses"
echo edited >"$S/local/README"
upstream my-app/page.txt app2 "feat"
before=$(head_of local)
run_sync
check "exits non-zero" [ "$status" != 0 ]
check "lists the file" grep -q "README" <<<"$out"
check "HEAD untouched" [ "$(head_of local)" = "$before" ]
check "edit kept" [ "$(cat "$S/local/README")" = edited ]

case_ "untracked file: does not block"
echo scratch >"$S/local/notes.txt"
upstream my-app/page.txt app2 "feat"
run_sync
check "exits 0" [ "$status" = 0 ]
check "fast-forwarded" [ "$(head_of local)" = "$(head_of up)" ]
check "untracked file kept" [ -f "$S/local/notes.txt" ]

case_ "ahead: refuses and lists the commit"
local_commit README mine "wip: only here"
before=$(head_of local)
run_sync
check "exits non-zero" [ "$status" != 0 ]
check "lists it" grep -q "wip: only here" <<<"$out"
check "HEAD untouched" [ "$(head_of local)" = "$before" ]

case_ "diverged, local commits already landed: backs up and resets"
# The PR situation: local main's commit was rebased into a PR and merged, so
# origin has the same patch as a different commit, plus more on top.
local_commit my-app/page.txt rebrand "feat: rebrand"
old=$(head_of local)
upstream my-app/page.txt rebrand "feat: rebrand (rebased)"
upstream services/backend/app.py be2 "feat: backend"
run_sync
check "exits 0" [ "$status" = 0 ]
check "HEAD is origin's" [ "$(head_of local)" = "$(head_of up)" ]
backup=$(git -C "$S/local" for-each-ref --format='%(refname:short)' 'refs/heads/backup/main-*')
check "made one backup branch" [ "$(printf '%s\n' "$backup" | grep -c .)" = 1 ]
check "backup is the old main" [ "$(git -C "$S/local" rev-parse "$backup" 2>/dev/null)" = "$old" ]
check "prints the undo" grep -q "git reset --hard backup/main-" <<<"$out"

case_ "diverged through a clean local merge, all landed: resets"
# The exact shape of the first real run: a feature branch merged into local
# main with a merge commit, then the same commits rebased onto origin.
git -C "$S/local" switch -qc feature
local_commit my-app/page.txt rebrand "feat: rebrand"
git -C "$S/local" switch -q main
local_commit README "readme edit" "docs: readme"
git -C "$S/local" merge -q --no-ff --no-edit feature
upstream README "readme edit" "docs: readme (rebased)"
upstream my-app/page.txt rebrand "feat: rebrand (rebased)"
run_sync
check "exits 0" [ "$status" = 0 ]
check "HEAD is origin's" [ "$(head_of local)" = "$(head_of up)" ]

case_ "diverged through a merge that carries its own edit: refuses"
# Both parents' commits landed upstream, so git cherry marks them all "-".
# The extra edit lives only in the merge commit, which git cherry never
# lists, so without the --cc check this would reset it away. (A merge that
# resolved a conflict is the common way to get one; a conflict scenario does
# not test this, because a conflicting side's patch never matches upstream
# and git cherry already refuses on it.)
git -C "$S/local" switch -qc feature
local_commit my-app/page.txt "feature" "feat: feature side"
git -C "$S/local" switch -q main
local_commit README "main" "feat: main side"
git -C "$S/local" merge -q --no-ff --no-commit feature >/dev/null 2>&1
echo "edited in the merge" >"$S/local/services/backend/app.py"
git -C "$S/local" add -A
git -C "$S/local" commit -q --no-edit
upstream README "main" "feat: main side (rebased)"
upstream my-app/page.txt "feature" "feat: feature side (rebased)"
git -C "$S/local" fetch -q origin
check "setup: git cherry alone sees nothing unlanded" \
  [ -z "$(git -C "$S/local" cherry origin/main HEAD | grep '^+')" ]
before=$(head_of local)
run_sync
check "exits non-zero" [ "$status" != 0 ]
check "HEAD untouched" [ "$(head_of local)" = "$before" ]
check "the merge's edit kept" [ "$(cat "$S/local/services/backend/app.py")" = "edited in the merge" ]

case_ "diverged, a local commit not on origin: refuses"
local_commit README "unique work" "feat: not pushed"
upstream my-app/page.txt app2 "feat: theirs"
before=$(head_of local)
run_sync
check "exits non-zero" [ "$status" != 0 ]
check "lists the unlanded commit" grep -q "feat: not pushed" <<<"$out"
check "HEAD untouched" [ "$(head_of local)" = "$before" ]
check "no backup made" [ -z "$(git -C "$S/local" branch --list 'backup/*')" ]

case_ "running web, app changed: rebuilds web only"
export STUB_RUNNING="backend web"
upstream my-app/page.txt app2 "feat: page"
run_sync
check "exits 0" [ "$status" = 0 ]
check "rebuilt web" grep -qx "docker compose up -d --build web" <<<"$(calls)"

case_ "running both, contract changed: rebuilds both"
export STUB_RUNNING="backend web"
upstream contracts/criteria.json '{}' "contract: v2"
run_sync
# In whatever order compose listed them; compose does not care.
built=$(sed -n 's/^docker compose up -d --build //p' "$S/calls" | tr ' ' '\n' | sort | tr '\n' ' ')
check "rebuilt both, in one call" [ "$built" = "backend web " ]

case_ "running backend only, app changed: rebuilds nothing"
export STUB_RUNNING="backend"
upstream my-app/page.txt app2 "feat: page"
run_sync
check "exits 0" [ "$status" = 0 ]
check "no docker build" [ -z "$(calls)" ]
check "says they are unaffected" grep -q "unaffected" <<<"$out"

case_ "nothing running: rebuilds nothing"
upstream my-app/page.txt app2 "feat: page"
run_sync
check "no docker build" [ -z "$(calls)" ]

case_ "--no-docker: leaves containers alone"
export STUB_RUNNING="web"
upstream my-app/page.txt app2 "feat: page"
run_sync --no-docker
check "exits 0" [ "$status" = 0 ]
check "no docker build" [ -z "$(calls)" ]

case_ "docker compose ps fails: says so, still succeeds"
export STUB_PS_FAIL=1
upstream my-app/page.txt app2 "feat: page"
run_sync
check "exits 0" [ "$status" = 0 ]
check "says containers were not checked" grep -q "containers not checked" <<<"$out"

case_ "unknown option: refuses before touching anything"
upstream README v2 "chore"
before=$(head_of local)
run_sync --bogus
check "exits non-zero" [ "$status" != 0 ]
check "HEAD untouched" [ "$(head_of local)" = "$before" ]

case_ "--help: prints usage"
run_sync --help
check "exits 0" [ "$status" = 0 ]
check "shows usage" grep -q "scripts/sync.sh --no-docker" <<<"$out"

rm -rf "$S"
printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" = 0 ] || { printf '  %s\n' "${failed[@]}"; exit 1; }
