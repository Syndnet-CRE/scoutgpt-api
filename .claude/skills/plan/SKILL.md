---
name: plan
description: Transform an approved design into an atomic execution plan. Builder agents should never need to ask clarifying questions. Use after /ar passes. Triggers on "plan", "break down", "task list", "implementation plan".
model: claude-opus-4-6
allowed-tools: Read, Grep, Glob, Bash(find:*), Bash(cat:*), Bash(head:*), Bash(tree:*)
---

# Execution Planner

Transform an approved, reviewed design into a plan so specific that builder agents execute without asking a single clarifying question.

## Before Starting

1. Read approved design from `docs/designs/`
2. Read style guides from `docs/STYLE_GUIDE_*.md`
3. Run `tree -L 3 src/` to get current file structure

## Planning Rules

### Task Atomicity
- Each task modifies 1-5 files maximum
- Each task has one clear objective
- Each task can be validated independently
- Each task lists EXACT file paths (not "the component file")

### File Ownership
- No two task groups modify the same file
- Shared files (route index, types) owned by one group, imported by others
- If conflict exists, sequence the dependency explicitly

### Agent Groups
- Maximum 5 tasks per group
- Group by layer: frontend-components, frontend-hooks, backend-routes, backend-services, database-migrations, ai-tools, mapbox-layers
- Each group → one builder agent

### Code Examples
For every task:
- Exact code pattern (from existing codebase via style guide)
- Exact imports
- Exact function signatures

### Test Cases
For every task:
- Named test cases: description, setup, action, expected result
- Edge cases explicitly listed
- Exact file path for test

## Output Format

```markdown
# Execution Plan: [Feature Name]
## Date: [ISO date]
## Design: docs/designs/[name]-design.md
## Status: DRAFT

### Agent Group A: [Layer Name]
**Owner:** Builder Agent A
**Files Owned:**
- `src/path/to/file1.ts`
- `src/path/to/file2.ts`

#### Task A.1: [Task Name]
- **Objective:** [single sentence]
- **Files:** [exact paths]
- **Dependencies:** [other tasks or "none"]
- **Pattern:**
  ```typescript
  // Exact code pattern from codebase
  ```
- **Acceptance Criteria:**
  1. [Testable statement]
  2. [Testable statement]
- **Test Cases:**
  - TC-A1-01: [Name] — Setup: ... Action: ... Assert: ...
  - TC-A1-02: [Name] — Setup: ... Action: ... Assert: ...

### Dependency Graph
[ASCII diagram showing task ordering]

### Integration Verification
[How to verify all groups work together]
```

Save to: `docs/plans/[feature-name]-plan.md`

## After Saving

1. Remind user to run `/pmatch` to verify plan-vs-design alignment
2. After pmatch passes and user approves, proceed to `/build`
