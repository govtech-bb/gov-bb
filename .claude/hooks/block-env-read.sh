#!/usr/bin/env bash
#
# PreToolUse(Bash) hook: refuse shell commands that would read the CONTENTS of a
# .env file into the model. .env files hold secrets and are gitignored. The
# Read-tool `deny` rules in .claude/settings.json cover the Read tool, but shell
# readers (cat/grep/head/redirection/interpreters) run through Bash and bypass
# those rules — this hook closes that gap (the two form a defence-in-depth pair).
#
# Bias: a secrets guard should fail safe. Any known file-reader — or an input
# redirection — targeting a non-template .env token is denied. File-management
# that does NOT surface contents to the model (cp/mv/ls/rm/git) is deliberately
# left alone, as are template files (.env.example/.sample/.template/.dist/
# .defaults/.schema). Known gap: an interpreter embedding the path inside a
# quoted string (e.g. python3 -c "open('.env')") is not detected here — the
# Read-tool deny rules are the complementary layer.
#
# Reads the PreToolUse payload on stdin; emits a deny decision when matched,
# otherwise exits 0 (allow). Mirrors block-dotted-branch.sh's structure.
set -euo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

deny() {
  local tok="$1"
  jq -n --arg reason "Refusing to read '$tok': .env files hold secrets and are off-limits to shell reads (cat/grep/head/redirection/interpreters). Read the committed .env.example instead, or ask the user to supply the value directly." '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# A non-template .env file token? Judged by basename so paths are handled.
is_env_file() {
  local base; base=$(basename -- "$1")
  case "$base" in
    .env.example|.env.sample|.env.template|.env.dist|.env.defaults|.env.schema) return 1 ;;
    .env|.env.*|*.env) return 0 ;;
    *) return 1 ;;
  esac
}

# A command that would surface file contents to the model.
is_reader() {
  case "$(basename -- "$1")" in
    cat|tac|nl|head|tail|less|more|most|bat|view|grep|egrep|fgrep|rg|ag|ack|\
    awk|gawk|mawk|sed|cut|sort|uniq|tr|xxd|od|hexdump|strings|base64|base32|\
    dd|wc|jq|yq|dotenv|printenv|python|python3|node|perl|ruby|php|xargs)
      return 0 ;;
    *) return 1 ;;
  esac
}

# Evaluate each &&/||/;/| segment independently (mirrors block-dotted-branch.sh).
segments=$(printf '%s' "$cmd" | sed -E 's/(&&|\|\||;|\|)/\n/g')

while IFS= read -r seg; do
  # shellcheck disable=SC2206  # word-splitting is intended
  read -ra toks <<< "$seg" || true
  [ "${#toks[@]}" -eq 0 ] && continue

  env_tok=""; reader=0; redir=0; prev=""
  for t in "${toks[@]}"; do
    # Normalize: strip a leading redirection/command-substitution wrapper.
    c="$t"; c="${c#<}"; c="${c#\$\(}"; c="${c#\`}"; c="${c%\`}"; c="${c%\)}"
    is_env_file "$c" && env_tok="$c"
    is_reader "$c" && reader=1
    # Input redirection from a .env: "<file" or "< file".
    case "$t" in
      "<"*) rc="${t#<}"; [ -n "$rc" ] && is_env_file "$rc" && redir=1 ;;
    esac
    [ "$prev" = "<" ] && is_env_file "$c" && redir=1
    prev="$t"
  done

  if [ -n "$env_tok" ] && { [ "$reader" -eq 1 ] || [ "$redir" -eq 1 ]; }; then
    deny "$env_tok"
  fi
done <<< "$segments"

exit 0
