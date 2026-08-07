---
name: auditengine-s08
description: Run AuditEngine build session S08 from the build bible
type: flow
whenToUse: When the user wants to execute S08 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S07 must all be ✅.
2. Read src/types/index.ts before writing any code.
3. Read SPEC-09 (Coordinator) from docs/ before writing any logic.
4. Durable Objects use DurableObject base class. The alarm() method is called by the runtime.
   Do not invent DO methods that don't exist.
5. If unsure about a Cloudflare DO API: // TODO: VERIFY CLOUDFLARE API — DO NOT GUESS
6. Do not touch files outside this session.
7. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-09 (Coordinator — Exact Orchestration Logic)

---

TASK — src/workers/coordinator.ts

The Coordinator is a Durable Object. It sets an alarm every 60 seconds and runs
phase transition logic on each alarm tick.

```typescript
import { DurableObject } from 'cloudflare:workers'
import type { Env, AuditPhase, AgentType, AgentRegistryRow } from '../types/index'

export class CoordinatorDurableObject extends DurableObject {
  private auditRunId: string = ""

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  // Called via HTTP POST from ingestion worker when a new audit run starts
  // Body: { audit_run_id: string }
  async fetch(request: Request): Promise<Response>

  // Called every 60 seconds by Cloudflare alarm system
  async alarm(): Promise<void>
}
```

IMPLEMENT alarm() with these exact 7 phase transitions from SPEC-09:

Read current phase from run_budget WHERE audit_run_id = ?

TRANSITION 1: boot → phase-1
  Condition: repo_manifest row exists for this audit_run_id
  Action: spawnAgent("architecture"), spawnAgent("database")
         UPDATE run_budget SET phase='phase-1'

TRANSITION 2: phase-1 → phase-2
  Condition: ALL agents in agent_registry WHERE audit_run_id=? AND phase=1 have status='done'
  Action: spawnAgent() for: security, api, frontend, devops
         spawnVisualQA() — stub for now (implemented in S12)
         UPDATE run_budget SET phase='phase-2'

TRANSITION 3: phase-2 → phase-3
  Condition: ALL phase-2 agents have status='done'
  Action: trigger Priority Resolver Workflow — stub: await runPriorityResolver(auditRunId, env)
         spawnAgent("documentation"), spawnAgent("performance")
         UPDATE run_budget SET phase='phase-3'

TRANSITION 4: phase-3 → phase-4
  Condition: tasks table has at least 1 row for this audit_run_id
  Action: broadcast({ type:"tasks_ready" })
         UPDATE run_budget SET phase='phase-4'

TRANSITION 5: phase-4 monitoring — task picked up
  Condition: any task has status='in_review'
  Action: for each in_review task without a verification agent:
          spawnVerificationAgent(taskId) — stub for now

TRANSITION 6: phase-4 → complete
  Condition: ALL findings with severity IN ('critical','high') have status='resolved'
  Action: recalcProductionScore() — call verification module stub
         broadcast({ type:"audit_complete" })
         UPDATE run_budget SET phase='complete'

TRANSITION 7: budget alert broadcast
  Check run on every alarm tick regardless of phase:
  Read run_budget.alert_50_sent, alert_80_sent, alert_95_sent, spent_usd, budget_usd
  For each flag that changed to 1 since last check:
    broadcast({ type:"budget_alert", payload:{ threshold: 50|80|95, spent_usd, budget_usd } })

IMPLEMENT spawnAgent():
  - INSERT OR IGNORE into agent_registry BEFORE fetching DO stub
  - Get AgentDurableObject stub via env.AGENT_DO.idFromName(agentId)
  - POST to stub: https://agent/boot with { agentId, agentType, auditRunId }
  - Set alarm for next tick: this.ctx.storage.setAlarm(Date.now() + 60_000)

IMPLEMENT broadcast():
  - Get DashboardDurableObject stub via env.DASHBOARD_DO.idFromName("dashboard-" + auditRunId)
  - POST event JSON to the dashboard DO

STUBS (to be replaced in later sessions):
  async function runPriorityResolver(auditRunId: string, env: Env): Promise<void> {}
  async function spawnVerificationAgent(taskId: string, env: Env): Promise<void> {}
  async function spawnVisualQA(auditRunId: string, env: Env): Promise<void> {}

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ CoordinatorDurableObject extends DurableObject
□ alarm() runs all 7 transition checks
□ spawnAgent() inserts to registry BEFORE sending boot request
□ Phase transition checks are in correct order (boot first, complete last)

SESSION END:
1. BUILD_STATE.md: coordinator.ts ✅
2. SESSION_LOG.md
3. git commit -m "S08: coordinator durable object"
