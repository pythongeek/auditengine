---
name: auditengine-s03
description: Run AuditEngine build session S03 from the build bible
type: flow
whenToUse: When the user wants to execute S03 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. Do not write a single line until you have read it.
2. Read src/types/index.ts before implementing any function. Do not invent types.
3. Read the SPEC section referenced in this prompt before writing any logic.
4. Do not invent API endpoints, model names, table names, or field names.
5. If unsure about a Cloudflare API: write // TODO: VERIFY CLOUDFLARE API — DO NOT GUESS
6. Do not touch files outside the scope of this session.
7. After completing, update BUILD_STATE.md accurately.
8. SPEC CONFLICT: stop and describe.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-04 (Verification Gate) — read from docs/

READ FIRST: src/types/index.ts, BUILD_STATE.md (S01+S02 must be ✅)

---

TASK — src/lib/gate.ts

The gate runs 4 checks IN STRICT ORDER. Stop at first failure.
Import GateResult, GateContext, ValidatedFinding from '../types/index'.

```typescript
// CHECK 1: Banned phrase scan (run BEFORE JSON parse — cheap string search)
// These exact phrases trigger rejection (case-insensitive):
const BANNED_PHRASES = [
  "production ready", "looks good", "should work", "seems correct",
  "appears to", "likely works", "no issues found", "clean code",
  "well structured", "everything looks", "i believe", "i think",
  "in my opinion", "great job", "nicely done", "impressive"
]
// Return: passed=false, reason="Banned phrase(s) detected: "x", "y". Remove and resubmit."
// rejected_phrases: list of phrases found

// CHECK 2: JSON parsability
// Strip accidental markdown fences before parsing:
//   rawOutput.replace(/^```json\s*/m, "").replace(/^```\s*/m, "").trim()
// Must be a JSON array — if object or primitive: fail
// Empty array [] is VALID — return passed=true, findings=[]

// CHECK 3: Schema validation per finding (loop over every finding in array)
// Required fields: finding_id, severity, category, file, evidence_quote, description, verified_by
// Severity must be exactly: critical | high | medium | low | info
// evidence_quote minimum length: 8 characters
// evidence_quote MUST exist in ctx.currentFileContent (exact substring match)
//   This is the core anti-hallucination check — no invented quotes pass
// impact required for critical and high severity (minimum 20 chars)
// file must exactly match ctx.currentFile

// CHECK 4: Duplicate detection (async D1 query)
// SELECT finding_id FROM findings WHERE audit_run_id=? AND file=? AND evidence_quote=?
// If duplicate: do NOT fail — silently skip + increment recurrence_count
// Only non-duplicate findings go into the returned array

export async function runGate(
  rawOutput: string,
  ctx: GateContext,
  db: D1Database
): Promise<GateResult>
```

RULES for this session:
- The function is pure logic + D1 queries. No LLM calls. No fetch() to external APIs.
- Every check must return the exact rejection message structure from the spec.
- Do not add checks not listed. Do not reorder the 4 checks.

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ runGate("production ready", ...) returns passed=false, rejected_phrases=["production ready"]
□ runGate("[]", ...) returns passed=true, findings=[]
□ runGate with evidence_quote not in currentFileContent returns passed=false
□ runGate with valid JSON array + valid finding returns passed=true

SESSION END:
1. BUILD_STATE.md: src/lib/gate.ts ✅
2. SESSION_LOG.md row
3. git add -A && git commit -m "S03: verification gate"
