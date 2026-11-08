# AGENTS.md

Raspberry Pi LED matrix that animates the Spotify track currently playing. Express + Spotify OAuth + browser simulator.

## Docs — load only what the task needs

- `docs/setup.md` — env vars, install, dev/build commands, simulator, OAuth redirect setup.
- `docs/codebase.md` — architecture, module map, TS/ESM conventions, routes, rendering flow.
- `docs/TODOs.md` — known bugs, gaps and deferred work. Read before fixing or extending behavior.

## Always

- Keep `README.md` updated with what this project offers: add/remove features there whenever behavior changes.
- Use `pnpm` (version enforced by `devEngines`). `pnpm dev` runs with `.env`; `pnpm build` is `tsc`; `pnpm test` fails by design (no test suite). `pnpm build` must pass before committing.
- Match the existing ESM conventions: relative imports end in `.js`, type-only imports use `import type`, env access uses `process.env["X"]`.
- Keep the `eval("require")` platform shim in `src/led/animator.ts`; do not turn it into a normal import.
- When a change resolves a `docs/TODOs.md` item, delete that item; update `docs/codebase.md` if the module map, routes or flow changed.

## Git and PRs

- "commit" means commit **and push** the branch unless told otherwise.
- Branch from `main`: `fix/<slug>` for bugs, `feat/<slug>` for features. One TODO item or feature per branch and PR.
- Conventional commits, lowercase subject, scope when useful: `chore(spotify): ...`, `fix(led): ...`. One logical commit, no tool attribution.
- Never commit `.env`, `dist/` or `node_modules/`.
- For the full branch, commit and PR spec (body sections, `gh` command), use the `pr` skill in `.opencode/skills/pr/SKILL.md`. `gh` is always available.
