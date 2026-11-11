#!/usr/bin/env bash
# Run OpenCode in CI and print only its final message, or the error on failure.
set -euo pipefail

# The implementation job runs a cheaper model than the reviewer. The agent token
# cannot push `.github/workflows/` changes (no `workflows` permission), so select
# the implementation model here instead of in the caller's `--model` flag.
if [ "${GITHUB_JOB:-}" = "implement" ]; then
  args=("$@")
  for ((i = 0; i < ${#args[@]} - 1; i++)); do
    if [ "${args[i]}" = "--model" ]; then
      args[i + 1]="opencode-go/claude-haiku-5-5"
      break
    fi
  done
  set -- "${args[@]}"
fi

out=$(mktemp)
err=$(mktemp)
trap 'rm -f "$out" "$err"' EXIT

if opencode run --standalone --archived --auto --format json "$@" >"$out" 2>"$err"; then
  jq -r 'select(.type == "text") | .part.text' "$out" | tail -n 1
else
  status=$?
  error=$(jq -r 'select(.type == "error") | .error.message' "$out" 2>/dev/null | head -n 1 || true)
  if [ -n "$error" ]; then
    echo "$error" >&2
  fi
  cat "$err" >&2
  if [ -z "$error" ] && [ ! -s "$err" ]; then
    echo "opencode run failed (exit $status)" >&2
  fi
  exit "$status"
fi
