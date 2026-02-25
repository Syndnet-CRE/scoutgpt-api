---
name: security-review
description: Security review scanning for OWASP Top 10 and CRE-specific vulnerabilities. Use after /build. Triggers on "security", "owasp", "vulnerability scan", "security review".
model: claude-sonnet-4-5-20250929
allowed-tools: Read, Grep, Glob, Bash(find:*), Bash(grep:*), Bash(cat:*)
---

# Security Review — OWASP + CRE

Scan for OWASP Top 10 vulnerabilities and CRE-specific security concerns.

## Scope
All files changed in feature branch: `git diff --name-only main`

## OWASP Top 10
- A01: Broken Access Control
- A02: Cryptographic Failures
- A03: Injection (SQL, PostGIS, NoSQL)
- A04: Insecure Design
- A05: Security Misconfiguration
- A06: Vulnerable Components
- A07: Authentication Failures
- A08: Data Integrity Failures
- A09: Logging Failures
- A10: SSRF

## CRE-Specific
- ATTOM API key management (never in client bundles, never in git)
- Property data access controls (multi-tenant isolation)
- Mapbox token scoping (restrict to allowed domains)
- MCP server permission boundaries
- Subscription tier enforcement (Core vs Elite feature gating)
- Rate limiting per subscription tier
- PII handling in property owner data (ATTOM owner records)
- Spatial query boundaries (prevent data scraping via broad PostGIS queries)

## Output

For each finding:
```
OWASP: [category or CRE-specific]
SEVERITY: CRITICAL | HIGH | MEDIUM | LOW
FILE: [path]
LINE: [number]
FINDING: [description]
EXPLOIT SCENARIO: [how this could be exploited]
FIX: [specific remediation]
```

Save to: `docs/qa/[feature-name]-security.md`

## Gate
No CRITICAL or HIGH findings may remain unaddressed. MEDIUM/LOW may be deferred with documented rationale.
