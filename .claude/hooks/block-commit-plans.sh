#!/usr/bin/env bash
#
# PreToolUse(Bash) hook: refuse to stage or commit files under docs/plans/.
#
# Session plans live in docs/plans/ so they're reachable via @-mention (the
# file picker respects .gitignore, so the directory is NOT gitignored), but
# they are deliberately NOT version-controlled — a plan drives work up to the
# PR, then is discarded. This hook is the enforcement that keeps an untracked
# plan from being swept into a commit. Mirrors .claude/hooks/block-dotted-branch.sh.
#
# Reads the PreToolUse hook payload on stdin and emits a deny decision when a
# git command would COMMIT a docs/plans/ path. Anything else exits 0 (allow).
# Biased toward NOT false-positiving: a bare `git add .`/`-A` is allowed (a
# plan may get staged but not yet committed); the block lands on `git commit`
# when docs/plans is already staged, or on an `add -A && commit` one-liner
# when docs/plans has uncommitted changes. An explicit `git add docs/plans/...`
# is denied early as an obvious mistake.
set -euo pipefail

PLAN_DIR="docs/plans"

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

deny() {
  local reason="$1"
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# Determine the repo dir to inspect: honour a leading `cd <path>` so a worktree
# commit is checked against that worktree, else fall back to the project dir.
workdir="${CLAUDE_PROJECT_DIR:-.}"
# shellcheck disable=SC2206
read -ra all_toks <<< "$cmd" || true
for i in "${!all_toks[@]}"; do
  if [ "${all_toks[$i]}" = "cd" ]; then
    cand="${all_toks[$((i + 1))]:-}"
    [ -n "$cand" ] && [ "${cand:0:1}" != "-" ] && workdir="$cand"
    break
  fi
done

# Does docs/plans currently have uncommitted (untracked or modified) changes a
# bulk `git add` would sweep in?
plans_dirty() {
  local out
  out=$(git -C "$workdir" status --porcelain -- "$PLAN_DIR" 2>/dev/null) || return 1
  [ -n "$out" ]
}

# Are any docs/plans paths already staged for commit?
plans_staged() {
  local out
  out=$(git -C "$workdir" diff --cached --name-only -- "$PLAN_DIR" 2>/dev/null) || return 1
  [ -n "$out" ]
}

is_bulk_add() {
  case "$1" in
    .|-A|--all|-u|--update|:/|"*") return 0 ;;
    *) return 1 ;;
  esac
}

# Evaluate each &&/||/;/| segment independently, in order. A bulk add seen in
# an earlier segment means a later `git commit` in the same command would sweep
# in any dirty docs/plans changes.
segments=$(printf '%s' "$cmd" | sed -E 's/(&&|\|\||;|\|)/\n/g')

bulk_add_seen=0

while IFS= read -r seg; do
  # shellcheck disable=SC2206
  read -ra toks <<< "$seg" || true
  [ "${#toks[@]}" -eq 0 ] && continue

  gi=-1
  for i in "${!toks[@]}"; do
    [ "${toks[$i]}" = "git" ] && { gi=$i; break; }
  done
  [ "$gi" -lt 0 ] && continue

  # First non-option token after `git` is the subcommand; skip git's global
  # options and the value of those that take one.
  sub=""; subidx=-1; j=$((gi + 1)); n=${#toks[@]}
  while [ $j -lt $n ]; do
    case "${toks[$j]}" in
      -c|-C|--git-dir|--work-tree|--namespace|--exec-path) j=$((j + 2)); continue ;;
      -*=*|-*) j=$((j + 1)); continue ;;
      *) sub="${toks[$j]}"; subidx=$j; break ;;
    esac
  done
  [ -z "$sub" ] && continue

  args=("${toks[@]:$((subidx + 1))}")

  case "$sub" in
    add|stage)
      for a in "${args[@]}"; do
        case "$a" in
          *"$PLAN_DIR"*)
            deny "Refusing to stage '$a': files under $PLAN_DIR/ are session plans and must not be committed (they're un-gitignored only so they're @-mentionable). Don't add them."
            ;;
        esac
        is_bulk_add "$a" && bulk_add_seen=1
      done
      ;;
    commit)
      if plans_staged; then
        deny "Refusing to commit: $PLAN_DIR/ files are staged, and session plans must not be committed. Run 'git restore --staged $PLAN_DIR' first, then commit."
      fi
      if [ "$bulk_add_seen" -eq 1 ] && plans_dirty; then
        deny "Refusing to commit: a bulk 'git add' in this command would stage uncommitted $PLAN_DIR/ files, and session plans must not be committed. Stage the specific files you mean by path instead of '.'/'-A'."
      fi
      ;;
  esac
done <<< "$segments"

exit 0
