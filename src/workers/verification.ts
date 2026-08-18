import type { Env, Finding, FindingVerifyResult, Task, VerifyResult, DashboardEvent, Severity } from '../types/index'
import * as gitRouter from '../lib/git-router'

function evidenceInAfterState(evidenceQuote: string, patch: string | undefined): boolean {
  if (!patch) return false
  const lines = patch.split('\n')
  const afterLines = lines.filter(line => line.startsWith('+'))
  const quote = evidenceQuote.trim()
  return afterLines.some(line => line.includes(quote))
}

export async function verifyTask(
  task: Task,
  env: Env,
  humanApproved: boolean = false,
  broadcast?: (event: DashboardEvent) => void
): Promise<VerifyResult> {
  const db = env.DB

  const session = await db
    .prepare('SELECT repo_url, repo_branch FROM audit_sessions WHERE id = ?')
    .bind(task.audit_run_id)
    .first<{ repo_url: string; repo_branch: string }>()

  if (!session || !session.repo_url) {
    const reason = 'Missing repo_url'
    await db
      .prepare('INSERT INTO agent_errors (audit_run_id, agent_id, error_type, error_msg, file_path) VALUES (?, ?, ?, ?, ?)')
      .bind(task.audit_run_id, 'verification-agent', 'missing_repo_url', reason, task.task_id)
      .run()
    return { result: 'failed', reason }
  }

  const parsed = gitRouter.parseRepoUrl(session.repo_url, session.repo_branch)
  if (!parsed) {
    const reason = `Unsupported repo_url: ${session.repo_url}`
    await db
      .prepare('INSERT INTO agent_errors (audit_run_id, agent_id, error_type, error_msg, file_path) VALUES (?, ?, ?, ?, ?)')
      .bind(task.audit_run_id, 'verification-agent', 'unsupported_repo_url', reason, task.task_id)
      .run()
    return { result: 'failed', reason }
  }

  let diffFiles: Array<{ filename: string; patch?: string }> | undefined
  if (!humanApproved) {
    diffFiles = (await gitRouter.fetchDiff(
      session.repo_url,
      parsed.owner,
      parsed.repo,
      task.commit_sha ?? '',
      task.tenant_id ?? '',
      env
    )) ?? undefined

    if (!diffFiles) {
      return { result: 'failed', reason: 'Could not fetch commit diff.' }
    }
  }

  const findingIds: string[] = JSON.parse(task.finding_ids)
  const findings: Finding[] = []
  for (const id of findingIds) {
    const row = await db
      .prepare('SELECT * FROM findings WHERE finding_id = ?')
      .bind(id)
      .first<Finding>()
    if (row) findings.push(row)
  }

  const findingResults: FindingVerifyResult[] = []
  const resolvedFindings: Finding[] = []

  for (const finding of findings) {
    if (humanApproved) {
      findingResults.push({
        finding_id: finding.finding_id,
        resolved: true,
        reason: 'human approved',
      })
      await db
        .prepare('UPDATE findings SET status = ?, verified_at = unixepoch() WHERE finding_id = ?')
        .bind('resolved', finding.finding_id)
        .run()
      resolvedFindings.push(finding)
      await propagateResolvedFinding(finding, task.audit_run_id, db, broadcast)
      continue
    }

    const fileDiff = diffFiles?.find(f => f.filename === finding.file)

    if (!fileDiff) {
      findingResults.push({
        finding_id: finding.finding_id,
        resolved: false,
        reason: 'File not modified in commit diff',
      })
      continue
    }

    const stillPresent = evidenceInAfterState(finding.evidence_quote, fileDiff.patch)
    const resolved = !stillPresent

    findingResults.push({
      finding_id: finding.finding_id,
      resolved,
      reason: resolved
        ? 'evidence_quote no longer appears in the after state of the diff'
        : 'evidence_quote still appears in the after state of the diff',
    })

    if (!resolved) {
      await escalateSeverity(finding.finding_id, db)
    } else {
      await db
        .prepare('UPDATE findings SET status = ?, verified_at = unixepoch() WHERE finding_id = ?')
        .bind('resolved', finding.finding_id)
        .run()
      resolvedFindings.push(finding)
      await propagateResolvedFinding(finding, task.audit_run_id, db, broadcast)
    }
  }

  const resolvedCount = findingResults.filter(r => r.resolved).length
  let result: VerifyResult['result']
  if (resolvedCount === findingResults.length) {
    result = 'resolved'
  } else if (resolvedCount === 0) {
    result = 'failed_verification'
  } else {
    result = 'needs_revision'
  }

  if (result === 'resolved' && !humanApproved) {
    await scheduleRegressionScan(task, resolvedFindings, env, broadcast)
  }

  return { result, finding_results: findingResults }
}

export async function recalcProductionScore(auditRunId: string, db: D1Database): Promise<void> {
  const totalRow = await db
    .prepare(`
      SELECT COUNT(*) as count FROM findings
      WHERE audit_run_id = ? AND severity IN ('critical', 'high')
    `)
    .bind(auditRunId)
    .first<{ count: number }>()

  const resolvedRow = await db
    .prepare(`
      SELECT COUNT(*) as count FROM findings
      WHERE audit_run_id = ? AND severity IN ('critical', 'high') AND status = 'resolved' AND verified_at IS NOT NULL
    `)
    .bind(auditRunId)
    .first<{ count: number }>()

  const total = totalRow?.count ?? 0
  const resolved = resolvedRow?.count ?? 0
  const score = total === 0 ? 100 : Math.round((resolved / total) * 100)
  const clamped = Math.max(0, Math.min(100, score))

  await db
    .prepare('UPDATE run_budget SET production_score = ? WHERE audit_run_id = ?')
    .bind(clamped, auditRunId)
    .run()
}

