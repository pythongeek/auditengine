---
name: auditengine-s09
description: Run AuditEngine build session S09 from the build bible
type: flow
whenToUse: When the user wants to execute S09 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S08 must all be ✅.
2. Read src/types/index.ts before writing any code.
3. Read SPEC-05 (Priority Resolver) from docs/.
4. This file contains NO LLM calls. Scoring is pure math. No fetch() to model APIs.
5. Do not touch files outside this session.
6. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-05 (Priority Resolver — Deterministic Scoring Algorithm)

---

TASK — src/workers/priority-resolver.ts

This is a Cloudflare Workflow (not a DO, not a regular Worker).
If WorkflowEntrypoint is not available in your @cloudflare/workers-types version,
use: // TODO: VERIFY WorkflowEntrypoint availability — use stub class if needed

```typescript
// Severity base scores — exact values
const SEVERITY_BASE: Record<string, number> = {
  critical: 100,
  high:     75,
  medium:   40,
  low:      15,
  info:     5
}
```

IMPLEMENT scoreFinding(f, allFindings, db) with EXACTLY these 6 multipliers in order:
1. × 1.5 — multiple agents flagged the same file (agentsOnFile.size > 1)
2. × 1.3 — this finding blocks another (same file, this finding is more severe)
3. × 1.2 — file has no_test_coverage finding from testing agent
4. × 0.8 — file is currently locked (task in_progress references this finding_id)
5. × 1.4 — finding.source === "regression"
6. × 1.6 — finding.recurrence_count > 0

Return: { ...finding, priorityScore: Math.round(score * 100) / 100, multipliers: string[] }
The multipliers array is an audit trail: e.g. ["base(100)", "multi_agent(×1.5 — 2 agents on file)"]

IMPLEMENT detectConflicts(findings) — exact rule from spec:
Any Security Agent finding + any Architecture Agent finding on the SAME file = conflict.
Return ConflictGroup[].

IMPLEMENT groupFindingsIntoTasks(scoredFindings) — not in spec detail, use this rule:
Group findings by file. Each file becomes one task.
task.title = "Fix [count] issue(s) in [filename]"
task.finding_ids = JSON.stringify([finding_id, ...])
task.priority_score = highest score among findings in the group
task.multipliers = JSON.stringify(scored multipliers)
task.conflict_flag = 1 if this file appears in any ConflictGroup

IMPLEMENT main workflow function:
async function runPriorityResolver(auditRunId: string, env: Env): Promise<void>
  1. SELECT all findings for this audit_run_id from D1
  2. scoreFinding() for each
  3. Sort by priorityScore DESC
  4. detectConflicts()
  5. groupFindingsIntoTasks()
  6. db.batch(INSERT INTO tasks for each task group)
  7. UPDATE agent_registry SET status='done' for priority_resolver

Export runPriorityResolver for import in coordinator.ts.

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ scoreFinding with critical severity returns base score 100
□ scoreFinding with multi-agent flag returns 100 × 1.5 = 150
□ detectConflicts returns ConflictGroup when security + architecture both flag same file
□ No LLM calls anywhere in this file

SESSION END:
1. BUILD_STATE.md: priority-resolver.ts ✅
2. SESSION_LOG.md
3. git commit -m "S09: priority resolver"
