---
name: qf
description: Frontend quality audit against project style guide. Use after /denoise. Triggers on "frontend audit", "frontend quality", "qf".
model: claude-sonnet-4-5-20250929
allowed-tools: Read, Grep, Glob, Bash(find:*), Bash(cat:*)
---

# Frontend Quality Audit

Audit changed frontend files against `docs/STYLE_GUIDE_FRONTEND.md`.

## Scope
Only files changed in current feature branch: `git diff --name-only main -- 'src/components/' 'src/hooks/' 'src/pages/' 'src/api/'`

## Checklist
- Component structure matches style guide pattern
- Hooks follow naming convention (use[Name])
- API calls use project's fetch wrapper
- Error boundaries in place for new routes
- Loading/error/empty states implemented
- Mapbox layers follow existing layer management pattern
- Tailwind classes follow project conventions (no inline styles where Tailwind exists)
- Accessibility: all interactive elements have labels
- Bundle: no unnecessarily large imports (check for tree-shaking issues)
- No hardcoded strings that should be constants or env vars

## Output

For each violation:
```
FILE: [path]
LINE: [number]
RULE: [style guide rule]
CURRENT: [what code does]
EXPECTED: [what it should do]
AUTOFIX: yes | no
```

Save to: `docs/qa/[feature-name]-qf.md`
