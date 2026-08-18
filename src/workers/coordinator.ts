import { DurableObject } from 'cloudflare:workers'
import type { Env, AgentType, AuditPhase, DashboardEvent } from '../types/index'
import { DOMAIN_MAP, AgentDurableObject } from '../agents/base-agent'
import { verifyTask, recalcProductionScore } from './verification'
import { runVisualQA } from './visual-qa'
import { ensureDefaultAgentConfig, ALL_AGENT_TYPES, NON_CRITICAL_AGENT_TYPES } from '../lib/agent-config'

export class CoordinatorDurableObject extends DurableObject<Env> {
  private auditRunId: string = ''
  private tenantId: string = ''
  private lastAlertState = { alert_50_sent: 0, alert_80_sent: 0, alert_95_sent: 0 }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const body = await request.json() as { audit_run_id: string; tenant_id?: string }
    this.auditRunId = body.audit_run_id
    this.tenantId = body.tenant_id ?? ''

    await this.ensureAuditSession()
    await this.ctx.storage.setAlarm(Date.now() + 30_000)
    return new Response('Coordinator started', { status: 200 })
  }

  private async ensureAuditSession(): Promise<void> {
    const env = this.env as Env
    const db = env.DB

    await db
      .prepare(`
        INSERT OR IGNORE INTO audit_sessions (
          id, tenant_id, status, total_files, files_analyzed,
          findings_count, readiness_score, created_at
        ) VALUES (?, ?, 'pending', 0, 0, 0, 0.0, unixepoch())
      `)
      .bind(this.auditRunId, this.tenantId)
      .run()

    const agentTypes: AgentType[] = ALL_AGENT_TYPES
    for (const agentType of agentTypes) {
      await ensureDefaultAgentConfig(db, this.tenantId, agentType)
    }
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

    // Transition 7: budget alert broadcast and agent throttling (run every tick)
    if (budgetRow.alert_50_sent === 1 && this.lastAlertState.alert_50_sent === 0) {
      this.broadcast({
        type: 'budget_alert',
        audit_run_id: this.auditRunId,
        payload: { threshold: 50, spent_usd: budgetRow.spent_usd, budget_usd: budgetRow.budget_usd },
        ts: Date.now(),
      })
    }
    if (budgetRow.alert_80_sent === 1 && this.lastAlertState.alert_80_sent === 0) {
      await db
        .prepare(`
          UPDATE agent_registry
          SET status = 'paused'
          WHERE audit_run_id = ? AND agent_type IN (${NON_CRITICAL_AGENT_TYPES.map(() => '?').join(',')})
        `)
        .bind(this.auditRunId, ...NON_CRITICAL_AGENT_TYPES)
        .run()

      this.broadcast({
        type: 'budget_alert',
        audit_run_id: this.auditRunId,
        payload: {
          threshold: 80,
          spent_usd: budgetRow.spent_usd,
          budget_usd: budgetRow.budget_usd,
          scope: 'non_critical',
          paused_agents: NON_CRITICAL_AGENT_TYPES,
        },
        ts: Date.now(),
      })
    }
    if (budgetRow.alert_95_sent === 1 && this.lastAlertState.alert_95_sent === 0) {
      await db
        .prepare(`
          UPDATE agent_registry
          SET status = 'paused'
          WHERE audit_run_id = ?
        `)
        .bind(this.auditRunId)
        .run()

      this.broadcast({
        type: 'budget_alert',
        audit_run_id: this.auditRunId,
        payload: {
          threshold: 95,
          spent_usd: budgetRow.spent_usd,
          budget_usd: budgetRow.budget_usd,
          scope: 'all',
          paused_agents: ALL_AGENT_TYPES,
        },
        ts: Date.now(),
      })
    }
    this.lastAlertState = {
      alert_50_sent: budgetRow.alert_50_sent,
      alert_80_sent: budgetRow.alert_80_sent,
      alert_95_sent: budgetRow.alert_95_sent,
    }

    // Reset tasks whose 48-hour in-progress lock has expired.
    const expiredLocks = await db
      .prepare(`
        SELECT task_id FROM tasks
        WHERE audit_run_id = ? AND status = ? AND lock_expires_at IS NOT NULL AND lock_expires_at < unixepoch()
      `)
      .bind(this.auditRunId, 'in_progress')
      .all<{ task_id: string }>()

    for (const task of expiredLocks.results ?? []) {
      await db
        .prepare('UPDATE tasks SET status = ?, assigned_agent = ?, lock_expires_at = ?, updated_at = unixepoch() WHERE task_id = ?')
        .bind('backlog', null, null, task.task_id)
        .run()
      this.broadcast({
        type: 'task_status_change',
        audit_run_id: this.auditRunId,
        payload: { task_id: task.task_id, status: 'backlog', reason: 'lock_expired' },
        ts: Date.now(),
      })
    }

    const currentPhase = budgetRow.phase as AuditPhase

    // Transition 1: boot → phase-1
    if (currentPhase === 'boot') {
      const files = await db
        .prepare('SELECT 1 FROM files WHERE audit_run_id = ? AND tenant_id = ? LIMIT 1')
        .bind(this.auditRunId, this.tenantId)
        .first()
      if (files) {
        await db
          .prepare("UPDATE audit_sessions SET status = 'running', started_at = unixepoch() WHERE id = ?")
          .bind(this.auditRunId)
          .run()
        const phase1Agents = await getRelevantAgentsForPhase(this.auditRunId, this.tenantId, db, ['architecture', 'database'])
        for (const agentType of phase1Agents) {
          await spawnAgent(agentType, 1, this.tenantId, this.auditRunId, env)
        }
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
        const phase2Agents = await getRelevantAgentsForPhase(this.auditRunId, this.tenantId, db, ['security', 'api', 'frontend', 'devops'])
        for (const agentType of phase2Agents) {
          await spawnAgent(agentType, 2, this.tenantId, this.auditRunId, env)
        }
        const visualQaRelevant = await getRelevantAgentsForPhase(this.auditRunId, this.tenantId, db, ['visual_qa'])
        if (visualQaRelevant.length > 0) {
          await spawnVisualQA(this.auditRunId, env)
        }
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
        await env.PRIORITY_RESOLVER_WORKFLOW.create({
          id: `priority-resolver-${this.auditRunId}`,
          params: { auditRunId: this.auditRunId },
        })
        const phase3Agents = await getRelevantAgentsForPhase(this.auditRunId, this.tenantId, db, ['documentation', 'performance'])
        for (const agentType of phase3Agents) {
          await spawnAgent(agentType, 3, this.tenantId, this.auditRunId, env)
        }
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
        await spawnVerificationAgent(task.task_id, env, (event) => this.broadcast(event))
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
        const scoreRow = await db
          .prepare('SELECT production_score FROM run_budget WHERE audit_run_id = ?')
          .bind(this.auditRunId)
          .first<{ production_score: number }>()
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
        await db
          .prepare(`
            UPDATE audit_sessions
            SET status = 'complete',
                completed_at = unixepoch(),
                readiness_score = ?,
                findings_count = (SELECT COUNT(*) FROM findings WHERE audit_run_id = ?)
            WHERE id = ?
          `)
          .bind(scoreRow?.production_score ?? 0, this.auditRunId, this.auditRunId)
          .run()
      }
    }

    await this.ctx.storage.setAlarm(Date.now() + 30_000)
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

export function agentNamespace(agentType: AgentType, env: Env): DurableObjectNamespace {
  switch (agentType) {
    case 'security': return env.SECURITY_AGENT_DO
    case 'api': return env.API_AGENT_DO
    case 'frontend': return env.FRONTEND_AGENT_DO
    case 'database': return env.DATABASE_AGENT_DO
    case 'architecture': return env.ARCHITECTURE_AGENT_DO
    case 'testing': return env.TESTING_AGENT_DO
    case 'performance': return env.PERFORMANCE_AGENT_DO
    case 'devops': return env.DEVOPS_AGENT_DO
    case 'documentation': return env.DOCUMENTATION_AGENT_DO
    case 'visual_qa': return env.VISUAL_QA_AGENT_DO
    case 'backend': return env.BACKEND_AGENT_DO
    case 'dependency': return env.DEPENDENCY_AGENT_DO
    case 'a11y': return env.A11Y_AGENT_DO
    case 'i18n': return env.I18N_AGENT_DO
    case 'logging': return env.LOGGING_AGENT_DO
    case 'code_quality': return env.CODE_QUALITY_AGENT_DO
    case 'error_handling': return env.ERROR_HANDLING_AGENT_DO
    case 'configuration': return env.CONFIGURATION_AGENT_DO
    case 'refactoring': return env.REFACTORING_AGENT_DO
  }
}

export async function getRelevantAgentsForPhase(
  auditRunId: string,
  tenantId: string,
  db: D1Database,
  candidateTypes: AgentType[]
): Promise<AgentType[]> {
  const rows = await db
    .prepare('SELECT DISTINCT domain_tag FROM files WHERE audit_run_id = ? AND tenant_id = ?')
    .bind(auditRunId, tenantId)
    .all<{ domain_tag: string | null }>()

  const tags = new Set((rows.results ?? []).map(r => r.domain_tag).filter((t): t is string => t !== null && t !== ''))
  return candidateTypes.filter(agentType => {
    const domain = DOMAIN_MAP[agentType]
    return domain === 'all' || tags.has(domain)
  })
}

async function getAssignedFiles(
  auditRunId: string,
  tenantId: string,
  db: D1Database,
  agentType: AgentType
): Promise<string[]> {
  const domain = DOMAIN_MAP[agentType]
  if (domain === 'all') {
    const rows = await db
      .prepare('SELECT path FROM files WHERE audit_run_id = ? AND tenant_id = ? ORDER BY path')
      .bind(auditRunId, tenantId)
      .all<{ path: string }>()
    return rows.results?.map(r => r.path) ?? []
  }

  const rows = await db
    .prepare('SELECT path FROM files WHERE audit_run_id = ? AND tenant_id = ? AND domain_tag = ? ORDER BY path')
    .bind(auditRunId, tenantId, domain)
    .all<{ path: string }>()
  return rows.results?.map(r => r.path) ?? []
}

export async function spawnAgent(
  agentType: AgentType,
  phase: number,
  tenantId: string,
  auditRunId: string,
  env: Env,
  overrideFiles?: string[]
): Promise<void> {
  const agentId = `${agentType}-${auditRunId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const domain = DOMAIN_MAP[agentType]
  const assignedFiles = overrideFiles ?? await getAssignedFiles(auditRunId, tenantId, env.DB, agentType)

  await env.DB
    .prepare(`
      INSERT OR IGNORE INTO agent_registry (
        agent_id, tenant_id, agent_type, audit_run_id, status, phase, domain, assigned_files
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(agentId, tenantId, agentType, auditRunId, 'idle', phase, domain, JSON.stringify(assignedFiles))
    .run()

  const ns = agentNamespace(agentType, env)
  const id = ns.idFromName(agentId)
  const stub = ns.get(id)
  await stub.fetch(new Request('https://agent/boot', {
    method: 'POST',
    body: JSON.stringify({ agentId, tenantId, agentType, auditRunId }),
    headers: { 'Content-Type': 'application/json' },
  }))
}

async function allAgentsDoneInPhase(auditRunId: string, phase: number, db: D1Database): Promise<boolean> {
  const total = await db
    .prepare('SELECT COUNT(*) as count FROM agent_registry WHERE audit_run_id = ? AND phase = ?')
    .bind(auditRunId, phase)
    .first<{ count: number }>()

  if (!total || total.count === 0) return true

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
async function spawnVerificationAgent(
  taskId: string,
  env: Env,
  broadcast?: (event: DashboardEvent) => void
): Promise<void> {
  const task = await env.DB
    .prepare('SELECT * FROM tasks WHERE task_id = ?')
    .bind(taskId)
    .first<{ task_id: string; audit_run_id: string; finding_ids: string; commit_sha: string | null; status: string }>()

  if (!task || !task.commit_sha) return

  await verifyTask(task as unknown as import('../types/index').Task, env, false, broadcast)
}

async function spawnVisualQA(auditRunId: string, env: Env): Promise<void> {
  await runVisualQA(auditRunId, env)
}
