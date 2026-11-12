#!/usr/bin/env bash
# Exchange the job's GitHub OIDC token for an OpenCode access token, exported as OPENCODE_API_KEY.
set -euo pipefail

: "${OPENCODE_CLIENT_ID:?missing OPENCODE_CLIENT_ID secret}"
: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?missing OIDC token; the job needs id-token: write}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?missing OIDC request URL; the job needs id-token: write}"

fail() {
  echo "opencode login failed: $1" >&2
  exit 1
}

oidc_response=$(curl -sS --fail-with-body --retry 3 --retry-delay 5 --retry-all-errors --oauth2-bearer "$ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
  "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=https://opencode.ai/console") ||
  fail "GitHub OIDC request failed: $oidc_response"
oidc=$(jq -er .value <<<"$oidc_response") || fail "GitHub OIDC response has no value: $oidc_response"

token_response=$(curl -sS --fail-with-body --retry 3 --retry-delay 5 --retry-all-errors https://opencode.ai/console/auth/oauth/token \
  -d grant_type=urn:ietf:params:oauth:grant-type:token-exchange \
  -d subject_token_type=urn:ietf:params:oauth:token-type:jwt \
  -d client_id="$OPENCODE_CLIENT_ID" \
  -d subject_token="$oidc") || fail "token exchange failed: $token_response"
token=$(jq -er .access_token <<<"$token_response") ||
  fail "token exchange returned no access_token: $token_response"

echo "::add-mask::$token"
echo "OPENCODE_API_KEY=$token" >> "$GITHUB_ENV"
