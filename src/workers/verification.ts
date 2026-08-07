import type { Env, Finding, FindingVerifyResult, Task, VerifyResult } from '../types/index'

export async function fetchDiff(
  owner: string,
  repo: string,
  commitSha: string,
  githubToken: string
): Promise<unknown> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (res.status !== 200) return null
  return res.json()
}

function evidenceInAfterState(evidenceQuote: string, patch: string | undefined): boolean {
  if (!patch) return false
  const lines = patch.split('\n')
  const afterLines = lines.filter(line => line.startsWith('+'))
  const quote = evidenceQuote.trim()
  return afterLines.some(line => line.includes(quote))
}

export async function verifyTask(task: Task, env: Env): Promise<VerifyResult> {
  const db = env.DB

  // TODO: read owner/repo from SYSTEM_SPEC.md once the spec is filled in
  const owner = 'OWNER'
  const repo = 'REPO'

  const diff = await fetchDiff(owner, repo, task.commit_sha ?? '', env.GITHUB_TOKEN) as {
    files?: Array<{ filename: string; patch?: string }>
  } | null

  if (!diff) {
    return { result: 'failed', reason: 'Could not fetch commit diff.' }
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

  for (const finding of findings) {
    const fileDiff = diff.files?.find(f => f.filename === finding.file)

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

  if (result === 'resolved') {
    await scheduleRegressionScan(task.audit_run_id, findingIds, env)
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

export async function escalateSeverity(findingId: string, db: D1Database): Promise<void> {
  const row = await db
    .prepare('SELECT severity FROM findings WHERE finding_id = ?')
    .bind(findingId)
    .first<{ severity: string }>()

  if (!row) return

  const ladder: Record<string, string> = {
    info: 'low',
    low: 'medium',
    medium: 'high',
    high: 'critical',
    critical: 'critical',
  }

  const next = ladder[row.severity] ?? row.severity
  await db
    .prepare('UPDATE findings SET severity = ? WHERE finding_id = ?')
    .bind(next, findingId)
    .run()
}

// STUB — implemented when regression scanning is wired up
async function scheduleRegressionScan(
  auditRunId: string,
  findingIds: string[],
  env: Env
): Promise<void> {
  // no-op stub
}
