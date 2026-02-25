---
name: pmatch
description: Drift detection between two documents. Verifies plan faithfully represents design, or implementation faithfully represents plan. Use after /plan or after /build. Triggers on "drift", "verify", "check alignment", "pmatch".
model: claude-opus-4-6
allowed-tools: Read, Grep, Glob, Task
---

# Drift Detection — Team Lead

Verify that a target document faithfully represents a source document. Launch two independent extractors, then validate their findings.

## Usage

`/pmatch [source] [target]`

Common pairs:
- `/pmatch design plan` — after /plan completes
- `/pmatch plan build` — after /build completes

## Process

### Step 1: Launch Extractors in Parallel

Spawn two sub-agents using `.claude/agents/drift-extractor.md`:
- **Extractor A:** Extract claims from source, verify in target
- **Extractor B:** Extract claims from target, verify in source (catches scope creep)

### Step 2: Validate Findings

For each finding from both extractors:
- **PRESENT:** Claim accurately represented → no action
- **MISSING:** Claim absent → real drift, must address
- **CONTRADICTED:** Target says something different → critical drift
- **WEAKENED:** Spirit captured but precision lost → may need fix
- **ADDED:** Target contains claims not in source → scope creep, flag for review

### Step 3: Triage

Classify each real finding:
- **INTENTIONAL REFINEMENT:** Planner/builder made a valid improvement → document it
- **REAL DRIFT:** Deviation from source → must fix before proceeding
- **SCOPE CREEP:** Unapproved additions → must remove or get approval

### Step 4: Report

```markdown
# Drift Report: [Source] vs [Target]
## Feature: [name]
## Date: [ISO date]

### Summary
[Clean / N issues found]

### Critical Drift (Must Fix)
| # | Source Claim | Target Status | Notes |

### Scope Creep (Unapproved Additions)
| # | Target Claim | Source Coverage | Notes |

### Intentional Refinements (Documented)
| # | Change | Rationale |
```

Save to: `docs/drift/[feature-name]-[source]-vs-[target].md`

## Gate Condition

Proceed only when:
- Zero critical drift items remain
- All scope creep items are either removed or explicitly approved by user
- All intentional refinements are documented
