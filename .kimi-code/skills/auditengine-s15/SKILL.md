---
name: auditengine-s15
description: Run AuditEngine build session S15 from the build bible
type: flow
whenToUse: When the user wants to execute S15 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S14 must all be ✅.
2. Read src/lib/gate.ts and src/lib/model-router.ts before writing tests.
3. Use vitest only (already in package.json). Do not add jest or mocha.
4. Do not modify gate.ts or model-router.ts to make tests pass. Fix the tests if logic is correct.
   Only fix the source file if you find a genuine logic error in it.
5. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
TEST FRAMEWORK: vitest

---

TASK 1 — test/helpers.ts

Create mock D1Database for gate tests:
```typescript
export function mockD1(findingExists = false): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: () => Promise.resolve(findingExists ? { finding_id: 'F-0001' } : null),
        run: () => Promise.resolve({ changes: 1, meta: {} }),
        all: () => Promise.resolve({ results: [] })
      })
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 })
  } as unknown as D1Database
}

export function makeGateContext(overrides: Partial<GateContext> = {}): GateContext {
  return {
    agentId: 'agent-001',
    agentType: 'security',
    auditRunId: 'run-001',
    currentFile: 'src/auth.ts',
    currentFileContent: 'const token = req.headers.authorization',
    claimLog: new Set(),
    ...overrides
  }
}
```

TASK 2 — test/gate.test.ts

Write these exact test cases:

1. "rejects banned phrase 'production ready'"
   - Input: "production ready code here"
   - Expected: passed=false, rejected_phrases includes "production ready"

2. "passes empty JSON array"
   - Input: "[]"
   - Expected: passed=true, findings=[]

3. "rejects non-array JSON"
   - Input: '{"finding": "x"}'
   - Expected: passed=false, reason includes "not a JSON array"

4. "rejects finding with missing evidence_quote"
   - Input: valid JSON array but evidence_quote is ""
   - Expected: passed=false

5. "rejects evidence_quote not in file content"
   - Input: valid JSON with evidence_quote = "this text is not in the file"
   - ctx.currentFileContent does NOT contain that text
   - Expected: passed=false, reason includes "not found in file content"

6. "passes valid finding with evidence in file"
   - ctx.currentFileContent = "const token = req.headers.authorization"
   - evidence_quote = "req.headers.authorization"
   - All required fields present, severity = "high", impact provided
   - Expected: passed=true, findings.length = 1

7. "requires impact for critical severity"
   - Valid finding but severity="critical" and impact=""
   - Expected: passed=false

8. "strips markdown fences before parsing"
   - Input: "```json\n[]\n```"
   - Expected: passed=true

TASK 3 — test/model-router.test.ts

1. "routes deep_audit to kimi-k3"
   - routeToModel('deep_audit') → { model:'kimi-k3', provider:'kimi', maxTokens:100000 }

2. "routes visual_qa_script to minimax-m3"
   - routeToModel('visual_qa_script') → { model:'minimax-m3', provider:'minimax', maxTokens:8000 }

3. "applyBudgetOverride downgrades at 80%"
   - Input: { model:'kimi-k3', provider:'kimi', maxTokens:100000 }, spentPct=0.82
   - Expected: model='kimi-k2.6'

4. "applyBudgetOverride does NOT downgrade salvation_research"
   - routeToModel('salvation_research') → kimi-k3
   - applyBudgetOverride at 90% → still kimi-k3

5. "applyBudgetOverride does not trigger below 80%"
   - spentPct=0.75 → no downgrade

Run: npx vitest run
All 13 tests must pass before marking done.

---

SUCCESS CRITERIA:
□ npx vitest run exits with 0 failures
□ All 13 test cases pass
□ No tests skipped

SESSION END:
1. BUILD_STATE.md: test/gate.test.ts ✅, test/model-router.test.ts ✅
2. SESSION_LOG.md
3. git commit -m "S15: gate + router tests — all passing"
