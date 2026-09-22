---
name: worktree-setup
description: The per-session git worktree ritual for this repo — the setup block that creates the session worktree and task branch, the bootstrap block for the untracked files a worktree does not inherit, the second-task block, and the manual cleanup sweep. Invoke before the first write of a session, again when starting a second task in the same session, and when Franklyn asks to clean worktrees up. The invariants, the guard and the never-do rules stay in CLAUDE.md; this is the executable half.
---

# Worktree setup

The reasoning for all of this lives in the "Branching" section of `CLAUDE.md`, which
stays loaded in every session. This file is the executable half: four blocks, run at
four specific moments. Nothing here is a template — the blocks are executed verbatim
by `tests/test_branching_snippets.sh` at github.com/jbarbier/CLAUDE.md, one case per
bug that bit. That suite is why the reasons here can stay this short. Change a line,
run it there; if you copied this file on its own, the tests did not come with it.

## 1. Setup — once per session, before the first write

Run it from the shared checkout, as one unit. Each Bash tool call is its own shell,
so the `exit 1` lines stop the block, not your session; pasting it by hand is the one
case where that bites, so use `bash -c` there. `SLUG` is the only blank: lowercase,
dash separated, three words at most.

```bash
SLUG=fix-login                                                    # <- the task, kebab-case

# Remote default branch, never local HEAD (that inherits another session's work).
# The ladder is because plenty of repos are master and origin/HEAD is often unset.
# Resolved before the mode split: solo needs the same base, or task two stacks
# on task one and lands both in one merge.
git fetch -q origin 2>/dev/null
git remote set-head -a origin >/dev/null 2>&1
BASE=$(git symbolic-ref -q --short refs/remotes/origin/HEAD)
for c in origin/main origin/master main master; do
  [ -n "$BASE" ] && break
  git rev-parse -q --verify "$c" >/dev/null && BASE=$c
done
[ -n "$BASE" ] || { echo "STOP: cannot find a base branch"; exit 1; }

# solo: no worktree, no owner prefix, no session id, so it also works under
# agents that set no session variable. switch -c would carry uncommitted work
# onto the new branch, which is what the clean check is for.
if [ "$(git config claude.mode)" = solo ]; then
  git status --porcelain | grep -q . && { echo "STOP: commit or stash first"; exit 1; }
  git switch -qc "$SLUG" "$BASE" || exit 1
  echo "SOLO $SLUG"; exit 0
fi

SID=${CLAUDE_CODE_SESSION_ID:0:8}
[ -n "$SID" ] || { echo "STOP: CLAUDE_CODE_SESSION_ID is unset, every session would share one worktree"; exit 1; }
ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
KEY=$(basename "$ROOT")-$(printf %s "$ROOT" | cksum | cut -d' ' -f1)   # unique per repo PATH
WT="$HOME/.claude-worktrees/$KEY/$SID"

# GitHub login, not the email local-part (often a stale handle). Cached per repo,
# never empty: git config succeeds on "" and would poison the repo until unset.
OWNER=$(git config claude.branchPrefix)
[ -n "$OWNER" ] || OWNER=$(gh api user --jq .login 2>/dev/null)
[ -n "$OWNER" ] || OWNER=$(git config user.email | cut -d@ -f1)
[ -n "$OWNER" ] || { echo "STOP: git config claude.branchPrefix YOUR_HANDLE"; exit 1; }
git config claude.branchPrefix "$OWNER"

if git worktree list --porcelain | grep -qFx "worktree $WT"; then   # resumed session
  echo "re-attaching to existing worktree"
else
  git worktree add -b "$OWNER/$SLUG-$SID" "$WT" "$BASE" || exit 1   # never report a tree we failed to make
fi
echo "WORKTREE $WT"
```

Then call `EnterWorktree` with `path` set to the WORKTREE path it printed (the
"Branching" section of CLAUDE.md is the instruction that authorizes that tool);
outside Claude Code, `cd` there. It prints the path because shell variables die
between tool calls, which is why every snippet re-derives what it needs. Resuming
re-attaches rather than duplicating, but creates no branch: resuming into a new task
means running the second-task block.

Once you are inside, the harness refuses any Bash call it cannot prove stays in the
worktree. That means a multi-line block that reaches into the shared checkout, or
builds a path in a variable and cds to it, comes back as "too complex to verify"
rather than running. Bootstrap and the second-task block are both that shape. Two
ways through, both fine: run the block one plain command at a time, or write it to a
file and run `bash the-file.sh`, which is a single in-tree command and is accepted
whole. The guard in CLAUDE.md is written to need neither.

