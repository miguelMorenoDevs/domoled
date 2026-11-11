---
name: Issue create
description: Create a GitHub issue for a bug, gap or feature and classify it with the repo's three required label groups. Use when asked to record an issue, file a bug, add a TODO, or turn a finding into an issue.
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

## 4. Write the issue

Use a conventional title: `fix(scope): ...`, `feat(scope): ...`, `chore: ...` (lowercase subject).

Body sections, in this order:

- `## Summary` — what is wrong or missing, in one short paragraph.
- `## Current behavior` — what the code does today, with file/function references.
- `## Expected` — completion criteria.
- `## Scope` — files/functions likely touched.
- `## Verification` — exact command or manual check that proves it.

Write the body to `.git/ISSUE_BODY.md` (inside `.git`, so it is never committed). The labels already exist in the repo: run `gh label list` and create only a missing one, never with `--force` (it overwrites existing labels). Then create the issue:

```
gh issue create --title "<title>" --body-file .git/ISSUE_BODY.md --label "ai-ready,complexity: mid,review"
```

## 5. Verify

Run `gh issue view <n> --json number,title,labels` and confirm exactly one label from each group is present. Report the issue URL that `gh` printed.
