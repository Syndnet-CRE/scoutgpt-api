---
name: qd
description: Documentation freshness audit. Verifies docs reflect current codebase state after a build. Use after /build. Triggers on "doc check", "docs fresh", "documentation audit", "qd".
model: claude-sonnet-4-5-20250929
allowed-tools: Read, Grep, Glob, Bash(find:*), Bash(cat:*)
---

# Documentation Freshness Audit

Verify project documentation reflects the current state after the build.

## Checks
- README reflects new features/changes
- API documentation matches actual endpoints
- Environment variable documentation is complete
- Database schema documentation matches migrations
- MCP tool documentation matches tool definitions
- ATTOM field mapping documentation is current
- Style guides still accurate (no new patterns introduced that aren't documented)

## Output

For each stale document:
```
FILE: [path]
SECTION: [which section]
ISSUE: [what's wrong]
SUGGESTED UPDATE: [what it should say]
```

Save to: `docs/qa/[feature-name]-qd.md`
