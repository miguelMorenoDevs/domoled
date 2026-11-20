---
name: Issue create
description: Create a GitHub issue for a bug, gap or feature, classify it with the repo's three required label groups, wire its dependencies and split big work into sub-issues. Use when asked to record an issue, file a bug, add a TODO, or turn a finding into an issue.
---

# Issue create

Every issue carries exactly one label from each group:

| Group | Labels |
|---|---|
| Plan | `ai-ready` / `needs-plan` |
| Complexity | `complexity: low` / `complexity: mid` / `complexity: high` |
| Execution | `auto` / `review` |

Rules:

- `ai-ready` when complexity is low or mid; `needs-plan` when high.
- `auto` when the issue is docs-only or complexity is low; otherwise `review`.
- `high` always gets `needs-plan` + `review`.

## 1. Check for duplicates

Run `gh issue list --state open` and search titles. If the item already exists, comment or update it instead of creating another.

## 2. Verify the finding

Grep the named file/function and confirm the bug or gap is real. Include the exact file, function and current behavior in the issue; a stale claim is worse than no issue.

## 3. Classify

- `low`: one contained change, no new state or dependency.
- `mid`: multiple files, a behavior change, or a small design choice.
- `high`: cross-cutting, new infrastructure/dependency, or needs a plan first.

Docs-only work is `auto`; code that is `mid` or `high` is `review`.

## 4. Create blockers first

Create every issue this one is blocked by before this one, so the relation can be wired right after creation. If a blocker does not exist yet, create it now; if it cannot be written yet, note the number and wire it in step 6 instead of skipping it.

## 5. Write the issue

Use a conventional title: `fix(scope): ...`, `feat(scope): ...`, `chore: ...` (lowercase subject).

Body sections, in this order:

- `## Summary` — what is wrong or missing, in one short paragraph.
- `## Current behavior` — what the code does today, with file/function references.
- `## Expected` — completion criteria.
- `## Scope` — files/functions likely touched.
- `## Verification` — exact command or manual check that proves it.

Do not add a "Depends on #N" section or sentence. The dependency is an issue relation, not prose: the UI, the epic agent and the reviewer read the relation, and a sentence goes stale the moment an issue is renumbered or closed.

`ai-ready` + `auto` on creation starts `.github/workflows/issue-agent.yml` and opens a PR immediately. Only use `auto` when an agent can finish the issue with no hardware, credentials or device.

The labels already exist in the repo: run `gh label list` and create only a missing one, never with `--force` (it overwrites existing labels). Then create the issue with the body inline:

```
gh issue create --title "<title>" --body "<body>" --label "ai-ready,complexity: mid,review"
```

## 6. Wire dependencies

After creating, link the issue to its blockers. One direction is enough: GitHub shows the reciprocal "blocking" side automatically.

```
gh issue edit <blocked> --add-blocked-by <blocker>[,<blocker>...]
```

- Use the numbers from step 4. Never leave a dependency only in the body.
- Keep the graph acyclic. If two issues block each other, one of them is a subtask of the other, not a peer.
- Wire order as well as existence: a child that must ship after another child gets its own `blocked-by`.
- Verify with `gh issue view <n> --json blockedBy`.

## 7. Split big work into sub-issues

Split when the work needs more than one PR, has slices that are each independently verifiable, or spans more than one concern (build, port, verify, docs). Do not force it: one cohesive change stays one issue.

- Create the children first, each with the full body sections and its own labels from step 5.
- Create the parent last: `needs-plan` + `complexity: high` + `review` (never `auto`). Its body is a short map of the slices and the order, not implementation detail.
- Attach the children to the parent:

```
gh issue edit <parent> --add-sub-issue <child>[,<child>...]
```

- A child must stand alone: someone who only sees the child can finish it without reading the parent.
- Wire the order between children with `blocked-by` in step 6, so the graph shows what can start when.
- Verify with `gh issue view <parent> --json subIssues` and `gh issue view <child> --json parent`.

## 8. Verify

Run `gh issue view <n> --json number,title,labels,blockedBy,subIssues` and confirm:

- exactly one label from each group is present;
- every dependency is a real relation, not a sentence;
- a parent lists its children and each child names its parent.

Report the issue URL that `gh` printed.
