#!/usr/bin/env bash
#
# PreToolUse(Bash) hook: refuse to create a git branch whose name would break
# its Amplify PR preview. Two rules, one blast radius:
#
#   - No '.': Amplify's default-domain TLS cert is a single-label wildcard
#     (*.<appId>.amplifyapp.com), so a dotted branch produces a multi-label
#     PR-preview subdomain whose HTTPS fails with ERR_CERT_COMMON_NAME_INVALID.
#   - At most 63 characters once '/' becomes '-': that is the preview host's
#     single DNS label, and a longer one never resolves (ERR_NAME_NOT_RESOLVED)
#     — the A11y scan and forms smoke gate then fail on infrastructure rather
#     than on the change and read as "flaky, merge anyway" (#2488).
#
# See the matching server-side guard in .github/workflows/pr-preview.yml.
#
# Reads the PreToolUse hook payload on stdin and, when the command creates an
# offending branch, emits a deny decision. Anything else exits 0 (allow). Biased
# toward NOT false-positiving: only the well-known branch-creating forms are
# inspected, and the git config flag `git -c key=val` is skipped so its dotted
# value is never mistaken for a branch name.
set -euo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

deny() {
  local name="$1" form="$2" reason="$3"
  jq -n --arg reason "Refusing to create branch '$name' ($form): $reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# Apply both rules to a candidate branch name; denies (and exits) on the first hit.
check() {
  local name="$1" form="$2"
  local label="${name//\//-}"
  case "$name" in
    *.*) deny "$name" "$form" "the name contains a '.', which breaks the Amplify PR-preview HTTPS cert (single-label wildcard *.amplifyapp.com → ERR_CERT_COMMON_NAME_INVALID) and the forms live smoke gate. Use '-' instead, e.g. '${name//./-}'." ;;
  esac
  if [ "${#label}" -gt 63 ]; then
    deny "$name" "$form" "its Amplify preview label '$label' is ${#label} characters and a DNS label is capped at 63, so the preview host would never resolve (ERR_NAME_NOT_RESOLVED) and the A11y + forms smoke gates would run against a dead URL (#2488). Shorten the name so that, with '/' replaced by '-', it is 63 characters or fewer."
  fi
}

# Evaluate each &&/||/;/| segment independently so a leading `cd … &&` or a
# global `git -c …` in one segment can't bleed into another.
segments=$(printf '%s' "$cmd" | sed -E 's/(&&|\|\||;|\|)/\n/g')

while IFS= read -r seg; do
  # shellcheck disable=SC2206  # word-splitting is intended; git refs have no spaces
  read -ra toks <<< "$seg" || true
  [ "${#toks[@]}" -eq 0 ] && continue

  # Locate the `git` token.
  gi=-1
  for i in "${!toks[@]}"; do
    [ "${toks[$i]}" = "git" ] && { gi=$i; break; }
  done
  [ "$gi" -lt 0 ] && continue

  # First non-option token after `git` is the subcommand. Skip git's global
  # options, and the VALUE of those that take one (-c/-C/--git-dir/…), so
  # `git -c user.email=x switch …` resolves `switch`, not `user.email=x`.
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
    checkout)
      for k in "${!args[@]}"; do
        case "${args[$k]}" in
          -b|-B) nm="${args[$((k + 1))]:-}"; [ -n "$nm" ] && check "$nm" "git checkout $sub" ;;
        esac
      done
      ;;
    switch)
      for k in "${!args[@]}"; do
        case "${args[$k]}" in
          -c|-C|--create|--force-create) nm="${args[$((k + 1))]:-}"; [ -n "$nm" ] && check "$nm" "git switch --create" ;;
        esac
      done
      ;;
    branch)
      mode="create"; nonopt=()
      for a in "${args[@]}"; do
        case "$a" in
          -m|-M|--move) mode="move" ;;
          -c|-C|--copy) mode="copy" ;;
          -d|-D|--delete|-a|-r|--all|--remotes|--list|--show-current|--merged|--no-merged|--contains|--edit-description|-v|-vv|--verbose)
            mode="skip" ;;
          -*) : ;;
          *) nonopt+=("$a") ;;
        esac
      done
      case "$mode" in
        create) [ "${#nonopt[@]}" -ge 1 ] && check "${nonopt[0]}" "git branch" ;;
        # rename/copy: the NEW name is the last positional arg.
        move|copy) [ "${#nonopt[@]}" -ge 1 ] && check "${nonopt[-1]}" "git branch --${mode}" ;;
      esac
      ;;
    push)
      setupstream=0; pushargs=()
      for a in "${args[@]}"; do
        case "$a" in
          -u|--set-upstream) setupstream=1 ;;
          -*) : ;;
          *) pushargs+=("$a") ;;
        esac
      done
      # Explicit refspec `src:dst` — the destination ref is what Amplify names.
      for a in "${args[@]}"; do
        case "$a" in
          *:*) dst="${a##*:}"; dst="${dst#refs/heads/}"; check "$dst" "git push refspec" ;;
        esac
      done
      # `git push -u <remote> <branch>` — the trailing positional is the branch.
      if [ "$setupstream" -eq 1 ] && [ "${#pushargs[@]}" -ge 2 ]; then
        nm="${pushargs[-1]}"
        case "$nm" in *:*) : ;; *) check "$nm" "git push --set-upstream" ;; esac
      fi
      ;;
  esac
done <<< "$segments"

exit 0
