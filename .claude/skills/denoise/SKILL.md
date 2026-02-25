---
name: denoise
description: Remove dead code and noise after a build. Strips unused imports, console.logs, commented-out code, unused variables. Use after /build completes. Triggers on "clean up", "denoise", "dead code".
model: claude-sonnet-4-5-20250929
allowed-tools: Read, Grep, Glob, Write, Bash(find:*), Bash(grep:*)
---

# Dead Code & Noise Removal

Identify and remove noise from recently changed files. Only REMOVE. Never ADD or MODIFY logic.

## Targets
- Unused imports
- Commented-out code blocks (NOT documentation comments)
- `console.log` / debug statements not wrapped in a debug utility
- Unused variables and functions
- Duplicate type definitions
- Empty files or placeholder content

## Rules
- Only touch files changed in the current feature branch: `git diff --name-only main`
- If unsure whether something is dead code, flag for human review — do NOT remove
- Preserve all JSDoc/TSDoc comments
- Preserve all TODO/FIXME comments
- Preserve intentional debug utilities (logger.debug, etc.)

## Output

```markdown
# Denoise Report: [Feature Name]

### Removed
| File | Line | What | Why |
|------|------|------|-----|

### Flagged for Review
| File | Line | What | Uncertain Because |
|------|------|------|------------------|
```

Save to: `docs/qa/[feature-name]-denoise.md`
Commit: `git commit -am "qa: denoise — [feature-name]"`
