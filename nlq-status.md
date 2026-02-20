# ScoutGPT NLQ v2 — Implementation Status

**Last Updated:** 2026-02-20
**Current Phase:** ALL 6 PHASES COMPLETE ✅ — Bug fixes + data audit next

---

## Completion Summary

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ | filters_registry deployed (96 filters, 13 categories) |
| Phase 2 | ✅ | Query builder — validates, builds SQL, executes, runs insights |
| Phase 3 | ✅ | Intent router — Haiku classifies 5 intents |
| Phase 4 | ✅ | Filter extraction — Sonnet + registry context |
| Phase 5 | ✅ | Response generator — deterministic templates |
| Phase 6 | ✅ | Cleanup — archived legacy files, removed dead code |

---

## Known Bugs (Pre-Stress Test)

### BUG-001: spatial.bbox.split is not a function
- **Location:** `services/queryBuilder.js` — `buildSpatialClause()`
- **Cause:** bbox passed as array `[-97.9, 30.1, -97.6, 30.5]` but code calls `.split()` expecting a string
- **Impact:** Every property_search with bbox context fails v2 pipeline, falls back to legacy
- **Status:** NOT FIXED — must fix before stress testing

---

## Known Data Gaps (From Phase 4 Testing)

**NEEDS VERIFICATION** — Last checked during Phase 4. Full Neon audit required.

| Table | Suspected Issue | Filters Affected |
|-------|----------------|-----------------|
| `ownership` | All rows empty | absentee-owner, corporate-owner, trust-owner, owner-occupied |
| `current_loans` | No loan records | loan-due-date, interest-rate, interest-rate-type, loan-amount, lender-name |
| `tax_assessments` | tax_delinquent_year all NULL | tax-delinquent |
| `foreclosure_records` | Table empty | foreclosure-status, auction-date, default-amount |

**Tables believed to have data:**
- properties (444K rows), property_details, property_valuations, climate_risk, building_permits, sales_transactions

---

## Final Architecture
User message → POST /api/chat
→ Layer 1: Intent Router (Haiku) — classifies into 5 intents
→ general_chat → Haiku response (no DB, no Sonnet)
→ clarification_needed → return question
→ property_search → Layer 2: Filter Extraction (Sonnet + registry)
→ Layer 3: Query Builder (deterministic SQL, dynamic SELECT)
→ Layer 4: Response Generator (deterministic templates)
→ On error: fallback to existing Sonnet pipeline
→ property_detail → existing pipeline (claudeService.js)
→ market_analysis → existing pipeline (claudeService.js)

## Files Summary

### v2 Pipeline
| File | Lines | Purpose |
|------|-------|---------|
| `services/registryService.js` | ~113 | Load + cache filters_registry |
| `services/queryBuilder.js` | ~700 | Validate filters, build SQL, execute, insights |
| `services/intentRouter.js` | ~80 | Haiku intent classification |
| `knowledge/prompts/intent-router.js` | ~60 | Layer 1 system prompt |
| `services/filterExtractor.js` | ~80 | Sonnet filter extraction |
| `knowledge/prompts/filter-extractor.js` | ~150 | Layer 2 system prompt + registry context |
| `services/responseGenerator.js` | ~250 | Deterministic response templates |

### Archived (Phase 6)
| File | Replaced By |
|------|-------------|
| `knowledge/archived/intent-classifier.js` | `services/intentRouter.js` |
| `knowledge/archived/thesaurus.js` | `filters_registry.nlq_aliases` |
| `knowledge/archived/dictionary.js` | `filters_registry.allowed_values` |

### Still Active (legacy)
| File | Used By |
|------|---------|
| `services/claudeService.js` | property_detail, market_analysis intents |
| `knowledge/system-prompt.js` | System prompt for legacy pipeline |
| `knowledge/distress-signals.js` | Distress scoring framework |

---

## Environment
- Mac Mini M4 (dev server)
- scoutgpt-api repo: `~/scoutgpt-api`
- Neon: PostgreSQL 16 + PostGIS, US East Ohio
- Render: auto-deploys from main branch
- Node.js + Express on port 3001
- Claude Code terminal available

---

## Next Steps

1. **Neon database audit** — Full row counts, column population rates, data quality check across all 14 tables
2. **Fix BUG-001** — bbox array vs string in queryBuilder.js
3. **Stress test** — 20 variations per asset class, full pipeline logging to CSV
4. **Fix bugs found in stress test**
5. **property_detail + market_analysis modernization**
