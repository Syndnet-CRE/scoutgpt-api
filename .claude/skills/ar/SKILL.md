---
name: ar
description: Run adversarial review on an approved design. Three independent sub-agents critique from Security/Performance, Architecture/Maintainability, and UX/API perspectives. Use after /design is APPROVED. Triggers on "review", "critique", "stress test", "adversarial".
model: claude-opus-4-6
allowed-tools: Read, Grep, Glob, Bash(find:*), Bash(cat:*), Task
---

# Adversarial Review — Team Lead

You orchestrate three independent reviewers, then synthesize their findings into one actionable report.

## Before Starting

1. Read the approved design from `docs/designs/`
2. Read style guides from `docs/STYLE_GUIDE_*.md`
3. Identify relevant codebase files the reviewers will need

## Process

### Step 1: Launch Reviewers in Parallel

Spawn three sub-agents simultaneously. Each gets:
- The design document
- The style guides
- Relevant codebase files (scoped to their review domain)

Use these agent files:
- `.claude/agents/reviewer-security.md` — Security & Performance lens
- `.claude/agents/reviewer-architecture.md` — Architecture & Maintainability lens
- `.claude/agents/reviewer-ux.md` — UX & API Design lens

### Step 2: Collect & Deduplicate

When all three complete:
- Merge findings describing the same underlying issue
- Keep the most specific description

### Step 3: Fact-Check

For EVERY finding, verify against actual codebase:
- Does the vulnerability actually exist, or was the design misread?
- Is the "missing pattern" present in a file the reviewer didn't see?
- Is the recommended fix compatible with current dependencies?

Mark each: **CONFIRMED** | **DISPUTED** | **NEEDS-INVESTIGATION**

### Step 4: Cost/Benefit Analysis

For each confirmed finding:
- **Cost to fix:** effort in context of current build cycle
- **Cost to ignore:** risk of shipping without fix
- **Recommendation:** FIX-NOW | FIX-LATER | ACCEPT-RISK
- **Rationale:** why

### Step 5: Report

```markdown
# Adversarial Review: [Feature Name]
## Date: [ISO date]
## Design: docs/designs/[name]-design.md
## Iteration: [N]

### Summary
[2-3 sentence overview]

### Critical Findings (Must Fix Before Build)
[Full detail per finding]

### High Findings (Should Fix Before Build)
[Full detail per finding]

### Deferred Findings (Track for Later)
[Full detail]

### Disputed Findings (Reviewer Error)
[Explanation of why incorrect]

### Design Amendments Required
[Specific changes to design based on critical/high findings]
```

Save to: `docs/reviews/[feature-name]-ar-v[N].md`

## Loop Condition

If critical or high findings exist that warrant mitigation:
1. Present report to user
2. User decides what to fix
3. Update design document
4. Re-run `/ar` (increment iteration number)

Loop until no remaining findings warrant mitigation per cost/benefit analysis.

When clean, remind user to run `/plan`.
