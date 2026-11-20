---
name: Epic orchestrator
description: Lead an epic end to end by coordinating the issue, change and review agents. Read every issue, start ready ones with an `implement` comment, run independent work in parallel, wait for blockers to merge, loop `change:` requests until the reviewer approves, and merge. Use when asked to run or ship an epic, or to coordinate several issues at once.
---

# Epic orchestrator

You lead the epic; the workflow agents implement the issues you delegate. One epic per run. Read `AGENTS.md`; implementation conventions live in the `issue` and `pr` skills, and code is judged by `ponytail`. Read only the docs a step needs.

## Hard rules

- Never merge without an approving review submitted after the current head commit, and never merge with failing checks.
- Never start an issue before its blockers are merged.
- Never delegate an issue that changes `.github/workflows/`. The app token cannot push workflow files; do it yourself and use the mention review.
- One action per comment: exactly `implement` on an issue, `change: <specific fix>` on an `ai-developed` PR.
- Never claim a check you did not run. Hardware, live Spotify and TV checks are not yours to claim.
- Wait for real state: a PR, a new commit, a review, a merge. Do not infer success from a workflow starting.

## 1. Read the epic and every issue

1. Resolve the epic: `gh issue view <epic> --json number,title,body,labels,state`.
2. Collect its members: native sub-issues, else the task list or issue list in the body. Do not treat every `#N` mention as a member; dependencies and references are not members. If the epic does not list its issues, ask instead of guessing.
3. Read each member completely: `gh issue view <n> --json number,title,body,labels,state,comments`. Record the `## Dependencies`, `## Scope`, `## Expected` and `## Verification` sections.
4. Map existing PRs once: `gh pr list --state open --limit 100 --json number,title,body,url,headRefName,headRefOid,isDraft` and match `Closes/Fixes/Resolves #<n>` in each body. An issue with an open PR is in flight: watch it, do not start a second one.
5. Classify each issue:
   - `closed` — done.
   - `needs-plan` — cannot start; `implement` only runs on `ai-ready`. Report it and stop that chain.
   - `ai-ready` + open PR — in flight.
   - `ai-ready` + no PR + blockers merged — ready.
   - open + unmerged blocker — blocked.
   - touches `.github/workflows/` — self mode.
   - needs hardware or another manual step no agent can do — not delegable; report it and leave it for the user.

Write the plan down before acting: issue, dependency, scope, mode (delegate/self/watch), next action.

## 2. Choose what runs in parallel

Build the dependency edges, strongest first:

1. Explicit `Depends on`, `Blocked by` or native blocked-by links.
2. Issues whose `## Scope` lists the same files or a behavior one builds on the other.
3. Epic order for ties.

Start every ready issue that shares no dependency and no scope file with another ready issue. Serialize overlapping scopes in epic order; merging both in parallel only produces conflicts. A blocked issue stays still until its blocker is merged; everything independent keeps running.

State the batch and the serialized items in one short line before starting, with assumptions.

## 3. Start delegated issues

- Comment exactly `implement` on each ready issue: `gh issue comment <n> --body "implement"`. The comment must come from a member, owner or collaborator; if no run starts, check `gh auth status` and the issue labels before retrying.
- Send all comments for the batch before waiting. Each issue has its own concurrency group, so they run in parallel.
- Never comment `implement` twice while a run is pending; the second run queues.
- Wait for a PR whose body links the issue. Poll every 60-90 s, up to 30 min. On failure inspect `gh run list --workflow=issue-implement-comment.yml --limit 10` and `gh run view <id> --log-failed`, then report that issue as blocked. Retry once at most.
- If the run fails because it tried to push `.github/workflows/`, switch that issue to self mode in step 5.

## 4. Watch, request changes, merge

Poll every 60-90 s across all in-flight PRs; never sleep on one while another needs action.

```sh
gh pr view <n> --json number,state,isDraft,mergeable,mergeStateStatus,headRefOid,reviews,commits,statusCheckRollup,url
gh pr checks <n>   # exit 0 pass, 8 pending, 1 fail
```

Decision order:

