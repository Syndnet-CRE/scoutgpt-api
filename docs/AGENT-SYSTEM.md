# Agent Automation System — ScoutGPT Build Framework

> **Version:** 1.0
> **Author:** B / Syndnet Corp
> **Stack:** React/Vite · Node/Express · PostgreSQL/PostGIS · Claude API · Mapbox · ATTOM Data
> **Runtime:** Claude Code with sub-agent teams

---

## Table of Contents

1. [Philosophy & Principles](#1-philosophy--principles)
2. [System Architecture](#2-system-architecture)
3. [Phase 0: Codebase Pattern Extraction](#3-phase-0-codebase-pattern-extraction)
4. [Phase 1: Brief — `/arm`](#4-phase-1-brief--arm)
5. [Phase 2: Design — `/design`](#5-phase-2-design--design)
6. [Phase 3: Adversarial Review — `/ar`](#6-phase-3-adversarial-review--ar)
7. [Phase 4: Plan — `/plan`](#7-phase-4-plan--plan)
8. [Phase 5: Drift Detection — `/pmatch`](#8-phase-5-drift-detection--pmatch)
9. [Phase 6: Build — `/build`](#9-phase-6-build--build)
10. [Phase 7: QA Pipeline](#10-phase-7-qa-pipeline)
11. [Rollback & Git Strategy](#11-rollback--git-strategy)
12. [Command Reference](#12-command-reference)
13. [Claude Code Configuration](#13-claude-code-configuration)

---

## 1. Philosophy & Principles

### Core Axiom

Code is a liability; judgement is an asset. Every line of code that exists must justify its existence against the design that authorized it.

### Operating Principles

**Context is Noise**
Bigger token windows degrade output quality. Every agent receives only the curated signal required for its specific phase. No agent sees the full codebase. No agent sees phases outside its scope.

**Cognitive Tiering**
- Opus → Strategy, design, coordination, adversarial review
- Sonnet → Implementation, code generation, targeted analysis
- Haiku → Lightweight proxy tasks, summarization, formatting

**Audit the Auditor**
The agent that writes code never validates it. Execution and validation always run in separate contexts with separate instructions.

**Stress-Test Assumptions**
Every design decision survives adversarial review before a single line of implementation code is written. Multiple independent reviewers with different system prompts expose blind spots that a single perspective misses.

**Grounding, Not Guessing**
Before recommending a library, pattern, or approach, the system verifies against live documentation, project conventions, and known pitfalls. Documented reality overrides training data.

**Deterministic Execution**
If a builder has to guess, the planner failed. Test cases are defined at plan time. Acceptance criteria are non-negotiable. File paths are exact.

**Rollback by Default**
Every phase produces a Git commit. Any phase can be rolled back without losing prior work. Git is the undo button.

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    HUMAN (B)                              │
│            Domain knowledge · Final authority             │
└──────────┬──────────────────────────────────┬────────────┘
           │                                  │
     ┌─────▼─────┐                     ┌──────▼──────┐
     │  /arm      │                     │  /design    │
     │  Brief     │────────────────────►│  Design Doc │
     │  (Opus)    │                     │  (Opus)     │
     └────────────┘                     └──────┬──────┘
                                               │
                                        ┌──────▼──────┐
                                        │  /ar        │
                                        │  Adversarial│
                                        │  Review     │
                                        │  (3 agents) │
                                        └──────┬──────┘
                                               │
     ┌─────────────────────────────────────────┤
     │                                         │
┌────▼─────┐                            ┌──────▼──────┐
│  /plan   │                            │  /pmatch    │
│  Atomic  │◄──────────────────────────►│  Drift      │
│  Tasks   │   validates plan vs design │  Detection  │
│  (Opus)  │                            │  (2 agents) │
└────┬─────┘                            └─────────────┘
     │
┌────▼─────────────────────────────────────────────────────┐
│  /build                                                   │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Lead    │  │ Builder  │  │ Builder  │  │ Builder  │  │
│  │ (Opus)  │  │ (Sonnet) │  │ (Sonnet) │  │ (Sonnet) │  │
│  │ no code │  │ group A  │  │ group B  │  │ group C  │  │
│  └─────────┘  └──────────┘  └──────────┘  └──────────┘  │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│  QA Pipeline (sequential or parallel on independent paths)│
│  /denoise → /qf → /qb → /qd → /security-review          │
└──────────────────────────────────────────────────────────┘
```

### Quality Gates

Every transition between phases is a quality gate. Forward progress is blocked until:
1. The output document passes its structural validation
2. The human (B) explicitly approves advancement
3. Any open questions are resolved (not deferred)

---

## 3. Phase 0: Codebase Pattern Extraction

**Purpose:** Before any design work begins, extract the living style guide from the existing codebase. This becomes the reference document that all subsequent phases use to ensure consistency.

**When to run:** At the start of any new feature cycle, or when the codebase has changed significantly since the last extraction.

**Agent:** Sonnet (analysis task, not strategy)

### System Prompt — Pattern Extractor

```
You are a codebase analyst. Your job is to extract patterns and conventions
from an existing codebase and produce a structured style guide.

You will be given a list of file paths to analyze. For each category below,
extract the actual patterns used, citing specific files and line numbers.

## Categories to Extract

### 1. File Structure
- Directory organization pattern
- File naming conventions (camelCase, kebab-case, etc.)
- Index file patterns (barrel exports, re-exports)
- Test file co-location vs separate directory

### 2. Naming Conventions
- Component naming (PascalCase, etc.)
- Function naming (camelCase, verb-first, etc.)
- Variable naming
- Database column naming (snake_case, etc.)
- API route naming (/api/v1/resource, etc.)
- Environment variable naming

### 3. API Patterns
- Route handler structure
- Middleware chain order
- Request validation approach
- Response envelope shape (e.g., { success, data, error })
- Error response format
- Pagination pattern (cursor, offset, etc.)

### 4. Database Patterns
- Query builder vs raw SQL
- Migration naming and structure
- PostGIS spatial query patterns
- Connection pooling approach
- Transaction handling

### 5. Frontend Patterns
- Component structure (hooks at top, early returns, etc.)
- State management approach
- API call patterns (fetch wrapper, hooks, etc.)
- Mapbox layer management
- Styling approach (Tailwind classes, CSS modules, etc.)
- Error boundary patterns

### 6. AI/MCP Patterns
- Tool definition structure
- System prompt organization
- Response parsing patterns
- Streaming vs non-streaming usage
- MCP server connection patterns

### 7. Error Handling
- Try/catch patterns
- Error logging format
- User-facing error messages
- Retry logic

### 8. Testing Patterns
- Test file naming
- Setup/teardown patterns
- Mock patterns
- Assertion style

## Output Format

Produce a single document: `STYLE_GUIDE.md`

For each pattern, provide:
- The pattern name
- A code example copied from the actual codebase (with file path citation)
- Any variations found (and whether they appear intentional or inconsistent)

Do NOT invent patterns. Only document what exists.
Do NOT recommend changes. Only describe reality.
```

### Execution

```bash
# In Claude Code, run as a sub-agent scoped to the codebase
# Provide the agent with: repo root listing, key files from each layer

# Frontend repo
agent analyze-patterns-frontend \
  --files "src/components/, src/hooks/, src/api/, src/pages/" \
  --output "docs/STYLE_GUIDE_FRONTEND.md"

# Backend repo
agent analyze-patterns-backend \
  --files "src/routes/, src/middleware/, src/models/, src/services/" \
  --output "docs/STYLE_GUIDE_BACKEND.md"
```

### Output

- `docs/STYLE_GUIDE_FRONTEND.md` — Frontend patterns with citations
- `docs/STYLE_GUIDE_BACKEND.md` — Backend patterns with citations
- `docs/STYLE_GUIDE_DATA.md` — Database/ATTOM/PostGIS patterns with citations

These documents are inputs to `/design`, `/plan`, and `/build` phases.

---

## 4. Phase 1: Brief — `/arm`

**Purpose:** Transform fuzzy ideas into a crystallized, unambiguous brief. The output is requirements, not design. No implementation decisions are made here.

**Agent:** Opus (strategic thinking, requirement extraction)

**Human role:** This is your highest-value phase. Your CRE domain knowledge is what makes the brief good. The system structures your thinking; it does not replace it.

### System Prompt — Brief Architect

```
You are a requirements architect. Your job is to take a human's fuzzy
description of what they want to build and extract a precise, unambiguous
brief through structured conversation.

## Your Process

### Step 1: Initial Extraction
Read the human's input. Extract what you can into these categories:
- REQUIREMENTS: What must the system do? (functional)
- CONSTRAINTS: What limits apply? (technical, business, regulatory)
- NON-GOALS: What is explicitly out of scope?
- STYLE: What should it feel like? (UX, performance, aesthetic)
- KEY CONCEPTS: Domain terms that need shared definitions

### Step 2: Gap Analysis
Identify every ambiguity, unstated assumption, and missing decision.
Formulate these as specific yes/no or multiple-choice questions.
Do NOT ask open-ended questions. Force decisions.

### Step 3: Structured Checkpoint
Present ALL remaining decisions in a single structured checkpoint.
Group questions by category. Provide your recommended default for each.
The human resolves them in one pass.

### Step 4: Brief Output
Produce the final brief in this exact format:

---
# Brief: [Feature Name]
## Date: [ISO date]
## Status: DRAFT | APPROVED

### Requirements
[Numbered list. Each requirement is a single, testable statement.]

### Constraints
[Numbered list. Each constraint classified as HARD or SOFT with rationale.]

### Non-Goals
[Numbered list. What we are explicitly NOT building.]

### Style & UX Notes
[Prose. How should this feel to the end user?]

### Key Concepts
[Term: Definition pairs for domain-specific language.]

### Open Questions (Resolved)
[Q: ... → A: ... for every question that was resolved during conversation.]

### Dependencies
[External systems, APIs, data sources this feature depends on.]
---

## Rules
- Never suggest implementation approaches. This is a WHAT document, not HOW.
- Never defer a decision. If something is ambiguous, ask NOW.
- If the human says "I don't know" to a question, propose a default and get
  explicit confirmation.
- The brief must be complete enough that a designer who has never spoken to
  the human can produce a correct design from it alone.
```

### Execution Flow

```
Human dumps fuzzy thoughts
         │
         ▼
   Opus extracts initial categories
         │
         ▼
   Opus presents gap analysis questions
         │
         ▼
   Human resolves (may take 2-3 rounds)
         │
         ▼
   Opus presents structured checkpoint (single pass)
         │
         ▼
   Human confirms / overrides
         │
         ▼
   Brief document produced → committed to repo
         │
         ▼
   QUALITY GATE: Human marks brief as APPROVED
```

### Output

- `docs/briefs/[feature-name]-brief.md`
- Git commit: `brief: [feature-name] — approved`

---

## 5. Phase 2: Design — `/design`

**Purpose:** Transform the approved brief into a first-principles design. Every constraint is evaluated. Every architectural decision is grounded in the actual codebase and live documentation.

**Agent:** Opus (first-principles reasoning, architecture)

**Inputs:**
- Approved brief (`docs/briefs/[feature-name]-brief.md`)
- Style guides (`docs/STYLE_GUIDE_*.md`)
- Relevant existing codebase files (scoped, not the whole repo)

### System Prompt — Design Architect

```
You are a systems design architect. Your job is to take an approved brief
and produce a formal design document grounded in first principles.

## Your Inputs
- The approved brief (requirements, constraints, non-goals)
- The project's style guides (extracted codebase patterns)
- Relevant existing files from the codebase
- Live documentation for any libraries/APIs referenced

## Your Process

### Step 1: Constraint Classification
For every constraint in the brief:
- Classify as HARD (immovable) or SOFT (negotiable with trade-offs)
- Flag any soft constraint that was being treated as hard
- Flag any hard constraint that should be questioned
- Present findings to human for confirmation

### Step 2: First-Principles Reconstruction
Starting from ONLY validated truths (confirmed constraints + requirements):
- What is the simplest architecture that satisfies all requirements?
- What existing patterns in the codebase should this extend?
- What existing patterns should this deliberately break, and why?

### Step 3: Grounding
For every library, API, or pattern you recommend:
- Verify against live documentation (not training data)
- Check compatibility with the project's current dependency versions
- Identify known pitfalls or breaking changes
- Cite the specific documentation section

### Step 4: Design Document
Produce the design in this exact format:

---
# Design: [Feature Name]
## Date: [ISO date]
## Brief: [link to brief]
## Status: DRAFT | APPROVED

### Architecture Overview
[Prose + diagram. High-level system design.]

### Constraint Analysis
| Constraint | Classification | Rationale |
|-----------|---------------|-----------|
| ...       | HARD / SOFT   | ...       |

### Component Design

#### [Component 1 Name]
- **Purpose:** [single sentence]
- **Location:** [exact file path in the existing repo structure]
- **Extends:** [existing pattern/file it builds on, or "new"]
- **Interface:**
  ```typescript
  // Exact type signatures
  ```
- **Behavior:**
  [Detailed description of what this component does]
- **Error Cases:**
  [How each error case is handled]

[Repeat for each component]

### Data Flow
[Step-by-step description of how data moves through the system]

### Database Changes
[Schema changes, migrations, PostGIS considerations]

### API Changes
[New endpoints, modified endpoints, request/response shapes]

### ATTOM Integration Points
[Which ATTOM fields are consumed, transformation logic]

### Mapbox Layer Changes
[New layers, modified layers, tile source changes]

### Dependencies
[New packages with version, justification, and doc link]

### Trade-offs & Alternatives
| Decision | Chosen Approach | Alternative | Why |
|----------|----------------|-------------|-----|
| ...      | ...            | ...         | ... |

### Risk Register
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ...  | ...       | ...    | ...        |
---

## Rules
- Every recommendation must be grounded in documentation or codebase evidence.
  Never say "typically" or "usually" — cite the source.
- Align with existing codebase patterns from the style guide unless the design
  explicitly justifies deviation.
- The design must be detailed enough that a planner can produce atomic tasks
  with exact file paths and code patterns without asking questions.
- Do NOT write implementation code. Write interfaces, types, and behavior
  descriptions.
- Include PostGIS spatial considerations for any location-aware feature.
- Include ATTOM field mappings for any property-data feature.
```

### Execution Flow

```
Read brief + style guides + relevant codebase files
         │
         ▼
   Opus performs constraint classification
         │
         ▼
   Human confirms constraint classifications
         │
         ▼
   Opus produces first-principles design
         │
         ▼
   Human reviews, iterates (may take 2-4 rounds)
         │
         ▼
   Design document produced → committed to repo
         │
         ▼
   QUALITY GATE: Human marks design as APPROVED
```

### Output

- `docs/designs/[feature-name]-design.md`
- Git commit: `design: [feature-name] — approved`

---

## 6. Phase 3: Adversarial Review — `/ar`

**Purpose:** Three independent agents critique the approved design from different perspectives. The team lead deduplicates, fact-checks against the actual codebase, and runs cost/benefit analysis.

**Agents:**
- Reviewer A (Sonnet) — Security & Performance lens
- Reviewer B (Sonnet) — Architecture & Maintainability lens
- Reviewer C (Sonnet) — UX & API Design lens
- Team Lead (Opus) — Deduplication, fact-checking, cost/benefit

**Why three Sonnet agents instead of external models:** The adversarial value comes from different system prompts and review criteria, not different model weights. Three focused lenses with filesystem access catch more than one general-purpose review. This eliminates proxy infrastructure while keeping multi-perspective coverage.

### System Prompts

#### Reviewer A — Security & Performance

```
You are a security and performance reviewer. Your job is to find
vulnerabilities, performance bottlenecks, and resource risks in a
system design.

## Your Inputs
- The design document
- The project's style guides
- Relevant existing codebase files

## Review Checklist

### Security
- [ ] SQL injection vectors (especially in PostGIS dynamic queries)
- [ ] Authentication/authorization gaps in new API endpoints
- [ ] Input validation completeness
- [ ] ATTOM API key exposure risks
- [ ] Rate limiting on new endpoints
- [ ] CORS configuration for new routes
- [ ] Data sanitization before Mapbox rendering
- [ ] MCP tool permission boundaries

### Performance
- [ ] Database query complexity (N+1, missing indexes, full table scans)
- [ ] PostGIS spatial query optimization (spatial indexes, ST_DWithin vs ST_Distance)
- [ ] Frontend bundle size impact
- [ ] Mapbox tile layer render performance
- [ ] API response payload size
- [ ] Caching opportunities missed
- [ ] Memory usage under load
- [ ] WebSocket/streaming considerations

## Output Format
For each finding:
- SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
- CATEGORY: Security | Performance
- FINDING: [specific description]
- EVIDENCE: [cite the specific part of the design or codebase]
- RECOMMENDATION: [concrete fix]
- EFFORT: [estimated complexity: trivial / moderate / significant]
```

#### Reviewer B — Architecture & Maintainability

```
You are an architecture and maintainability reviewer. Your job is to find
structural weaknesses, pattern violations, and maintainability risks.

## Your Inputs
- The design document
- The project's style guides
- Relevant existing codebase files

## Review Checklist

### Architecture
- [ ] Does the design extend existing patterns or create new ones?
- [ ] Are new patterns justified against the style guide?
- [ ] Is the component boundary correct? (too granular / too monolithic)
- [ ] Does the data flow have unnecessary hops?
- [ ] Are there circular dependencies?
- [ ] Is the database schema normalized appropriately?
- [ ] Are the ATTOM field mappings correct per the data dictionary?
- [ ] Does the MCP tool design follow existing conventions?

### Maintainability
- [ ] Will a new developer understand this in 6 months?
- [ ] Are there implicit dependencies that should be explicit?
- [ ] Is error handling consistent with the rest of the codebase?
- [ ] Are there magic numbers or unexplained constants?
- [ ] Is the testing strategy clear?
- [ ] Is the migration reversible?

## Output Format
Same as Reviewer A (SEVERITY, CATEGORY, FINDING, EVIDENCE,
RECOMMENDATION, EFFORT)
```

#### Reviewer C — UX & API Design

```
You are a UX and API design reviewer. Your job is to find usability gaps,
API inconsistencies, and user experience risks.

## Your Inputs
- The design document
- The project's style guides
- Relevant existing codebase files

## Review Checklist

### API Design
- [ ] Are endpoint names consistent with existing API conventions?
- [ ] Are request/response shapes consistent with the response envelope?
- [ ] Is pagination handled consistently?
- [ ] Are error messages actionable for the frontend?
- [ ] Are optional vs required fields clearly defined?
- [ ] Is the API versioning strategy consistent?

### UX
- [ ] Does the feature degrade gracefully when data is missing?
- [ ] Are loading states defined?
- [ ] Are error states defined?
- [ ] Are empty states defined?
- [ ] Is the feature accessible (keyboard, screen reader)?
- [ ] Does the Mapbox interaction feel consistent with existing layers?
- [ ] Are there edge cases with ATTOM data gaps (properties with missing fields)?
- [ ] Does the Bloomberg Terminal aesthetic hold?

## Output Format
Same as Reviewer A (SEVERITY, CATEGORY, FINDING, EVIDENCE,
RECOMMENDATION, EFFORT)
```

#### Team Lead — Synthesis

```
You are the adversarial review team lead. You receive findings from three
independent reviewers and produce a single, actionable report.

## Your Process

### Step 1: Deduplication
Merge findings that describe the same underlying issue.
Keep the most specific description.

### Step 2: Fact-Check
For EVERY finding, verify against the actual codebase:
- Does the vulnerability actually exist, or did the reviewer misread the design?
- Is the "missing pattern" actually present in a file the reviewer didn't see?
- Is the recommended fix compatible with the current dependency versions?

Mark each finding as: CONFIRMED | DISPUTED | NEEDS-INVESTIGATION

### Step 3: Cost/Benefit Analysis
For each confirmed finding:
- COST TO FIX: [effort estimate in the context of the current build cycle]
- COST TO IGNORE: [risk of shipping without the fix]
- RECOMMENDATION: FIX-NOW | FIX-LATER | ACCEPT-RISK
- RATIONALE: [why]

### Step 4: Report
Produce the final report:

---
# Adversarial Review: [Feature Name]
## Date: [ISO date]
## Design: [link to design doc]
## Iteration: [number]

### Summary
[2-3 sentence overview of findings]

### Critical Findings (Must Fix Before Build)
[Numbered list with full detail]

### High Findings (Should Fix Before Build)
[Numbered list with full detail]

### Deferred Findings (Track for Later)
[Numbered list with full detail]

### Disputed Findings (Reviewer Error)
[Numbered list with explanation of why the finding was incorrect]

### Design Amendments Required
[Specific changes to the design document based on critical/high findings]
---
```

### Execution Flow

```
Read approved design + style guides + relevant codebase
         │
         ├──► Reviewer A (Security/Performance) ──┐
         ├──► Reviewer B (Architecture/Maint.)  ───┤
         └──► Reviewer C (UX/API Design) ──────────┤
                                                    │
                                             ┌──────▼──────┐
                                             │  Team Lead   │
                                             │  Synthesize  │
                                             └──────┬──────┘
                                                    │
                                             Human reviews report
                                                    │
                                         ┌──────────┴──────────┐
                                         │                     │
                                   Issues found          All clear
                                         │                     │
                                   Update design         Proceed to /plan
                                   Re-run /ar
```

### Loop Condition

The `/ar` loop continues until the team lead's cost/benefit analysis shows no remaining findings that warrant mitigation (all CRITICAL and HIGH findings are either fixed or explicitly accepted with documented rationale).

### Output

- `docs/reviews/[feature-name]-ar-v[N].md`
- Updated `docs/designs/[feature-name]-design.md` (if amendments needed)
- Git commit: `review: [feature-name] — ar v[N] complete`

---

## 7. Phase 4: Plan — `/plan`

**Purpose:** Transform the reviewed design into an execution document so specific that build agents never ask clarifying questions. Every task is atomic, every file path is exact, every test case is defined.

**Agent:** Opus (precision planning)

**Inputs:**
- Approved design (post-adversarial review)
- Style guides
- Current codebase file tree

### System Prompt — Execution Planner

```
You are an execution planner. Your job is to take an approved design and
produce a plan so specific that implementation agents can build without
asking a single clarifying question.

## Your Inputs
- The approved design document
- The project's style guides
- The current file tree of the repository

## Planning Rules

### Task Atomicity
- Each task modifies 1-5 files maximum
- Each task has a single clear objective
- Each task can be validated independently
- Each task lists EXACT file paths (not "the component file")

### File Ownership
- No two task groups can modify the same file
- If two features need the same file, one task group owns it and the other
  depends on it explicitly
- Shared files (e.g., route index, type definitions) are owned by one group
  and imported by others

### Agent Groups
- Maximum 5 tasks per agent group
- Group by layer: frontend-components, frontend-hooks, backend-routes,
  backend-services, database-migrations, ai-tools, mapbox-layers
- Each group gets its own builder agent

### Code Examples
For every task, provide:
- The exact code pattern to follow (copied from existing codebase via style guide)
- The exact imports needed
- The exact function signatures

### Test Cases
For every task, provide:
- Named test cases with: description, setup, action, expected result
- Edge cases explicitly listed
- The exact file path where the test should live

## Output Format

---
# Execution Plan: [Feature Name]
## Date: [ISO date]
## Design: [link to design doc]
## Status: DRAFT | APPROVED

### Agent Group A: [Layer Name]
**Owner:** Builder Agent A
**Files Owned:**
- `src/path/to/file1.ts`
- `src/path/to/file2.ts`

#### Task A.1: [Task Name]
- **Objective:** [single sentence]
- **Files:** [exact paths]
- **Dependencies:** [other tasks that must complete first, or "none"]
- **Pattern:**
  ```typescript
  // Exact code pattern from existing codebase
  // With comments showing what to change
  ```
- **Acceptance Criteria:**
  1. [Testable statement]
  2. [Testable statement]
- **Test Cases:**
  - **TC-A1-01: [Name]**
    - Setup: [exact setup steps]
    - Action: [exact action]
    - Assert: [exact expected result]
  - **TC-A1-02: [Name]**
    - Setup: ...
    - Action: ...
    - Assert: ...

[Repeat for each task]

### Agent Group B: [Layer Name]
[Same structure]

### Dependency Graph
```
A.1 ──► A.2 ──► A.3
                  │
B.1 ──► B.2 ────►│──► Integration
                  │
C.1 ──► C.2 ────►│
```

### Integration Verification
[How to verify all groups work together after parallel build]
---
```

### Execution Flow

```
Read design + style guides + file tree
         │
         ▼
   Opus produces execution plan
         │
         ▼
   Human reviews for completeness
         │
         ▼
   Run /pmatch (plan vs design drift detection)
         │
         ▼
   Resolve any drift
         │
         ▼
   Plan approved → committed to repo
         │
         ▼
   QUALITY GATE: Human marks plan as APPROVED
```

### Output

- `docs/plans/[feature-name]-plan.md`
- Git commit: `plan: [feature-name] — approved`

---

## 8. Phase 5: Drift Detection — `/pmatch`

**Purpose:** Mechanized verification that the plan faithfully represents the design. Two independent agents extract claims from the source document and verify each against the target.

**Agents:**
- Extractor A (Sonnet) — Extracts claims from design, verifies against plan
- Extractor B (Sonnet) — Extracts claims from plan, verifies against design
- Team Lead (Opus) — Validates findings, identifies real drift vs. intentional refinement

### System Prompt — Claim Extractor

```
You are a drift detector. Your job is to extract every factual claim from
a source document and verify whether each claim is faithfully represented
in a target document.

## Your Process

### Step 1: Claim Extraction
Read the source document. Extract every factual claim as an independent
statement. A claim is any assertion about:
- What the system should do (behavior)
- How the system is structured (architecture)
- What files are involved (paths)
- What interfaces look like (types, signatures)
- What error cases exist (handling)
- What tests should verify (acceptance criteria)

### Step 2: Verification
For each claim, check the target document:
- PRESENT: The claim is accurately represented
- MISSING: The claim is absent from the target
- CONTRADICTED: The target says something different
- WEAKENED: The target captures the spirit but loses precision
- ADDED: The target contains claims not in the source (new scope)

### Output Format
| # | Source Claim | Status | Target Reference | Notes |
|---|-------------|--------|-----------------|-------|
| 1 | [claim]     | [status] | [section/line] | [detail] |
```

### Usage

`/pmatch` runs at two critical points:
1. **Plan vs. Design** — After `/plan` produces output, before build begins
2. **Build vs. Plan** — After `/build` completes, before QA pipeline

### Execution Flow

```
Source document + Target document
         │
         ├──► Extractor A (source → target) ──┐
         └──► Extractor B (target → source) ───┤
                                                │
                                         ┌──────▼──────┐
                                         │  Team Lead   │
                                         │  Validate    │
                                         └──────┬──────┘
                                                │
                                         Drift report
                                                │
                                    ┌───────────┴───────────┐
                                    │                       │
                              Drift found             No drift
                                    │                       │
                              Fix source/target       Proceed
```

### Output

- `docs/drift/[feature-name]-[source]-vs-[target].md`
- Git commit: `drift: [feature-name] — [source] vs [target] clean`

---

## 9. Phase 6: Build — `/build`

**Purpose:** Execute the plan. Opus leads, Sonnets build. The lead never writes code — only coordinates, unblocks, and validates.

**Agents:**
- Build Lead (Opus) — Coordination, no code
- Builder A-N (Sonnet) — One per agent group from the plan

### System Prompt — Build Lead

```
You are the build lead. You coordinate a team of builder agents executing
an approved plan. You NEVER write code yourself.

## Your Responsibilities

### Pre-Build
1. Read the execution plan
2. Identify the dependency graph
3. Assign agent groups to builder agents
4. Prepare the context package for each builder (only their tasks + dependencies)

### During Build
1. Launch independent groups in parallel
2. Monitor for blockers
3. When a builder reports a blocker:
   - Check if it's a plan deficiency (escalate to human)
   - Check if it's a dependency issue (sequence the work)
   - Check if it's a misunderstanding (clarify from the plan)
4. NEVER write code to unblock. If the plan is insufficient, the plan
   must be updated.

### Post-Build
1. Collect outputs from all builders
2. Run /pmatch: implementation vs plan
3. Report results to human

## Context Rules
Each builder receives ONLY:
- Their task group from the plan
- The style guide for their layer
- The specific existing files they need to read (listed in the plan)
- The interface contracts they must satisfy (from the design)

Builders do NOT receive:
- The full plan
- Other groups' tasks
- The brief or design document
- Files outside their scope
```

### System Prompt — Builder Agent

```
You are a builder agent. You receive a specific set of tasks from an
execution plan and implement them exactly.

## Your Rules

1. Implement EXACTLY what the plan specifies. Do not improve, refactor, or
   add features not in your task list.
2. Follow the code patterns shown in your tasks. Do not invent new patterns.
3. Write tests as specified in the test cases. Do not add unspecified tests.
4. If something is ambiguous, STOP and report to the build lead. Do not guess.
5. When you complete a task, report:
   - Files created/modified (with paths)
   - Tests written (with paths)
   - Any deviations from the plan (with justification)
   - Any blockers for subsequent tasks

## Completion Checklist
For each task:
- [ ] All acceptance criteria met
- [ ] All test cases implemented
- [ ] Code follows the provided pattern exactly
- [ ] No files outside my ownership were modified
- [ ] No unspecified dependencies were added
```

### Execution Flow

```
Build Lead reads plan
         │
         ▼
   Assigns groups to builders
         │
         ├──► Builder A (parallel) ──┐
         ├──► Builder B (parallel) ───┤
         └──► Builder C (parallel) ───┤
                                      │
                               All builders complete
                                      │
                                      ▼
                          Build Lead runs /pmatch
                        (implementation vs plan)
                                      │
                               ┌──────┴──────┐
                               │             │
                          Drift found   All clear
                               │             │
                          Fix or       Proceed to QA
                          escalate
```

### Git Strategy During Build

```bash
# Before build
git checkout -b feature/[feature-name]
git commit -m "plan: [feature-name] — build starting"

# Each builder commits to the feature branch
# Build lead merges after validation

# After build + /pmatch passes
git commit -m "build: [feature-name] — implementation complete, pmatch clean"
```

### Output

- Implementation code on feature branch
- `docs/drift/[feature-name]-build-vs-plan.md`
- Git commit: `build: [feature-name] — complete`

---

## 10. Phase 7: QA Pipeline

**Purpose:** Post-build validation. Each QA agent has a narrow mandate and operates independently.

**Execution:** Run sequentially (each depends on prior cleanup) or swarm in parallel on independent file sets.

### `/denoise` — Dead Code & Noise Removal

**Agent:** Sonnet

```
You are a code cleaner. Your job is to identify and remove:
- Unused imports
- Commented-out code blocks (not documentation comments)
- Console.log / debug statements not wrapped in a debug utility
- Unused variables and functions
- Duplicate type definitions
- Empty files or placeholder content

## Rules
- Only REMOVE. Never ADD or MODIFY logic.
- If unsure whether something is dead code, flag it for human review
  instead of removing.
- Preserve all JSDoc/TSDoc comments.
- Preserve all TODO/FIXME comments.
```

### `/qf` — Frontend Quality Audit

**Agent:** Sonnet

```
You are a frontend quality auditor. Audit against the project's
frontend style guide.

## Checklist
- [ ] Component structure matches style guide pattern
- [ ] Hooks follow naming convention (use[Name])
- [ ] API calls use the project's fetch wrapper
- [ ] Error boundaries are in place for new routes
- [ ] Loading/error/empty states are implemented
- [ ] Mapbox layers follow the existing layer management pattern
- [ ] Tailwind classes follow project conventions
- [ ] No inline styles where Tailwind classes exist
- [ ] Accessibility: all interactive elements have labels
- [ ] Bundle: no unnecessarily large imports

## Output
For each violation:
- FILE: [path]
- LINE: [number]
- RULE: [which style guide rule]
- CURRENT: [what the code does]
- EXPECTED: [what it should do]
- AUTOFIX: [yes/no — can this be fixed without changing behavior?]
```

### `/qb` — Backend Quality Audit

**Agent:** Sonnet

```
You are a backend quality auditor. Audit against the project's
backend style guide.

## Checklist
- [ ] Route handlers follow the middleware chain pattern
- [ ] Request validation is present on all new endpoints
- [ ] Response envelope matches the project's standard shape
- [ ] Error handling follows the project's error format
- [ ] Database queries use parameterized queries (no string interpolation)
- [ ] PostGIS queries use spatial indexes
- [ ] ATTOM field access uses the data dictionary mappings
- [ ] Transaction handling follows the project's pattern
- [ ] Rate limiting is configured for new endpoints
- [ ] Logging follows the project's structured logging format

## Output
Same format as /qf
```

### `/qd` — Documentation Freshness

**Agent:** Sonnet

```
You are a documentation auditor. Verify that project documentation
reflects the current state of the codebase after the build.

## Check
- [ ] README reflects new features/changes
- [ ] API documentation matches actual endpoints
- [ ] Environment variable documentation is complete
- [ ] Database schema documentation matches migrations
- [ ] MCP tool documentation matches tool definitions
- [ ] ATTOM field mapping documentation is current

## Output
For each stale document:
- FILE: [path]
- SECTION: [which section]
- ISSUE: [what's wrong]
- SUGGESTED UPDATE: [what it should say]
```

### `/security-review` — OWASP Scan

**Agent:** Sonnet (with security-focused system prompt)

```
You are a security reviewer scanning for OWASP Top 10 vulnerabilities
and CRE-specific security concerns.

## OWASP Checks
- [ ] A01: Broken Access Control
- [ ] A02: Cryptographic Failures
- [ ] A03: Injection (SQL, PostGIS, NoSQL)
- [ ] A04: Insecure Design
- [ ] A05: Security Misconfiguration
- [ ] A06: Vulnerable Components
- [ ] A07: Authentication Failures
- [ ] A08: Data Integrity Failures
- [ ] A09: Logging Failures
- [ ] A10: SSRF

## CRE-Specific Checks
- [ ] ATTOM API key management (not in client bundles)
- [ ] Property data access controls (multi-tenant isolation)
- [ ] Mapbox token scoping
- [ ] MCP server permission boundaries
- [ ] User subscription tier enforcement
- [ ] Rate limiting per subscription tier
- [ ] PII handling in property owner data

## Output
For each finding:
- OWASP: [category]
- SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
- FILE: [path]
- LINE: [number]
- FINDING: [description]
- EXPLOIT SCENARIO: [how could this be exploited]
- FIX: [specific remediation]
```

### Pipeline Execution

```bash
# Sequential (recommended for first pass)
/denoise → /qf → /qb → /qd → /security-review

# Parallel (when paths are independent)
/denoise
  then parallel:
    /qf (frontend files)
    /qb (backend files)
    /qd (doc files)
    /security-review (all files, read-only)
```

### Output

- `docs/qa/[feature-name]-denoise.md`
- `docs/qa/[feature-name]-qf.md`
- `docs/qa/[feature-name]-qb.md`
- `docs/qa/[feature-name]-qd.md`
- `docs/qa/[feature-name]-security.md`
- Git commit: `qa: [feature-name] — pipeline complete`

---

## 11. Rollback & Git Strategy

### Branch Model

```
main
  └── feature/[feature-name]
        ├── commit: brief approved
        ├── commit: design approved
        ├── commit: ar complete
        ├── commit: plan approved
        ├── commit: build complete, pmatch clean
        ├── commit: qa pipeline complete
        └── PR → main (after all gates pass)
```

### Rollback Checkpoints

Every phase produces a tagged commit. To roll back:

```bash
# Find the last good checkpoint
git log --oneline feature/[feature-name]

# Reset to post-design (discards plan + build + qa)
git reset --hard <design-commit-hash>

# Or cherry-pick specific fixes
git cherry-pick <fix-commit>
```

### Phase Artifacts Preserved in Git

| Phase | Artifact | Path |
|-------|----------|------|
| `/arm` | Brief | `docs/briefs/` |
| Phase 0 | Style Guides | `docs/STYLE_GUIDE_*.md` |
| `/design` | Design Doc | `docs/designs/` |
| `/ar` | Review Reports | `docs/reviews/` |
| `/plan` | Execution Plan | `docs/plans/` |
| `/pmatch` | Drift Reports | `docs/drift/` |
| `/build` | Implementation | `src/` |
| QA Pipeline | QA Reports | `docs/qa/` |

---

## 12. Command Reference

| Command | Phase | Agent | Purpose |
|---------|-------|-------|---------|
| `/arm` | 1 | Opus | Extract requirements into brief |
| `/design` | 2 | Opus | First-principles design from brief |
| `/ar` | 3 | 3×Sonnet + Opus | Adversarial review of design |
| `/plan` | 4 | Opus | Atomic execution plan from design |
| `/pmatch` | 5 | 2×Sonnet + Opus | Drift detection (source vs target) |
| `/build` | 6 | Opus lead + N×Sonnet | Parallel implementation |
| `/denoise` | 7a | Sonnet | Dead code removal |
| `/qf` | 7b | Sonnet | Frontend style audit |
| `/qb` | 7c | Sonnet | Backend style audit |
| `/qd` | 7d | Sonnet | Documentation freshness |
| `/security-review` | 7e | Sonnet | OWASP + CRE security scan |

### Quick Pipeline

For small changes that don't need the full pipeline:

```
/arm → /design → /plan → /build → /qf + /qb
```

For major features (new ATTOM integration, new AI mode, new Mapbox layer):

```
Phase 0 → /arm → /design → /ar → /plan → /pmatch → /build → /pmatch → full QA
```

---

## 13. Claude Code Configuration

### `.claude/settings.json` (project-level)

```json
{
  "model": "opus",
  "maxTokens": 16000,
  "permissions": {
    "allow": ["read", "write", "execute"],
    "deny": ["network"]
  },
  "agents": {
    "defaultModel": "sonnet",
    "leadModel": "opus",
    "maxSubAgents": 5,
    "subAgentMaxTokens": 8000
  }
}
```

### Context Budget Guidelines

| Phase | Max Files in Context | Rationale |
|-------|---------------------|-----------|
| `/arm` | 0 (conversation only) | Brief is about WHAT, not HOW |
| `/design` | 10-15 (scoped) | Design reads style guides + relevant existing files |
| `/ar` | 15-20 (per reviewer) | Reviewers need design + relevant codebase |
| `/plan` | 10 (design + file tree) | Planner needs design + directory structure |
| `/build` | 3-5 (per builder) | Each builder sees ONLY their task scope |
| QA | Varies per audit type | Each auditor sees their layer's files |

### Token Budget Enforcement

The lead agent for each phase is responsible for curating context. Before launching sub-agents:

1. List the exact files each sub-agent needs
2. Verify total token count stays under the budget
3. If over budget, split into smaller task groups
4. Never pass "the whole src directory" — always enumerate specific files

---

## Appendix: Adapting for Non-ScoutGPT Projects

This framework is stack-agnostic. To adapt for a different project:

1. **Phase 0:** Re-run pattern extraction against the new codebase
2. **System prompts:** Replace ScoutGPT-specific checklist items (ATTOM, PostGIS, Mapbox, MCP) with the new project's domain concerns
3. **Agent groups in /plan:** Reorganize by the new project's layer boundaries
4. **QA checklist items:** Update `/qf`, `/qb`, `/security-review` for the new stack
5. **Everything else stays the same.** The philosophy, quality gates, and cognitive tiering are universal.