## 2. Bootstrap — before the first test run

A worktree has tracked files only, so `.env`, `node_modules/` and virtualenvs are
absent and your first command fails for reasons unrelated to your change.

```bash
ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
[ -f "$ROOT/.env" ] && cp "$ROOT/.env" .        # the copy is per-worktree; the VALUES inside are not
[ -d "$ROOT/node_modules" ] && ln -s "$ROOT/node_modules" node_modules   # big, shared, not copied
# .claude is untracked, so a worktree inherits none of it: no project skills, no
# project settings. Without this line CLAUDE.md points at skills a worktree session
# cannot load, and the ritual that mandates worktrees is the thing that hides them.
[ -d "$ROOT/.claude" ] && [ ! -e .claude ] && ln -s "$ROOT/.claude" .claude
git submodule update --init --recursive 2>/dev/null   # worktrees do not inherit submodules
# then the project's own install/build step, e.g. npm ci / uv sync / bundle install
```

Adjust to the project, never commit these files to fix this. The worktree isolates
files in the repo and nothing else: that copied `.env` points both sessions at one
database and one port, so two sessions migrate the same schema and each reads the
other's failure as its own bug. Before the first run, fork the single-writer handles
(db name, port, container names) with `${CLAUDE_CODE_SESSION_ID:0:8}`, and drop those
forks when the task ends, the same way you drop the worktree. Prose, not a snippet:
the names belong to the project, not to git.

## 3. Second task, same session

New branch, same worktree, clean tree first. Never a second worktree. In solo mode
this block is the whole ritual: it is what the setup block already did.

```bash
SLUG=next-task                                                  # <- the new task
# switch -c carries uncommitted work into task two. Base resolved as setup does:
# an unset origin/HEAD would put task two on task one's branch, and its PR.
git status --porcelain | grep -q . && { echo "STOP: commit or stash first"; exit 1; }
git fetch -q origin 2>/dev/null
git remote set-head -a origin >/dev/null 2>&1
BASE=$(git symbolic-ref -q --short refs/remotes/origin/HEAD)
for c in origin/main origin/master main master; do
  [ -n "$BASE" ] && break
  git rev-parse -q --verify "$c" >/dev/null && BASE=$c
done
[ -n "$BASE" ] || { echo "STOP: cannot find a base branch"; exit 1; }
git switch -c "$(git config claude.branchPrefix)/$SLUG-${CLAUDE_CODE_SESSION_ID:0:8}" "$BASE" || exit 1
```

## 4. Cleanup — a manual command, never part of setup

A sweep that runs automatically eventually runs while somebody is mid-task, so it
runs when Franklyn asks, from the shared checkout. Each `continue` is a bug that bit:

```bash
HERE=$(git rev-parse --show-toplevel)
BASE=$(git symbolic-ref -q --short refs/remotes/origin/HEAD) || exit 1
git worktree list --porcelain | awk '/^worktree /{print substr($0,10)}' |
  grep "/\.claude-worktrees/" | while read -r w; do
    [ "$w" = "$HERE" ] && continue                       # never the tree you are standing in
    b=$(git -C "$w" branch --show-current); [ -n "$b" ] || continue
    # Not merely "has an upstream": worktree add sets it immediately, so the weak
    # test passes for a session that has done nothing and the sweep eats live work.
    up=$(git -C "$w" rev-parse --abbrev-ref "@{upstream}" 2>/dev/null)
    [ "$up" = "origin/$b" ] || continue                  # never pushed under its own name
    # "Landed" is not "is an ancestor": rebase and squash merges replay the work as
    # a new commit, so ancestry alone keeps every merged worktree forever. cherry
    # compares patch ids and still prints + for unlanded work. Gap: a multi-commit
    # squash matches no single patch and is kept. Remove those by hand.
    git merge-base --is-ancestor "$b" "$BASE" \
      || [ -z "$(git cherry "$BASE" "$b" | grep '^+')" ] || continue     # not landed yet
    # worktree remove refuses on modified/untracked files but deletes IGNORED ones
    # without complaint, and ignored is exactly where bootstrap put .env.
    [ -n "$(git -C "$w" status --porcelain --ignored)" ] && continue     # something left behind
    git worktree remove "$w"
  done
git worktree prune
```

Removing a worktree never deletes its branch. `git worktree` admin commands against
the shared checkout are fine and are not "working" in it; to return there from inside
one, use `ExitWorktree` with `keep`.
