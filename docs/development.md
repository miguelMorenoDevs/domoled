# Development

## Scripts

```sh
pnpm lint          # eslint . (eslint.config.js)
pnpm format:check  # prettier --check . (.prettierrc.json, .prettierignore)
pnpm format        # prettier --write .
pnpm test          # build test/ and run node --test
```

- `pnpm test` builds `test/` (via `tsconfig.test.json`, output in `dist-test/`) and runs the built-in `node --test` runner. No test dependencies are used.
- ESLint (flat config, typescript-eslint recommended) ignores `dist/` and `node_modules/`. `no-explicit-any` is a warning because the rpi-led-matrix shim in `src/led/animator.ts` is intentionally untyped.
- Prettier skips `dist/`, `node_modules/`, `pnpm-lock.yaml`, `public/`, `index.html`, `simulator.html` and the `issue-create` skill (see `.prettierignore`).

## Pre-commit hook

`pnpm install` sets `core.hooksPath` to `.githooks` when `.git` exists. The hook (`.githooks/pre-commit`) runs `pnpm build`, `pnpm lint`, `pnpm format:check` and `pnpm test` before each commit and aborts on the first failure, the same checks as CI. On Windows it checks CRLF line endings (`pnpm format:check:crlf`); elsewhere it checks LF (`pnpm format:check`).

Skip it with `git commit --no-verify`. Installs with `--ignore-scripts` (CI) or without `.git` (tarballs) skip the hook setup.
