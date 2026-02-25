---
name: patterns
description: Extract codebase patterns into style guide documents. Run at the start of a feature cycle or when codebase has changed significantly. Triggers on "extract patterns", "style guide", "update patterns", "phase 0".
model: claude-sonnet-4-5-20250929
allowed-tools: Read, Grep, Glob, Bash(*), Write(docs/STYLE_GUIDE_*)
---

# Codebase Pattern Extraction

Analyze the existing codebase and extract a living style guide. Document what IS, not what SHOULD BE.

## Categories

### 1. File Structure
- Directory organization, naming conventions, index patterns, test co-location

### 2. Naming Conventions
- Components, functions, variables, DB columns, API routes, env vars

### 3. API Patterns
- Route handler structure, middleware chain, validation, response envelope, pagination

### 4. Database Patterns
- Query builder vs raw SQL, migrations, PostGIS patterns, connection pooling, transactions

### 5. Frontend Patterns
- Component structure, state management, API calls, Mapbox layers, styling, error boundaries

### 6. AI/MCP Patterns
- Tool definitions, system prompts, response parsing, streaming usage, MCP connections

### 7. Error Handling
- Try/catch patterns, logging format, user-facing messages, retry logic

### 8. Testing Patterns
- File naming, setup/teardown, mocks, assertion style

## Output

For each pattern:
- Pattern name
- Code example copied from actual codebase (with file:line citation)
- Variations found (intentional vs inconsistent)

Save to:
- `docs/STYLE_GUIDE_FRONTEND.md`
- `docs/STYLE_GUIDE_BACKEND.md`
- `docs/STYLE_GUIDE_DATA.md`

## Rules
- Do NOT invent patterns. Only document what exists.
- Do NOT recommend changes. Only describe reality.
- Cite specific files and line numbers for every pattern.