1. **Merged** — verify `state` is `MERGED`, then unblock its dependents.
2. **Draft or no review** — the implement workflow requests the review after opening the PR. For a delegated PR, request it once if none was requested or the head changed since the last review: `gh workflow run pr-review.yml -f pr=<n>`. For a self PR, comment the mention from step 5. Do not dispatch while a review is running; the workflow cancels the previous run.
3. **Changes requested** — read the blocking review body (latest `APPROVED`/`CHANGES_REQUESTED` by `submittedAt`). For a delegated PR, comment one precise instruction on the PR:
   `gh pr comment <n> --body "change: <the blocking problem, the file, and the expected fix; keep the change in scope>"`
   Wait for the head commit to change and the agent to finish; then request a fresh review in the same mode. For a self PR, fix and push locally (step 5). Never merge a stale approval: a review must be newer than the head commit.
4. **Approved** — require all of: latest decision is `APPROVED` with a `submittedAt` newer than the last commit's `committedDate`, `gh pr checks` passes, `mergeable` is `MERGEABLE` (poll again while `UNKNOWN`), `mergeStateStatus` is not `DIRTY`/`BLOCKED`. Then merge:
   `gh pr merge <n> --squash --delete-branch`
   If auto-merge is already enabled, wait for GitHub to merge instead of merging twice.
5. **Not mergeable** — if `BEHIND`, run `gh pr update-branch`. If `CONFLICTING` or checks fail, send a `change:` request naming the failing check or files, then review again. For a delegated PR do not push commits yourself unless a change cycle cannot fix it; if you do, finish and re-review it like a self PR.
6. **No progress** — if a `change:` cycle lands no commit, or two cycles return the same blocking review, stop that chain and report the exact blocker. Do not loop or pad the request.

CI runs on the implement push, but the `change:` agent pushes with `GITHUB_TOKEN`, which does not start CI on the new head. Check the new head on the PR branch with the `pr` skill commands before merging, and say in the report that you ran them.

The review timeout is 20 min and the change timeout is 30 min. On timeout, inspect the run logs, report, and keep other PRs moving.

## 5. Workflow-touching issues: self mode

An issue is self mode when its scope or solution includes `.github/workflows/`. The workflow agent cannot push those files.

1. Do not comment `implement`. Implement it yourself with the `issue` skill: verify, branch from `main`, smallest complete change, run the `pr` skill checks, open the PR with `Closes #<n>` and the `ai-developed` label, no auto-merge.
2. Ask for review by commenting `@miguelmoreno-reviewer` on the PR. This replaces the review dispatch in the `issue` skill.
3. Wait for the review. On request-changes, fix and push locally, run the checks, comment the mention again, and wait. Repeat until approved.
4. Merge only after a fresh approval and green checks, as in step 4. Do not send `change:` on a workflow PR: `ai-change` cannot push workflow files either.

Keep delegated PRs moving while you work; check them between edits and test runs.

## 6. Continue until the epic is done

After each merge, recompute the ready set and start newly unblocked issues immediately; do not wait for the rest of the batch. Stop when every member is closed, or when nothing is ready and the remaining issues are blocked, need a plan, or need a human. Say which one it is.

## 7. Final report

Give a compact table: issue, mode, PR, latest review, state, next action. State assumptions, serialized scopes, skipped hardware checks, and every failure. If a PR is open, include its URL. Do not call the epic done while an issue is open.

## Command reference

```sh
# read
gh issue view <epic> --json number,title,body,labels,state
gh issue view <n> --json number,title,body,labels,state,comments

# in-flight PRs and issue mapping
gh pr list --state open --limit 100 --json number,title,body,url,headRefName,headRefOid,isDraft

# start, change, review
gh issue comment <n> --body "implement"
gh pr comment <n> --body "change: <problem and exact fix>"
gh pr comment <n> --body "@miguelmoreno-reviewer"   # self-developed PR only
gh workflow run pr-review.yml -f pr=<n>             # delegated PR, one per head commit

# state, checks, merge
gh pr view <n> --json state,isDraft,mergeable,mergeStateStatus,headRefOid,reviews,commits,statusCheckRollup,url
gh pr checks <n>
gh pr merge <n> --squash --delete-branch
```
