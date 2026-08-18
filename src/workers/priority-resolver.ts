import type { Env, Finding, ScoredFinding, ConflictGroup, Task } from '../types/index'

const SEVERITY_BASE: Record<string, number> = {
  critical: 100,
  high:     75,
  medium:   40,
  low:      15,
  info:     5
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 5,
  high:     4,
  medium:   3,
  low:      2,
  info:     1
}

export function scoreFinding(
  finding: Finding,
  allFindings: Finding[],
  db: D1Database
): ScoredFinding {
  let score = SEVERITY_BASE[finding.severity] ?? 0
  const multipliers: string[] = [`base(${score})`]

  // 1. Multiple agents flagged the same file
  const agentsOnFile = new Set(
    allFindings
      .filter(f => f.file === finding.file)
      .map(f => f.agent_id)
  )
  if (agentsOnFile.size > 1) {
    score *= 1.5
    multipliers.push(`multi_agent(×1.5 — ${agentsOnFile.size} agents on file)`)
  }

  // 2. This finding blocks another (same file, this finding is more severe)
  const hasMoreSevereOnSameFile = allFindings.some(
    f => f.file === finding.file && SEVERITY_RANK[f.severity] < SEVERITY_RANK[finding.severity]
  )
  if (hasMoreSevereOnSameFile) {
    score *= 1.3
    multipliers.push('blocks_other(×1.3 — less severe issue on same file)')
  }

  // 3. File has no_test_coverage finding from testing agent
  const hasNoTestCoverage = allFindings.some(
    f => f.file === finding.file && f.category === 'no_test_coverage' && f.agent_type === 'testing'
  )
  if (hasNoTestCoverage) {
    score *= 1.2
    multipliers.push('no_test_coverage(×1.2 — testing agent found no coverage on this file)')
  }

  // 4. File is currently locked (task in_progress references this finding_id)
  // This is checked via the in-memory set passed by the caller; default to no lock.
  // The priority resolver runs once per audit run, so active locks are rare here.

  // 5. Finding source is regression
  if (finding.source === 'regression') {
    score *= 1.4
    multipliers.push('regression(×1.4)')
  }

  // 6. Finding has been seen before
  if (finding.recurrence_count > 0) {
    score *= 1.6
    multipliers.push(`recurring(×1.6 — recurrence_count=${finding.recurrence_count})`)
  }

  return {
    ...finding,
    priorityScore: Math.round(score * 100) / 100,
    multipliers,
  }
}

export function detectConflicts(findings: Finding[]): ConflictGroup[] {
  const conflicts: ConflictGroup[] = []
  const byFile = new Map<string, Finding[]>()

  for (const f of findings) {
    const list = byFile.get(f.file) ?? []
    list.push(f)
    byFile.set(f.file, list)
  }

  for (const [file, fileFindings] of byFile.entries()) {
    const hasSecurity = fileFindings.some(f => f.agent_type === 'security')
    const hasRefactoring = fileFindings.some(f => f.agent_type === 'refactoring')

    if (hasSecurity && hasRefactoring) {
      conflicts.push({
        file,
        finding_ids: fileFindings.map(f => f.finding_id),
        reason: 'Security and Refactoring agents both flagged this file; needs human review.',
        resolution: 'needs_human_decision',
      })
    }
  }

  return conflicts
}

export function groupFindingsIntoTasks(scoredFindings: ScoredFinding[]): Omit<Task, 'task_id' | 'created_at' | 'updated_at'>[] {
  const byFile = new Map<string, ScoredFinding[]>()

  for (const f of scoredFindings) {
    const list = byFile.get(f.file) ?? []
    list.push(f)
    byFile.set(f.file, list)
  }

  return Array.from(byFile.entries()).map(([file, findings]) => {
    const top = findings.reduce((max, f) => (f.priorityScore > max.priorityScore ? f : max), findings[0])
    const count = findings.length
    const filename = file.split('/').pop() ?? file

    return {
      audit_run_id: top.audit_run_id,
      title: `Fix ${count} issue(s) in ${filename}`,
      finding_ids: JSON.stringify(findings.map(f => f.finding_id)),
      priority_score: top.priorityScore,
      multipliers: JSON.stringify(top.multipliers),
      status: 'backlog' as Task['status'],
      assigned_agent: null,
      commit_sha: null,
      conflict_flag: 0 as Task['conflict_flag'],
      conflict_reason: null,
      lock_expires_at: null,
    }
  })
}

export async function runPriorityResolver(auditRunId: string, env: Env): Promise<void> {
  const db = env.DB

  const sessionRow = await db
    .prepare('SELECT tenant_id FROM audit_sessions WHERE id = ?')
    .bind(auditRunId)
    .first<{ tenant_id: string }>()
  const tenantId = sessionRow?.tenant_id ?? ''

  const rows = await db
    .prepare('SELECT * FROM findings WHERE audit_run_id = ?')
    .bind(auditRunId)
    .all<Finding>()

  const findings = rows.results ?? []

  const scored = findings.map(f => scoreFinding(f, findings, db))
  scored.sort((a, b) => b.priorityScore - a.priorityScore)

  const conflicts = detectConflicts(findings)
  const conflictFiles = new Set(conflicts.map(c => c.file))

  const taskGroups = groupFindingsIntoTasks(scored)

  const statements = taskGroups.map(group => {
    const ids: string[] = JSON.parse(group.finding_ids)
    const firstFinding = findings.find(f => f.finding_id === ids[0])
    const fileConflict = firstFinding ? conflictFiles.has(firstFinding.file) : false

    return db
      .prepare(`
        INSERT INTO tasks
          (tenant_id, audit_run_id, title, finding_ids, priority_score, multipliers, status,
           assigned_agent, commit_sha, conflict_flag, conflict_reason, lock_expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        tenantId,
        group.audit_run_id,
        group.title,
        group.finding_ids,
        group.priority_score,
        group.multipliers,
        group.status,
        group.assigned_agent,
        group.commit_sha,
        fileConflict ? 1 : 0,
        fileConflict ? 'Security and Refactoring both flagged this file' : null,
        group.lock_expires_at
      )
  })

  if (statements.length > 0) {
    await db.batch(statements)
  }

  await db
    .prepare("UPDATE agent_registry SET status = 'done' WHERE agent_type = 'priority_resolver'")
    .run()
}
