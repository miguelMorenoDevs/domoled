# Setup

## Requirements

- Node.js with `pnpm` ^11.9 (enforced by `devEngines.packageManager`).
- Raspberry Pi with an RGB LED matrix (`rpi-led-matrix`) for real output. Windows/macOS use a built-in mock plus the browser simulator.

## Install

```sh
pnpm install
```

`pnpm-workspace.yaml` sets `allowBuilds`: `rpi-led-matrix: true`, `canvas: false`, `esbuild: false` (esbuild runs without its install script). Keep this in mind if a native dependency fails to build.

`pnpm install` runs the `prepare` script, which sets `core.hooksPath` to `.githooks` when `.git` exists. The pre-commit hook then runs `pnpm build`, `pnpm lint`, `pnpm format:check` and `pnpm test` before each commit and aborts on the first failure, the same checks as CI. Skip it with `git commit --no-verify`. Installs with `--ignore-scripts` (CI) or without `.git` (tarballs) skip the hook setup.

## Environment

Copy `.env.example` to `.env`:

```sh
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

Both are required: `src/spotify/client.ts` throws at import time when either is missing, so the server will not start. `.env` is only loaded by `pnpm dev` (`tsx --env-file=.env`); a compiled `node dist/app.js` does not load it.

## Run

```sh
pnpm dev     # tsx src/app.ts with .env
pnpm build   # tsc -> dist/
pnpm lint          # eslint . (eslint.config.js)
pnpm format:check  # prettier --check . (.prettierrc.json, .prettierignore)
pnpm format        # prettier --write .
```

- `tsx` is fetched on demand by `pnpx`; it is not a declared dependency.
- `pnpm test` builds `test/` (via `tsconfig.test.json`, output in `dist-test/`) and runs the built-in `node --test` runner. No test dependencies are used.
- No lint or formatter config exists.
- ESLint (flat config, typescript-eslint recommended) ignores `dist/` and `node_modules/`. `no-explicit-any` is a warning because the rpi-led-matrix shim in `src/led/animator.ts` is intentionally untyped.
- Prettier skips `dist/`, `node_modules/`, `pnpm-lock.yaml`, `public/`, `index.html`, `simulator.html` and the `issue-create` skill (see `.prettierignore`).

## Issue and PR agents

Two triggers implement an issue. Both run the reusable `.github/workflows/issue-implement.yml`, which runs OpenCode with `.opencode/skills/issue/SKILL.md` and opens a PR that closes the issue:

- `.github/workflows/issue-agent.yml` runs when an issue is created with both the `ai-ready` and `auto` labels. Labeling an existing issue does not start it. The PR enables auto-merge.
- `.github/workflows/issue-implement-comment.yml` runs when a member, owner or collaborator comments exactly `implement` on an open `ai-ready` issue. The PR does not enable auto-merge; a human merges it.

- `.github/workflows/ai-change.yml` runs when a member, owner or collaborator comments `change: <request>` on an open PR labelled `ai-developed` (the agent pushes a commit to the PR branch) or on an open `ai-ready` issue (the agent rewrites the issue body).

- The reviewer runs when a member, owner or collaborator comments `@miguelmoreno-reviewer` on a PR (`.github/workflows/pr-review.yml`), or on manual dispatch. It skips drafts and forks, and comments on the PR when the review starts. The PR author enables auto-merge only when the implementation run asks for it. The reviewer only decides: it approves, and GitHub merges if auto-merge is enabled, or it requests changes with the problem in the review body.
- `GITHUB_TOKEN` events do not trigger workflows, so `.opencode/skills/issue/SKILL.md` makes the agent request the review itself with `gh workflow run pr-review.yml -f pr=<n>` after opening the PR. Commenting `@miguelmoreno-reviewer` on a PR also works for people.
- Both workflows need the `OPENCODE_CLIENT_ID` secret: they exchange their GitHub Actions OIDC token for a short-lived OpenCode token (`id-token: write`). They install OpenCode V2 with `npm install -g @opencode/cli`. The implementation job runs `opencode-go/claude-haiku-5-5` and the reviewer runs `opencode-go/deepseek-v4.1-flash`. The implementation model is selected in `opencode-run.sh` for the `implement` job; change that selection or the `--model` flag to use another provider/model.
- The OIDC-to-OpenCode sign-in lives in `.github/scripts/opencode-login.sh`. Both HTTP calls retry up to 3 times with a 5-second delay. It stops with a message naming the failed step (missing secret or OIDC permission, OIDC request, token exchange, or a response without `access_token`) and includes the server's error body.
- Both workflows run OpenCode through `.github/scripts/opencode-run.sh`. It captures the JSON stream and prints only the final assistant message in the step log, or the error and exit status when the run fails. For the `implement` job it also fails when no PR closes the issue (`Closes #N` in a PR body), so a green run always means a PR exists.
- The skill commits as `opencode-agent[bot]`, not as the human running it. The PR creator is still the `gh` account that opened it. Every PR the agent opens gets the `ai-developed` label.
- `.github/workflows/close-linked-issues.yml` is the safety net: when a PR merges, it closes every open issue referenced with `Closes`/`Fixes`/`Resolves #<n>` in the PR title or body (bare or `owner/repo#<n>` for this repository) and comments with the PR link. Unmerged PRs, other repositories, pull request numbers and already-closed issues are left alone.

