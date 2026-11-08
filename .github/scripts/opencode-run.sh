#!/usr/bin/env bash
# Run OpenCode in CI and print only its final message, or the error on failure.
set -euo pipefail

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