export function escalateSeverityValue(severity: Severity): Severity {
  const ladder: Record<Severity, Severity> = {
    info: 'low',
    low: 'medium',
    medium: 'high',
    high: 'critical',
    critical: 'critical',
  }
  return ladder[severity] ?? severity
}

export async function escalateSeverity(findingId: string, db: D1Database): Promise<void> {
  const row = await db
    .prepare('SELECT severity FROM findings WHERE finding_id = ?')
    .bind(findingId)
    .first<{ severity: Severity }>()

  if (!row) return

  const next = escalateSeverityValue(row.severity)
  await db
    .prepare('UPDATE findings SET severity = ? WHERE finding_id = ?')
    .bind(next, findingId)
    .run()
}

async function scheduleRegressionScan(
  task: Task,
  resolvedFindings: Finding[],
  env: Env,
  broadcast?: (event: DashboardEvent) => void
): Promise<void> {
  if (resolvedFindings.length === 0) return

  const db = env.DB
  const session = await db
    .prepare('SELECT repo_url, repo_branch FROM audit_sessions WHERE id = ?')
    .bind(task.audit_run_id)
    .first<{ repo_url: string; repo_branch: string }>()

  if (!session?.repo_url || !task.commit_sha) return

  const parsed = gitRouter.parseRepoUrl(session.repo_url, session.repo_branch)
  if (!parsed) return

  for (const finding of resolvedFindings) {
    const content = await gitRouter.fetchFileContent(
      session.repo_url,
      parsed.owner,
      parsed.repo,
      finding.file,
      task.commit_sha,
      task.tenant_id ?? '',
      env
    )
    if (content === null) continue

    if (content.includes(finding.evidence_quote.trim())) {
      const newSeverity = escalateSeverityValue(finding.severity)
      const regressionId = `regression-${finding.finding_id}-${Date.now()}`
      await db
        .prepare(`
          INSERT INTO findings (
            finding_id, tenant_id, audit_run_id, agent_id, agent_type, severity, category,
            file, line_range_start, line_range_end, evidence_quote, description,
            impact, verified_by, source, status, recurrence_count, is_regression, ts, verified_at, screenshot_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          regressionId,
          finding.tenant_id ?? '',
          finding.audit_run_id,
          finding.agent_id,
          finding.agent_type,
          newSeverity,
          finding.category,
          finding.file,
          finding.line_range?.[0] ?? null,
          finding.line_range?.[1] ?? null,
          finding.evidence_quote,
          `Regression: ${finding.description}`,
          finding.impact,
          JSON.stringify(finding.verified_by),
          'regression',
          'open',
          (finding.recurrence_count ?? 0) + 1,
          1,
          Date.now(),
          null,
          finding.screenshot_id
        )
        .run()

      await db
        .prepare('INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data) VALUES (?, ?, ?, ?, ?)')
        .bind(
          finding.tenant_id ?? '',
          finding.audit_run_id,
          finding.agent_id,
          'regression_found',
          JSON.stringify({ original_finding_id: finding.finding_id, regression_finding_id: regressionId, file: finding.file, severity: newSeverity })
        )
        .run()

      broadcast?.({
        type: 'finding_created',
        audit_run_id: finding.audit_run_id,
        payload: {
          finding_id: regressionId,
          source: 'regression',
          original_finding_id: finding.finding_id,
          file: finding.file,
          severity: newSeverity,
        },
        ts: Date.now(),
      })
    }
  }
}

async function propagateResolvedFinding(
  finding: Finding,
  providerRunId: string,
  db: D1Database,
  broadcast?: (event: DashboardEvent) => void
): Promise<void> {
  const dependencies = await db
    .prepare('SELECT consumer_run_id, tenant_id FROM repo_dependencies WHERE provider_run_id = ? AND dependency_path = ?')
    .bind(providerRunId, finding.file)
    .all<{ consumer_run_id: string; tenant_id: string }>()

  for (const dep of dependencies.results ?? []) {
    const consumerFindings = await db
      .prepare(`
        SELECT finding_id FROM findings
        WHERE audit_run_id = ? AND file = ? AND status IN ('open','in_progress','in_review')
      `)
      .bind(dep.consumer_run_id, finding.file)
      .all<{ finding_id: string }>()

    const consumerFindingIds = (consumerFindings.results ?? []).map(r => r.finding_id)
    if (consumerFindingIds.length === 0) continue

    const taskId = `propagate-${finding.finding_id}-${dep.consumer_run_id}-${Date.now()}`
    await db
      .prepare(`
        INSERT INTO tasks (task_id, tenant_id, audit_run_id, title, finding_ids, priority_score, multipliers, status, assigned_agent, created_at, updated_at, conflict_flag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch(), ?)
      `)
      .bind(
        taskId,
        dep.tenant_id,
        dep.consumer_run_id,
        `Verify propagated fix from ${providerRunId}`,
        JSON.stringify(consumerFindingIds),
        50,
        JSON.stringify(['cross_repo_propagation']),
        'backlog',
        null,
        0
      )
      .run()

    await db
      .prepare('INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data) VALUES (?, ?, ?, ?, ?)')
      .bind(
        dep.tenant_id,
        dep.consumer_run_id,
        null,
        'cross_repo_propagation',
        JSON.stringify({
          provider_run_id: providerRunId,
          consumer_run_id: dep.consumer_run_id,
          source_finding_id: finding.finding_id,
          propagated_task_id: taskId,
          file: finding.file,
        })
      )
      .run()

    broadcast?.({
      type: 'task_created',
      audit_run_id: dep.consumer_run_id,
      payload: {
        task_id: taskId,
        source: 'cross_repo_propagation',
        provider_run_id: providerRunId,
        file: finding.file,
      },
      ts: Date.now(),
    })
  }
}
