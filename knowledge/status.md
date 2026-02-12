# ScoutGPT Knowledge Base — Sprint Status

> **Last Updated:** February 12, 2026
> **Repo:** https://github.com/Syndnet-CRE/scoutgpt-api
> **Branch:** main

---

## Completed Sprints

### Sprint 2a: CRE Dictionary, Thesaurus & Asset Taxonomy ✅
**Commit:** `7e9e893` — `feat(knowledge): add CRE dictionary, thesaurus, and asset taxonomy`

| File | Purpose | Tests |
|------|---------|-------|
| `knowledge/dictionary.js` | 73 ATTOM numeric codes → CRE names, 22 code groups (MULTIFAMILY, OFFICE, RETAIL, INDUSTRIAL, LAND, etc.), helper functions | 79 |
| `knowledge/thesaurus.js` | 100+ user synonyms → canonical code groups. "apartments" → MULTIFAMILY codes, "NNN" → RETAIL code 139 + scaleFilter, "commercial" → ALL_COMMERCIAL_CODES | — |
| `knowledge/asset-taxonomy.js` | Size-based subtypes (code + area_building → "Small Apartment Building" vs "Major Apartment Community"), commercial detection, land detection, price metric selection | — |
| `knowledge/test.js` | Full test suite for dictionary, thesaurus, taxonomy | 79 pass |

**Key facts discovered during database audit:**
- `property_use_standardized` contains **numeric ATTOM codes** (e.g., '369'), NOT text labels
- `property_use_code` is NULL across all records
- `units_count` is 0/NULL across all records — use `area_building` as size proxy
- 444K+ properties in Travis County dataset

### Sprint 2b: Distress Signals & Opportunity Scoring ✅
**Commit:** `e6f58a2` — `feat(knowledge): add distress signals and opportunity scoring`

| File | Purpose | Tests |
|------|---------|-------|
| `knowledge/distress-signals.js` | 10 distress signal evaluators, composite Opportunity Score (0-100), score labels (Critical/High/Moderate/Low/Stable) | 49 |
| `knowledge/test-distress.js` | Full test suite with mock property data — heavy distress, stable, partial data, null input | 49 pass |

**10 Distress Signals:**
1. Pre-Foreclosure / NOD (weight: 25)
2. Tax Delinquency (weight: 10-25, tiered by years)
3. High LTV / Underwater (weight: 10-25, tiered by LTV %)
4. Declining Value (weight: 10)
5. Absentee Owner + No Maintenance (weight: 15)
6. Estate / Trust Ownership (weight: 15) — excludes "REAL ESTATE" business names
7. Mom-and-Pop Owner (weight: 8)
8. Below-Market Value (weight: 12)
9. Distressed Sale History (weight: 20)
10. Vacant / Unoccupied estimated (weight: 10)

**Score normalization:** Divides by evaluable signal max (not total 165), so partial data still produces meaningful scores. Missing signals reported in `unevaluated` array.

### Sprint 3a: Intent Classifier ✅
**Commit:** `be79146` — `feat(knowledge): add intent classifier with 12 intent types and parameter extraction`

| File | Purpose | Tests |
|------|---------|-------|
| `knowledge/intent-classifier.js` | 12 CRE intent categories, regex-weighted classification, parameter extraction (ZIP, address, $, SF, acres, units, year, timeframe, radius, owner type, distress flags, vague terms), smart defaults, named area → ZIP mapping, full pipeline function | 71 |
| `knowledge/test-intent.js` | 26 query classification tests, 24 parameter extraction tests, smart defaults, full pipeline | 71 pass |

**12 Intent Types:**
1. PROPERTY_SEARCH — "Find [type] in [location]"
2. COMPARABLE_SALES — "Show me comps for [address]"
3. DISTRESSED_SCREEN — "Find distressed [type] in [area]"
4. OWNER_RESEARCH — "Who owns [address]?"
5. SITE_ANALYSIS — "Due diligence on [address]"
6. MARKET_STATISTICS — "Market stats for [ZIP]"
7. INVESTMENT_ANALYSIS — "Equity position on [address]"
8. DEVELOPMENT_POTENTIAL — "Find development sites"
9. PORTFOLIO_QUERY — "All properties owned by [entity]"
10. TREND_ANALYSIS — "How have prices changed?"
11. RISK_ASSESSMENT — "Flood risk for [address]"
12. PERMIT_ACTIVITY — "What permits near [location]?"

