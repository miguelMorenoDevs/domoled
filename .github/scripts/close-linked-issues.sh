#!/usr/bin/env bash
# Safety net for GitHub's native closing keywords: after a PR merges, close every
# open issue in this repository referenced as "Closes #<n>" (or fixes/resolves)
# in the PR title or body. Set DRY_RUN=1 to print the issue numbers only.
set -euo pipefail

: "${GITHUB_REPOSITORY:?missing GITHUB_REPOSITORY}"
: "${PR_NUMBER:?missing PR_NUMBER}"
: "${PR_URL:?missing PR_URL}"
PR_TITLE="${PR_TITLE:-}"
PR_BODY="${PR_BODY:-}"

log() { echo "$*" >&2; }

# close/closes/closed, fix/fixes/fixed, resolve/resolves/resolved in any case,
# followed by an optional colon and #<n>. \K drops the keyword so only the
# reference is printed. The lookarounds keep "prefix#12" and "#12abc" out.
pattern='(?<![[:alnum:]_])(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)[ \t]*:?[ \t]*\K(?:[[:alnum:]_.-]+/[[:alnum:]_.-]+)?#[0-9]+(?![[:alnum:]_])'

declare -A seen=()

while IFS= read -r ref; do
  num="${ref##*#}"
  repo="${ref%#*}"

  # A bare "#12" is this repository; "owner/repo#12" must match this repository.
  if [ -n "$repo" ] && [ "${repo,,}" != "${GITHUB_REPOSITORY,,}" ]; then
    log "skip $ref: not $GITHUB_REPOSITORY"
    continue
  fi

  if [ -n "${seen[$num]:-}" ]; then
    continue
  fi
  seen[$num]=1

  if [ -n "${DRY_RUN:-}" ]; then
    echo "$num"
    continue
  fi

  if ! meta=$(gh api "repos/$GITHUB_REPOSITORY/issues/$num" --jq '[.state, has("pull_request")] | @tsv' 2>/dev/null); then
    log "skip #$num: no issue in $GITHUB_REPOSITORY"
    continue
  fi
  read -r state is_pr <<<"$meta"

  # The PR itself and other pull requests are never issues to close.
  if [ "$is_pr" = "true" ]; then
    log "skip #$num: pull request"
    continue
  fi
  if [ "$state" != "open" ]; then
    log "skip #$num: already $state"
    continue
  fi

  gh issue close "$num" --repo "$GITHUB_REPOSITORY" --comment "Closed by #$PR_NUMBER: $PR_URL"
  log "closed #$num: $PR_URL"
done < <(printf '%s\n' "$PR_TITLE"$'\n'"$PR_BODY" | grep -oiP "$pattern" || true)
