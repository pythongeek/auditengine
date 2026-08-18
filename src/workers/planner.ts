import type { Env, Finding, Task, Message, DashboardEvent } from '../types/index'
import { llmCall } from '../lib/llm-gateway'

const PLANNER_AGENT_TYPE = 'refactoring' as const

export function buildPlanMessages(task: Task, findings: Finding[]): Message[] {
  const findingLines = findings.map(f => {
    const lines = [
      `### ${f.finding_id} [${f.severity}] ${f.category} — ${f.file}`,
      f.line_range ? `Lines: ${f.line_range[0]}–${f.line_range[1]}` : null,
      `Evidence: ${f.evidence_quote ?? ''}`,
      `Description: ${f.description}`,
      f.impact ? `Impact: ${f.impact}` : null,
    ].filter(Boolean)
    return lines.join('\n')
  }).join('\n\n')

  const userContent = `## REMEDIATION PLAN REQUEST

Task: ${task.title}
Task ID: ${task.task_id}
Priority score: ${task.priority_score}

## FINDINGS TO FIX
${findingLines || '(no findings loaded)'}

## TASK
Produce a concrete, step-by-step remediation plan a developer (or fix agent) can execute.
Requirements:
1. Order the steps so blocking issues are fixed first.
2. For each step name the exact file and the change to make (what to add/remove/replace).
3. Include a verification step per change (how to prove the issue is gone).
4. Flag any step that needs a human decision instead of an automated fix.
5. Keep it under 400 words. Plain Markdown. No preamble.`

  return [
    {
      role: 'system',
      content:
        'You are the AuditEngine Remediation Planner. You turn evidence-backed audit findings ' +
        'into precise, minimal, safe fix plans. Never invent files or line numbers that are not ' +
        'in the findings. Never suggest suppressing an issue without saying so explicitly.',
    },
    { role: 'user', content: userContent },
  ]
}

function makeBroadcast(env: Env, auditRunId: string): (event: DashboardEvent) => void {
  return (event) => {
    const id = env.DASHBOARD_DO.idFromName('dashboard-' + auditRunId)
    const stub = env.DASHBOARD_DO.get(id)
    stub.fetch(new Request('https://dashboard/broadcast', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: { 'Content-Type': 'application/json' },
    })).catch(() => {
      // broadcast failures are non-fatal
    })
  }
}

export async function generatePlanForTask(taskId: string, env: Env): Promise<{ ok: boolean; plan?: string; error?: string }> {
  const db = env.DB

  const task = await db
    .prepare('SELECT * FROM tasks WHERE task_id = ?')
    .bind(taskId)
    .first<Task>()
  if (!task) return { ok: false, error: 'Task not found' }

  const findingIds: string[] = JSON.parse(task.finding_ids || '[]')
  let findings: Finding[] = []
  if (findingIds.length > 0) {
    const placeholders = findingIds.map(() => '?').join(',')
    const rows = await db
      .prepare(`SELECT * FROM findings WHERE finding_id IN (${placeholders})`)
      .bind(...findingIds)
      .all<Finding>()
    findings = rows.results ?? []
  }

  await db
    .prepare("UPDATE tasks SET plan_status = 'generating', updated_at = unixepoch() WHERE task_id = ?")
    .bind(taskId)
    .run()

  const broadcast = makeBroadcast(env, task.audit_run_id)

  try {
    const response = await llmCall({
      agentId: `planner-${taskId}`,
      agentType: PLANNER_AGENT_TYPE,
      taskType: 'remediation_plan',
      messages: buildPlanMessages(task, findings),
      auditRunId: task.audit_run_id,
      db,
      broadcast,
    }, env)

    const plan = response.text.trim()
    if (!plan) throw new Error('Planner returned an empty plan')

    await db
      .prepare("UPDATE tasks SET plan_text = ?, plan_status = 'ready', updated_at = unixepoch() WHERE task_id = ?")
      .bind(plan, taskId)
      .run()

    broadcast({
      type: 'plan_ready',
      audit_run_id: task.audit_run_id,
      payload: { task_id: taskId },
      ts: Date.now(),
    })

    return { ok: true, plan }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Plan generation failed'
    await db
      .prepare("UPDATE tasks SET plan_status = 'failed', updated_at = unixepoch() WHERE task_id = ?")
      .bind(taskId)
      .run()
    await db
      .prepare('INSERT INTO agent_errors (tenant_id, audit_run_id, agent_id, error_type, error_msg, file_path) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(task.tenant_id ?? '', task.audit_run_id, `planner-${taskId}`, 'plan_error', message, '')
      .run()
    return { ok: false, error: message }
  }
}

export async function generatePlansForRun(auditRunId: string, env: Env, cap = 20): Promise<number> {
  const db = env.DB
  const rows = await db
    .prepare(`
      SELECT task_id FROM tasks
      WHERE audit_run_id = ? AND (plan_status IS NULL OR plan_status IN ('none', 'failed'))
      ORDER BY priority_score DESC
      LIMIT ?
    `)
    .bind(auditRunId, cap)
    .all<{ task_id: string }>()

  let generated = 0
  for (const row of rows.results ?? []) {
    const result = await generatePlanForTask(row.task_id, env)
    if (result.ok) generated++
  }
  return generated
}
