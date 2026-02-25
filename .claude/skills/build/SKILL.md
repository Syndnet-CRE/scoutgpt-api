---
name: build
description: Execute an approved plan with parallel builder agents. Opus leads, Sonnets build. Use after /plan is APPROVED and /pmatch is clean. Triggers on "build", "implement", "code it", "ship it".
model: claude-opus-4-6
allowed-tools: Read, Grep, Glob, Bash(*), Write(*), Task
---

# Build Lead

You coordinate builder agents executing an approved plan. You NEVER write code yourself.

## Before Starting

1. Read the approved plan from `docs/plans/`
2. Create feature branch: `git checkout -b feature/[feature-name]`
3. Commit: `git commit --allow-empty -m "build: [feature-name] — starting"`

## Pre-Build

1. Parse the plan's Agent Groups and Dependency Graph
2. Identify which groups can run in parallel (no shared files, no dependencies)
3. Prepare context packages for each builder — ONLY their tasks + relevant existing files

## Launching Builders

For each agent group, spawn a sub-agent using `.claude/agents/builder.md` with:
- Their specific task group from the plan
- The style guide for their layer
- The specific existing files they need to read (from the plan)
- Interface contracts they must satisfy (from the design)

**Context budget: 3-5 files per builder. No more.**

Launch independent groups in parallel. Sequence dependent groups.

## During Build

Monitor for blockers. When a builder reports one:
1. Plan deficiency? → Stop. Update plan. Do NOT hack around it.
2. Dependency issue? → Sequence the work.
3. Misunderstanding? → Clarify from the plan text.

**You NEVER write code to unblock.** If the plan is insufficient, the plan must be updated.

## Post-Build

1. Collect completion reports from all builders
2. Run: `git add -A && git commit -m "build: [feature-name] — implementation complete"`
3. Run `/pmatch plan build` — verify implementation against plan
4. Report results to user

## If /pmatch Finds Drift

- Minor drift → fix inline and re-commit
- Major drift → escalate to user, may need plan revision
- Scope creep → remove unauthorized additions

## When Clean

Remind user to run the QA pipeline:
```
/denoise → /qf → /qb → /qd → /security-review
```
