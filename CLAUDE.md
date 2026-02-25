# ScoutGPT — Project Memory

## What This Is

ScoutGPT is an AI-powered commercial real estate intelligence platform ("Bloomberg Terminal for CRE"). React/Vite frontend, Node/Express backend, PostgreSQL/PostGIS database, Claude API with 7 tools and 3 MCP servers, Mapbox Vector Tiles for maps, ATTOM Data (842 fields, 158M+ properties) as primary data source.

## Architecture

- **Frontend repo:** React/Vite, Tailwind, Mapbox GL JS
- **Backend repo:** Node/Express, PostgreSQL 16 + PostGIS (Neon, US East Ohio)
- **AI layer:** Claude API with tool use, 4 modes (Scout, Zoning-GIS, Comps, Site Analysis)
- **Data:** ATTOM nationwide property data, licensed agreement
- **Deploy:** [fill in your deploy target]

## How to Work

- Read `docs/STYLE_GUIDE_FRONTEND.md` before writing frontend code
- Read `docs/STYLE_GUIDE_BACKEND.md` before writing backend code
- Read `docs/STYLE_GUIDE_DATA.md` before writing database/ATTOM queries
- Run `npm run lint` to check code style
- Run `npm run test` to run tests
- Run `npm run build` to verify compilation

## Build Workflow

This project uses a phased agent workflow. Every feature goes through quality gates:

1. `/arm` — Brief (requirements extraction)
2. `/design` — First-principles design
3. `/ar` — Adversarial review (3 independent reviewers)
4. `/plan` — Atomic execution plan
5. `/pmatch` — Drift detection
6. `/build` — Parallel implementation
7. QA pipeline: `/denoise` → `/qf` → `/qb` → `/qd` → `/security-review`

Full docs: `@docs/AGENT-SYSTEM.md`
Quick reference: `@docs/QUICK-REFERENCE.md`

## Critical Rules

- **Never modify files outside your assigned scope** during `/build` tasks
- **Never skip quality gates** — each phase must be approved before advancing
- **Parameterize all SQL queries** — no string interpolation, ever
- **ATTOM API keys stay server-side** — never in client bundles
- **PostGIS queries must use spatial indexes** — ST_DWithin over ST_Distance
- **All new endpoints need rate limiting** per subscription tier (Core/Elite)
- **Response envelope:** `{ success: boolean, data: T, error?: string }`
- **Git:** Always work on feature branches. Commit after each phase.

## Subscription Tiers

- Core: $100/month
- Elite: $200/month
- Enforce tier-based access in middleware, not in route handlers

## Key Directories

- `docs/briefs/` — Approved briefs
- `docs/designs/` — Approved designs
- `docs/plans/` — Approved execution plans
- `docs/reviews/` — Adversarial review reports
- `docs/drift/` — Drift detection reports
- `docs/qa/` — QA pipeline reports
