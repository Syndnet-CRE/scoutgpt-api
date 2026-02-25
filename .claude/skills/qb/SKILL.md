---
name: qb
description: Backend quality audit against project style guide. Use after /denoise. Triggers on "backend audit", "backend quality", "qb".
model: claude-sonnet-4-5-20250929
allowed-tools: Read, Grep, Glob, Bash(find:*), Bash(cat:*)
---

# Backend Quality Audit

Audit changed backend files against `docs/STYLE_GUIDE_BACKEND.md`.

## Scope
Only files changed in current feature branch: `git diff --name-only main -- 'src/routes/' 'src/middleware/' 'src/models/' 'src/services/'`

## Checklist
- Route handlers follow middleware chain pattern
- Request validation present on all new endpoints
- Response envelope matches standard: `{ success, data, error? }`
- Error handling follows project error format
- Database queries use parameterized queries (NO string interpolation)
- PostGIS queries use spatial indexes
- ATTOM field access uses data dictionary mappings
- Transaction handling follows project pattern
- Rate limiting configured for new endpoints (per tier: Core/Elite)
- Logging follows structured logging format
- No ATTOM API keys in client-accessible code
- MCP tool definitions follow existing conventions

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

Save to: `docs/qa/[feature-name]-qb.md`
