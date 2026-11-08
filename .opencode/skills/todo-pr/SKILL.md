---
name: TODO to PR
description: Implement one item from docs/TODOs.md (bug or missing feature) and open a pull request that explains the change. Use when asked to fix a TODO, pick up a known gap, or ship a TODO item as a PR.
---

# TODO to PR

One TODO item per branch and PR. Repo commands and code conventions live in `AGENTS.md`; the branch, commit and PR spec lives in the `pr` skill.

## 1. Pick and verify the item

- Read `docs/TODOs.md` (and `README.md` if the item changes user-facing behavior).
- If the user did not name an item, list the candidates and ask which one.
- Confirm it still exists: grep the named file/function. Remove or correct stale items before coding.
- Read only the docs the task needs: `docs/setup.md` for env/run, `docs/codebase.md` for architecture.

## 2. Scope

- Grep every caller of the code you will touch, plus every place the change must reach: routes, types, `README.md`, `docs/TODOs.md`, `docs/codebase.md`.
- Keep the smallest complete change. No new abstraction, dependency, config or "for later" code.
- Preserve existing behavior and error handling unless the TODO is about that behavior.
- If the item is a bug, fix the root cause in the shared code, not at each call site.

## 3. Branch

Create a branch from `main` using the naming in `AGENTS.md`.

## 4. Implement

Follow the code conventions in `AGENTS.md` and `docs/codebase.md`. Non-trivial new logic (branch, loop, parser, money/security) needs one small check: a script, an assert-based self-check, or a documented manual verification. Do not add a test runner.

## 5. Verify

Run the build command from `AGENTS.md`, then check behavior for the area you touched:

- `spotify/` routes or client: run the dev server (needs `.env`), then `curl` or the `.bruno` collection. `POST /spotify/login` must return a URL; the callback needs a real Spotify login.
- `led/animator.ts`: run the dev server, open `simulator.html`, confirm frames arrive on `ws://localhost:8080`. On win32/darwin the matrix is mocked.
- Types/config only: build is enough.

Record the exact commands you ran; they go in the PR.

## 6. Update docs

Apply the docs rules in `AGENTS.md`: `README.md`, `docs/TODOs.md`, and `docs/codebase.md` when relevant.

## 7. Commit, push, open the PR

Follow the `pr` skill to commit, push and open the PR.

Keep the body factual. Do not claim verification you did not run.
