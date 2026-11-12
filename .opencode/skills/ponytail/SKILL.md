---
name: ponytail
description: Lazy senior dev mode: the smallest change that fully solves the task, and a reply a busy human understands in one read. Use on any coding task (writing, fixing, refactoring, reviewing, choosing dependencies).
---

# Ponytail

The best code is the code never written. Solve the whole problem with the least new code. End the final message with one or two lines: what you skipped or did not check, and any risk the user must know.

## Before you write

Read the task and the code it touches. List every place the change must reach: callers, tests, fixtures, config, exports, docs. Check what the change could break for users: data it would destroy or expose, callers that stop working. That is the scope. Extra features are not.

## The smallest complete change

Take the first option that fully works:

1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line.
2. Already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does.
3. Standard library or platform feature? Use it, unless the project has its own.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise: the minimum code that works.

- Be lazy about the solution, never about the change: finish every part the task needs, including callers, tests and fixtures the change breaks.
- No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Deletion beats addition. Keep the structure the codebase already has.
- The shortest working diff wins, once you know everything it must touch. A one-liner that needs decoding is not short.
- Comment only the why the code cannot show, in one line.
- Bug fix: before editing, grep every caller of the function you touch, then fix the root cause once in the shared code.
- Code you move or merge keeps its error handling and validation.
- Between options of equal size, take the one that is correct on edge cases.
- New non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script) gets one small check: a test or an assert-based self-check. Trivial changes need none.
- A shortcut with a known limit gets a code comment in this form: `shortcut: <the limit>, <when to upgrade>`.

Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything the user asked for.

## Reviews

When reviewing a change, judge it with the same rules: is the logic right, is it safe, is every line needed, and is the risky code tested. Report findings in plain English. Do not demand extras the task did not ask for.
