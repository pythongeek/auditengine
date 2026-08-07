import { DurableObject } from 'cloudflare:workers'
import type { Env, AgentType, AuditPhase, DashboardEvent } from '../types/index'
import { runPriorityResolver } from './priority-resolver'

export class CoordinatorDurableObject extends DurableObject<Env> {
  private auditRunId: string = ''
  private lastAlertState = { alert_50_sent: 0, alert_80_sent: 0, alert_95_sent: 0 }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const body = await request.json() as { audit_run_id: string }
    this.auditRunId = body.audit_run_id

    await this.ctx.storage.setAlarm(Date.now() + 60_000)
    return new Response('Coordinator started', { status: 200 })
  }

  async alarm(): Promise<void> {
    if (!this.auditRunId) return

    const env = this.env as Env
    const db = env.DB

    const budgetRow = await db
      .prepare('SELECT * FROM run_budget WHERE audit_run_id = ?')
      .bind(this.auditRunId)
      .first<{
        phase: string
        alert_50_sent: number
        alert_80_sent: number
        alert_95_sent: number
        spent_usd: number
        budget_usd: number
      }>()

    if (!budgetRow) return

    // Transition 7: budget alert broadcast (run every tick)
    if (budgetRow.alert_50_sent === 1 && this.lastAlertState.alert_50_sent === 0) {
      this.broadcast({
        type: 'budget_alert',
        audit_run_id: this.auditRunId,
        payload: { threshold: 50, spent_usd: budgetRow.spent_usd, budget_usd: budgetRow.budget_usd },
        ts: Date.now(),
      })
    }
    if (budgetRow.alert_80_sent === 1 && this.lastAlertState.alert_80_sent === 0) {
      this.broadcast({
        type: 'budget_alert',
        audit_run_id: this.auditRunId,
        payload: { threshold: 80, spent_usd: budgetRow.spent_usd, budget_usd: budgetRow.budget_usd },
        ts: Date.now(),
      })
    }
    if (budgetRow.alert_95_sent === 1 && this.lastAlertState.alert_95_sent === 0) {
      this.broadcast({
        type: 'budget_alert',
        audit_run_id: this.auditRunId,
        payload: { threshold: 95, spent_usd: budgetRow.spent_usd, budget_usd: budgetRow.budget_usd },
        ts: Date.now(),
      })
    }
    this.lastAlertState = {
      alert_50_sent: budgetRow.alert_50_sent,
      alert_80_sent: budgetRow.alert_80_sent,
      alert_95_sent: budgetRow.alert_95_sent,
    }

    const currentPhase = budgetRow.phase as AuditPhase

    // Transition 1: boot → phase-1
    if (currentPhase === 'boot') {
      const manifest = await db
        .prepare('SELECT 1 FROM repo_manifest WHERE audit_run_id = ? LIMIT 1')
        .bind(this.auditRunId)
        .first()
      if (manifest) {
        await spawnAgent('architecture', 1, this.auditRunId, env)
        await spawnAgent('database', 1, this.auditRunId, env)
        await db
          .prepare("UPDATE run_budget SET phase = 'phase-1' WHERE audit_run_id = ?")
          .bind(this.auditRunId)
          .run()
      }
    }

    // Transition 2: phase-1 → phase-2
    else if (currentPhase === 'phase-1') {
      const allDone = await allAgentsDoneInPhase(this.auditRunId, 1, db)
      if (allDone) {
        await spawnAgent('security', 2, this.auditRunId, env)
        await spawnAgent('api', 2, this.auditRunId, env)
        await spawnAgent('frontend', 2, this.auditRunId, env)
        await spawnAgent('devops', 2, this.auditRunId, env)
        await spawnVisualQA(this.auditRunId, env)
        await db
          .prepare("UPDATE run_budget SET phase = 'phase-2' WHERE audit_run_id = ?")
          .bind(this.auditRunId)
          .run()
      }
    }

    // Transition 3: phase-2 → phase-3
    else if (currentPhase === 'phase-2') {
      const allDone = await allAgentsDoneInPhase(this.auditRunId, 2, db)
      if (allDone) {
        await runPriorityResolver(this.auditRunId, env)
        await spawnAgent('documentation', 3, this.auditRunId, env)
        await spawnAgent('performance', 3, this.auditRunId, env)
        await db
          .prepare("UPDATE run_budget SET phase = 'phase-3' WHERE audit_run_id = ?")
          .bind(this.auditRunId)
          .run()
      }
    }

    // Transition 4: phase-3 → phase-4
    else if (currentPhase === 'phase-3') {
      const tasks = await db
        .prepare('SELECT 1 FROM tasks WHERE audit_run_id = ? LIMIT 1')
        .bind(this.auditRunId)
        .first()
      if (tasks) {
        this.broadcast({
          type: 'task_created',
          audit_run_id: this.auditRunId,
          payload: { message: 'Tasks ready' },
          ts: Date.now(),
        })
        await db
          .prepare("UPDATE run_budget SET phase = 'phase-4' WHERE audit_run_id = ?")
          .bind(this.auditRunId)
          .run()
      }
    }

    // Transition 5: phase-4 monitoring
    else if (currentPhase === 'phase-4') {
      const inReviewTasks = await db
        .prepare(`
          SELECT task_id FROM tasks
          WHERE audit_run_id = ? AND status = 'in_review'
        `)
        .bind(this.auditRunId)
        .all<{ task_id: string }>()

      for (const task of inReviewTasks.results ?? []) {
        await spawnVerificationAgent(task.task_id, env)
      }
    }

    // Transition 6: phase-4 → complete
    if (currentPhase === 'phase-4') {
      const unresolved = await db
        .prepare(`
          SELECT 1 FROM findings
          WHERE audit_run_id = ? AND severity IN ('critical', 'high') AND status != 'resolved'
          LIMIT 1
        `)
        .bind(this.auditRunId)
        .first()

      if (!unresolved) {
        await recalcProductionScore(this.auditRunId, db)
        this.broadcast({
          type: 'audit_complete',
          audit_run_id: this.auditRunId,
          payload: {},
          ts: Date.now(),
        })
        await db
          .prepare("UPDATE run_budget SET phase = 'complete' WHERE audit_run_id = ?")
          .bind(this.auditRunId)
          .run()
      }
    }

    await this.ctx.storage.setAlarm(Date.now() + 60_000)
  }

  private broadcast(event: DashboardEvent): void {
    const id = this.env.DASHBOARD_DO.idFromName('dashboard-' + this.auditRunId)
    const stub = this.env.DASHBOARD_DO.get(id)
    stub.fetch(new Request('https://dashboard/broadcast', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: { 'Content-Type': 'application/json' },
    })).catch(() => {
      // broadcast failures are non-fatal
    })
  }
}

