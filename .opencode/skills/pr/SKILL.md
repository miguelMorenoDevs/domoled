---
name: Pull request
description: Create a pull request for this repo: branch from updated main, commit in the repo's conventional style, and open a PR with gh using the required body sections. Use when asked to open, create or raise a PR, or once a change is ready to ship.
---

# Pull request

`gh` is always installed and authenticated. Use it. Never hand the user a compare URL, and never claim a PR exists unless `gh pr create` printed its URL. If `gh` fails, show the error and stop.

Repo commands and code conventions live in `AGENTS.md`; read only the docs the change needs.

## 1. Branch

- One issue or feature per branch and PR.
- `git fetch`, update local `main` to the latest, then branch from it — unless told otherwise.
- `fix/<slug>` for bugs, `feat/<slug>` for features.

## 2. Commit

- Before committing, these must all pass, in this order: `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm test`. These are the checks `ci` runs; a PR that passes only the build can fail CI. If `format:check` fails, run `pnpm exec prettier --write <changed files>` and commit the result.
- Conventional commits, lowercase subject, scope when useful: `chore(spotify): ...`, `fix(led): ...`.
- One logical commit per PR. No tool attribution.
- "commit" means commit **and push** the branch unless told otherwise.
- Leave unrelated untracked files out; do not fold them into the commit to make the branch look clean.

## 3. Open the PR

- Target `main`. `CODEOWNERS` routes review to `@miguelMorenoDevs`.
- Title = commit subject.
- Label every PR the agent opens `ai-developed`.
- Open the PR with the title, label and body inline:

```
gh pr create --base main --title "<commit subject>" --label ai-developed --body "<body>"
```

- Enable auto-merge only when the prompt says to. Then, as the PR creator, it merges once approved:

```
gh pr merge --auto --squash
```

Otherwise leave it off: a human merges the PR.

- Body sections, in this order:

  - `## Summary` — what changed and why, in one short paragraph.
  - `## Issue` — `Closes #<n>` plus the issue title, or `new feature: <one line>`.
  - `## Changes` — bullets by file or area.
  - `## Verification` — exact commands run with their results, manual checks, and what was not tested. Never claim verification you did not run.
  - `## Risk` — user-visible changes, new failure modes, follow-ups; say so when there is none.