### Review app

`GITHUB_TOKEN` cannot approve PRs and a user cannot approve their own, so the reviewer approves as a GitHub App. The official [OpenCode Agent](https://github.com/apps/opencode-agent) app runs OpenCode on issues/PRs but does not expose a token to this workflow; create your own app instead:

1. GitHub **Settings → Developer settings → GitHub Apps → New GitHub App**. Any name works (for example `domoled-reviewer`); set the homepage URL to this repository and uncheck **Webhook → Active**.
2. Repository permissions: **Actions: Read and write**, **Contents: Read and write**, **Issues: Read and write**, **Pull requests: Read and write**, **Workflows: Read and write**. `Contents: write` is required — with read-only contents the app's approval shows as "approved with read-only permissions" and does not count toward required reviews. `Workflows: write` lets the implementation job push changes under `.github/workflows/`; the implementation job uses the same app token.
3. Create the app, then **Install App** on this repository.
4. Generate a private key in the app settings and copy the **App ID** — the numeric id, not the Client ID.
5. Add the secrets with no quotes or whitespace:

   ```sh
   gh secret set REVIEW_APP_ID --body "<numeric-app-id>"
   gh secret set REVIEW_APP_PRIVATE_KEY < path/to/app.private-key.pem
   ```

`pr-review.yml` mints an installation token with `actions/create-github-app-token@v3` and uses it only for `gh pr review --approve`; comments and auto-merge still use `GITHUB_TOKEN`. `issue-implement.yml` mints one the same way and uses it to check out the repo, so the agent's `git push` can update workflow files.

If the token step fails with `'Issuer' claim ('iss') must be an Integer`, `REVIEW_APP_ID` is not the numeric App ID (it is the Client ID, or has a trailing newline). Re-set it with `gh secret set ... --body`.

To make the approval mandatory, require one approving review on `main`:

```sh
gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null
}
JSON
```

`dismiss_stale_reviews` drops the approval on every push, and the `synchronize` run re-approves. `enforce_admins` also stops the repo owner from bypassing the gate. Without this protection, auto-merge still merges immediately once enabled.

## LG TV app

`lg-app/` is a webOS app that shows the matrix animations full screen on an LG TV. Install and setup steps live in `docs/tv.md`.

## Ports and simulator

- Express listens on **3000**. `GET /led/state` streams the current animation state to the LG TV app.
- On win32/darwin the animator starts a WebSocket server on **8080** and streams frames.
- Open `simulator.html` directly in a browser (double-click or `file://`); it connects to `ws://localhost:8080`. It is not served by Express — `public/` only holds the OAuth success page at `public/success.html`.

## Spotify OAuth setup

- Redirect URI is hardcoded to `https://miguelmorenodevs.github.io/domoled`, which must match the Spotify app dashboard.
- That GitHub Pages URL serves `index.html`, which forwards `code` + `state` to `http://<state>/spotify/callback`; `state` is the machine's local IP from `src/utils/network.ts`.
- The redirect URI appears in both `src/spotify/client.ts` and `src/spotify/routes.ts`; changing it means updating both files and the Spotify dashboard.
- `POST /spotify/login` returns the authorize URL and prints a QR code to the terminal. Scan it, approve, and the callback starts the animation.
- With no active user (at boot or after `DELETE /spotify/users/active`), the matrix shows a short login QR pointing to `http://<localIP>:3000/spotify/login` (phone must be on the same LAN as the Pi). On win32/darwin, boot also logs the `simulator.html` file URL, and the simulator shows the QR too; `DELETE /spotify/users/active` shows it again.
- Tokens are saved to `data/users.json` (relative to the working directory, created with mode `0600`, gitignored) on login, refresh and active-user changes, and reloaded on startup. Delete that file to log every user out.
