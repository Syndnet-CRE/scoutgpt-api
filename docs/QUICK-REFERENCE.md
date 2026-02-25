# Agent System — Quick Reference

## Pipeline Flow

```
Phase 0 (patterns) → /arm (brief) → /design → /ar (review) → /plan → /pmatch → /build → /pmatch → QA
```

## Commands

| Cmd | When | Input | Output | Gate |
|-----|------|-------|--------|------|
| **Phase 0** | New feature cycle | Codebase | `STYLE_GUIDE_*.md` | — |
| **/arm** | Have a fuzzy idea | Your brain dump | `[name]-brief.md` | Human approves |
| **/design** | Brief approved | Brief + style guides | `[name]-design.md` | Human approves |
| **/ar** | Design approved | Design + codebase | `[name]-ar-v[N].md` | No CRIT/HIGH left |
| **/plan** | Review passed | Design + file tree | `[name]-plan.md` | Human approves |
| **/pmatch** | Plan or build done | Source doc + target doc | `[name]-drift.md` | No drift |
| **/build** | Plan approved | Plan + scoped files | Implementation code | /pmatch clean |
| **/denoise** | Build complete | Changed files | Cleaned files | — |
| **/qf** | Post-denoise | Frontend files | Violation report | All clear |
| **/qb** | Post-denoise | Backend files | Violation report | All clear |
| **/qd** | Post-build | Doc files | Staleness report | All clear |
| **/security** | Post-build | All files (read-only) | OWASP report | No CRIT/HIGH |

## Short Pipeline (small changes)

```
/arm → /design → /plan → /build → /qf + /qb
```

## Full Pipeline (major features)

```
Phase 0 → /arm → /design → /ar → /plan → /pmatch → /build → /pmatch → full QA
```

## Cognitive Tiers

- **Opus:** /arm, /design, /ar lead, /plan, /build lead, /pmatch lead
- **Sonnet:** /ar reviewers, /pmatch extractors, /build builders, all QA
- **Haiku:** Proxy tasks only (if routing to external models)

## Context Budgets

| Phase | Max files | Why |
|-------|-----------|-----|
| /arm | 0 | Conversation only |
| /design | 10-15 | Style guides + relevant code |
| /ar | 15-20/reviewer | Design + codebase |
| /plan | ~10 | Design + file tree |
| /build | 3-5/builder | Task scope only |
| QA | Layer-scoped | Per audit type |

## Git Checkpoints

```bash
# Every phase commits. Roll back anytime:
git log --oneline feature/[name]
git reset --hard <checkpoint>
```

## Golden Rules

1. **Context is noise** — less context = higher IQ
2. **Builder ≠ validator** — separate contexts always
3. **If the builder guesses, the planner failed**
4. **Git is the undo button** — commit after every phase
5. **Human approves every gate** — no auto-advancement
