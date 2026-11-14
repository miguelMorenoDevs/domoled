# GitHub agents

OpenCode runs in GitHub Actions to implement issues, apply changes requested on PRs and review PRs. Each run uses the skill under `.opencode/skills/`.

## Implementing issues

Both triggers run the reusable `.github/workflows/issue-implement.yml`, which runs `.opencode/skills/issue/SKILL.md` and opens a PR that closes the issue.

- `.github/workflows/issue-agent.yml` runs when an issue is created with both the `ai-ready` and `auto` labels. Labeling an existing issue does not start it. The PR enables auto-merge.
- `.github/workflows/issue-implement-comment.yml` runs when a member, owner or collaborator comments exactly `implement` on an open `ai-ready` issue. The PR does not enable auto-merge; a human merges it.

## Requesting changes

- `.github/workflows/ai-change.yml` runs when a member, owner or collaborator comments `change: <request>` on an open PR labelled `ai-developed` (the agent pushes a commit to the PR branch), or on an open `ai-ready` issue (the agent rewrites the issue body).

## Reviewing PRs

- `.github/workflows/pr-review.yml` runs when a member, owner or collaborator comments `@miguelmoreno-reviewer` on a PR, or on manual dispatch. It skips drafts and forks and comments on the PR when the review starts.
- The PR author enables auto-merge only when the implementation run asks for it.
- The reviewer only decides: it approves, and GitHub merges if auto-merge is enabled, or it requests changes with the problem in the review body. Approval needs the app described in [review-app.md](review-app.md).
- `GITHUB_TOKEN` events do not trigger workflows, so the skill requests the review itself with `gh workflow run pr-review.yml -f pr=<n>` after opening the PR.

## Models and secrets

- Both workflows need the `OPENCODE_CLIENT_ID` secret. They exchange their GitHub Actions OIDC token for a short-lived OpenCode token (`id-token: write`), in `.github/scripts/opencode-login.sh`. Both HTTP calls retry up to 3 times with a 5-second delay, and failures name the step that failed.
- They install OpenCode with `npm install -g @opencode/cli`. The implementation job runs `opencode-go/claude-haiku-5-5` and the reviewer runs `opencode-go/deepseek-v4.1-flash`. Change the model in `opencode-run.sh` (the `implement` job) or the `--model` flag.
- Both run OpenCode through `.github/scripts/opencode-run.sh`. It prints only the final assistant message, or the error and exit status on failure. The implement job also fails when no PR closes the issue (`Closes #N` in a PR body), so a green run always means a PR exists.

## Commits and labels

- The skill commits as `opencode-agent[bot]`. The PR creator is still the `gh` account that opened it. Every PR the agent opens gets the `ai-developed` label.
- The skill loads the ponytail skill (`.opencode/skills/ponytail/`), which keeps changes minimal and reviews focused on real problems.
- `.github/workflows/close-linked-issues.yml` is the safety net: when a PR merges, it closes every open issue referenced with `Closes`/`Fixes`/`Resolves #<n>` in the PR title or body, and comments with the PR link. Unmerged PRs, other repositories, pull request numbers and already-closed issues are left alone.
