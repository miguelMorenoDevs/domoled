# AGENTS.md

Raspberry Pi LED matrix that animates the Spotify track currently playing. Express + Spotify OAuth + browser simulator.

## Docs — load only what the task needs

- `docs/setup.md` — env vars, install, dev/build commands, simulator, OAuth redirect setup.
- `docs/codebase.md` — architecture, module map, TS/ESM conventions, routes, rendering flow.
- GitHub Issues — known bugs, gaps and deferred work (`gh issue list --state open`). Read before fixing or extending behavior.

## Always

- Keep `README.md` updated with what this project offers: add/remove features there whenever behavior changes.
- Don't read, search or edit `.env`, `dist/` or `node_modules/`: they are gitignored and only matter when the task needs them.
- Use `pnpm` (version enforced by `devEngines`). `pnpm dev` runs with `.env`; `pnpm build` is `tsc`; `pnpm test` compiles `test/` with `tsconfig.test.json` and runs `node --test`. Run `pnpm build` and `pnpm test` before committing only when the change touches `src/`; docs, skills and workflow-only changes skip both.
- Match the existing ESM conventions: relative imports end in `.js`, type-only imports use `import type`, env access uses `process.env["X"]`.
- Keep the `eval("require")` platform shim in `src/led/animator.ts`; do not turn it into a normal import.
- Record new bugs, gaps and deferred work as GitHub issues with the `issue-create` skill; do not add a local TODO list.
- Never commit, or mention in PR descriptions, issues or comments, where this project is being run (machine, OS, host, paths, local IPs) or any personal information (names, emails, account IDs, tokens). Describe the behavior, not the environment.
- When a change resolves an issue, close it from the PR (`Closes #N`); update `docs/codebase.md` if the module map, routes or flow changed.

## Git and PRs

- "commit" means commit **and push** the branch unless told otherwise.
- "ask for a review" means comment `@miguelmoreno-reviewer` on the open PR (`gh pr comment <n> --body "@miguelmoreno-reviewer"`); do not request a reviewer.
- Branch from `main`: `fix/<slug>` for bugs, `feat/<slug>` for features. One issue or feature per branch and PR.
- Every issue carries one label from each group: `ai-ready`/`needs-plan`, `complexity: low|mid|high`, `auto`/`review`.
- Conventional commits, lowercase subject, scope when useful: `chore(spotify): ...`, `fix(led): ...`. One logical commit, no tool attribution.
- For the full branch, commit and PR spec (body sections, `gh` command), use the `pr` skill in `.opencode/skills/pr/SKILL.md`. `gh` is always available.
- An issue with both `ai-ready` and `auto` is picked up by `.github/workflows/issue-agent.yml`, which opens the PR itself and enables auto-merge. A maintainer comment `implement` on an open `ai-ready` issue runs `.github/workflows/issue-implement-comment.yml`, which opens the PR without auto-merge. Both call `.github/workflows/issue-implement.yml`.