**Parameter extraction handles:**
- Asset class via thesaurus ("apartments" → MULTIFAMILY codes)
- ZIP codes, named areas (South Austin → [78704, 78741, 78745, 78748, 78749])
- US addresses
- Dollar amounts ($1.5M, $500K, under $2M, over $500K)
- Building SF, lot acres, units (units → SF proxy at ~900 SF/unit)
- Year built, timeframe, radius
- Owner type flags (absentee, corporate, mom-and-pop, trust, estate)
- Distress flags (tax delinquent, foreclosure, high equity)
- Vague terms ("big", "new", "old", "cheap" → context-specific filters)
- Property class (Class A/B/C/D)
- Multi-intent detection

---

## In Progress

### Sprint 3b: System Prompt & Chat Integration 🔄
**Goal:** Build `knowledge/system-prompt.js` that generates the CRE-aware system prompt for `claudeService.js`. This is the critical file that makes Claude understand CRE queries, use the right tools, and format output correctly.

**What it does:**
- Injects CRE domain knowledge (asset classes, code mappings, distress signals)
- Defines tool usage instructions (when to call which tool, parameter mapping)
- Sets output formatting rules (templates, tables, caveats, follow-ups)
- Handles data limitations transparently (units_count unavailable, NOI requires owner financials, etc.)

---

## Not Yet Started

### Sprint 4: Tool Enhancements
Upgrade `search_properties` in `propertyService.js` to accept:
- Array of property_use_standardized codes (not just single exact match)
- `minBuildingSf`, `maxBuildingSf` filters
- `minYearBuilt`, `maxYearBuilt` filters
- `ownerName` search
- Implement `taxDelinquent` SQL (JOIN to tax_assessments)
- Implement `highEquity` SQL (JOIN to property_valuations)
- `recentSaleMonths` filter

### Sprint 5: Advanced Tools
- `find_comparable_sales` — spatial + scoring comp engine
- `search_distressed` — multi-signal distress query
- `search_owners` — portfolio detection, entity resolution
- `get_market_stats_v2` — medians, volume, investor %, distress rate

### Sprint 6: Output Formatting
- Template rendering functions for each report type (A-J)
- Artifact generation for complex analyses

---

## Test Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| `knowledge/test.js` | 79 | ✅ All pass |
| `knowledge/test-distress.js` | 49 | ✅ All pass |
| `knowledge/test-intent.js` | 71 | ✅ All pass |
| **Total** | **199** | **✅ 0 failures** |

---

## File Inventory

```
knowledge/
├── dictionary.js          # ATTOM codes → CRE names, code groups
├── thesaurus.js           # User synonyms → canonical groups
├── asset-taxonomy.js      # Size-based subtypes, type detection
├── distress-signals.js    # 10 signals, opportunity scoring
├── intent-classifier.js   # 12 intents, param extraction
├── test.js                # Dictionary/thesaurus/taxonomy tests
├── test-distress.js       # Distress signal tests
├── test-intent.js         # Intent classifier tests
└── status.md              # This file
```

---

## Key Design Decisions

1. **Numeric ATTOM codes, not text labels** — property_use_standardized contains codes like '369', not 'APARTMENT'. All CRE knowledge maps through these codes.

2. **units_count unavailable** — Entire database has 0/NULL for units. area_building is the universal size proxy. ~900 SF/unit for multifamily translation with caveat.

3. **22 code groups, not just 6** — Fine-grained groups (SELF_STORAGE, MEDICAL_OFFICE, RESTAURANT, etc.) alongside major groups (MULTIFAMILY, OFFICE, RETAIL, INDUSTRIAL, LAND, HOSPITALITY).

4. **Opportunity Score normalizes to evaluable signals** — If only 4 of 10 signals can be evaluated, score is based on those 4's max, not all 10. Prevents partial data from artificially deflating scores.

5. **"REAL ESTATE" excluded from estate detection** — "GREYSTAR REAL ESTATE LLC" shouldn't trigger estate/trust signal. Business term stripped before checking.

6. **Market-agnostic** — All logic works with any US ATTOM dataset. Travis County is starting data but nothing is hardcoded to Austin except the AREA_TO_ZIPS convenience mapping.
