# Review app

`GITHUB_TOKEN` cannot approve PRs, and a user cannot approve their own. The reviewer in [agents.md](agents.md) therefore approves as a GitHub App. The official [OpenCode Agent](https://github.com/apps/opencode-agent) app runs OpenCode on issues and PRs but does not expose a token to this workflow, so create your own app.

## Create the app

1. GitHub **Settings → Developer settings → GitHub Apps → New GitHub App**. Any name works (for example `domoled-reviewer`). Set the homepage URL to this repository and uncheck **Webhook → Active**.
2. Repository permissions:
   - **Actions**: Read and write
   - **Contents**: Read and write
   - **Issues**: Read and write
   - **Pull requests**: Read and write
   - **Workflows**: Read and write

   `Contents: write` is required. With read-only contents the approval shows as "approved with read-only permissions" and does not count toward required reviews. `Workflows: write` lets the implementation job push changes under `.github/workflows/`; that job uses the same app token.

3. Create the app, then **Install App** on this repository.
4. Generate a private key in the app settings and copy the **App ID**: the numeric id, not the Client ID.
5. Add the secrets with no quotes or whitespace:

   ```sh
   gh secret set REVIEW_APP_ID --body "<numeric-app-id>"
   gh secret set REVIEW_APP_PRIVATE_KEY < path/to/app.private-key.pem
   ```

## How it is used

`pr-review.yml` mints an installation token with `actions/create-github-app-token@v3` and uses it only for `gh pr review --approve`. Comments and auto-merge still use `GITHUB_TOKEN`. `issue-implement.yml` mints one the same way and uses it to check out the repo, so the agent's `git push` can update workflow files.

If the token step fails with `'Issuer' claim ('iss') must be an Integer`, `REVIEW_APP_ID` is not the numeric App ID (it is the Client ID, or has a trailing newline). Re-set it with `gh secret set ... --body`.

## Require the approval

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