async function spawnAgent(
  agentType: AgentType,
  phase: number,
  auditRunId: string,
  env: Env
): Promise<void> {
  const agentId = `${agentType}-${auditRunId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  await env.DB
    .prepare(`
      INSERT OR IGNORE INTO agent_registry (agent_id, agent_type, audit_run_id, status, phase)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(agentId, agentType, auditRunId, 'boot', phase)
    .run()

  const id = env.AGENT_DO.idFromName(agentId)
  const stub = env.AGENT_DO.get(id)
  await stub.fetch(new Request('https://agent/boot', {
    method: 'POST',
    body: JSON.stringify({ agentId, agentType, auditRunId }),
    headers: { 'Content-Type': 'application/json' },
  }))
}

async function allAgentsDoneInPhase(auditRunId: string, phase: number, db: D1Database): Promise<boolean> {
  const total = await db
    .prepare('SELECT COUNT(*) as count FROM agent_registry WHERE audit_run_id = ? AND phase = ?')
    .bind(auditRunId, phase)
    .first<{ count: number }>()

  if (!total || total.count === 0) return false

  const done = await db
    .prepare(`
      SELECT COUNT(*) as count FROM agent_registry
      WHERE audit_run_id = ? AND phase = ? AND status = 'done'
    `)
    .bind(auditRunId, phase)
    .first<{ count: number }>()

  return (done?.count ?? 0) >= total.count
}

// STUBS — implemented in later sessions
async function spawnVerificationAgent(taskId: string, env: Env): Promise<void> {
  // no-op stub
}

async function spawnVisualQA(auditRunId: string, env: Env): Promise<void> {
  // no-op stub
}

async function recalcProductionScore(auditRunId: string, db: D1Database): Promise<void> {
  // no-op stub
}
