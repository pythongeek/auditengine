import type { Env, Finding, Task, Message, DashboardEvent } from '../types/index'
import { llmCall } from '../lib/llm-gateway'
import { fetchFileContent, parseRepoUrl } from '../lib/git-router'
import { createBranch, commitFiles, createPullRequest, type RepoFileChange } from '../lib/git-write'
import { verifyTask } from './verification'

const FIXER_AGENT_TYPE = 'refactoring' as const

export function fixBranchName(taskId: string): string {
  return `auditengine/fix-${taskId.replace(/[^a-zA-Z0-9-]/g, '').slice(-12)}`
}

export function buildFixMessages(filePath: string, content: string, findings: Finding[], planText?: string | null): Message[] {
  const findingLines = findings.map(f =>
    `- [${f.severity}] ${f.category}${f.line_range ? ` (lines ${f.line_range[0]}–${f.line_range[1]})` : ''}: ${f.description}\n  Evidence: ${f.evidence_quote ?? ''}`
  ).join('\n')

  const planBlock = planText
    ? `\n## APPROVED REMEDIATION PLAN (follow it)\n${planText}\n`
    : ''

  const userContent = `## FILE TO FIX
Path: ${filePath}

\`\`\`
${content}
\`\`\`

## FINDINGS THAT MUST BE FIXED IN THIS FILE
${findingLines}
${planBlock}
## TASK
Rewrite the file so every finding above is fixed.
Rules:
1. Output the COMPLETE corrected file content only — no prose, no markdown fences, no diffs.
2. Make the minimal change that fixes each finding; do not refactor unrelated code.
3. Preserve the existing style, indentation, and public API of the file.
4. If a finding cannot be fixed safely in this file alone, leave it and add a comment starting with "AUDITENGINE-TODO:" explaining why.`

  return [
    {
      role: 'system',
      content:
        'You are the AuditEngine Fix Agent. You receive a source file and evidence-backed ' +
        'findings, and you return the complete corrected file. You never weaken security ' +
        'controls, never delete tests, and never change behavior unrelated to the findings.',
    },
    { role: 'user', content: userContent },
  ]
}

/** Extract raw file content from a model response that may wrap it in fences. */
export function extractFileContent(text: string): string {
  let t = text.trim()
  const fenceMatch = t.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n?```\s*$/)
  if (fenceMatch) return fenceMatch[1]
  return t
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

export interface FixResult {
  ok: boolean
  branch?: string
  commit_sha?: string
  pr_url?: string
  error?: string
}

export interface FixPreview {
  file: string
  original: string
  fixed: string
}

export interface GeneratedFixResult {
  ok: boolean
  changes: RepoFileChange[]
  preview: FixPreview[]
  error?: string
}

export interface ApplyFixOptions {
  dryRun?: boolean
  customPrompt?: string
}

/**
 * Fetch the current source files for a task, ask the fix agent to rewrite them,
 * and return the proposed changes. Does not commit or create branches when
 * dryRun is true.
 */
export async function generateFixForTask(
  taskId: string,
  env: Env,
  options: ApplyFixOptions = {}
): Promise<GeneratedFixResult> {
  const db = env.DB

  const task = await db
    .prepare('SELECT * FROM tasks WHERE task_id = ?')
    .bind(taskId)
    .first<Task>()
  if (!task) return { ok: false, changes: [], preview: [], error: 'Task not found' }

  const tenantId = task.tenant_id ?? ''
  const session = await db
    .prepare('SELECT repo_url, repo_branch FROM audit_sessions WHERE id = ? AND tenant_id = ?')
    .bind(task.audit_run_id, tenantId)
    .first<{ repo_url: string | null; repo_branch: string | null }>()

  if (!session?.repo_url) {
    return { ok: false, changes: [], preview: [], error: 'Fix automation requires an audit started from a repository URL (repo_url missing)' }
  }
  const parsed = parseRepoUrl(session.repo_url, session.repo_branch ?? undefined)
  if (!parsed) {
    return { ok: false, changes: [], preview: [], error: `Unsupported repo_url: ${session.repo_url}` }
  }
  const baseBranch = session.repo_branch || parsed.ref || 'main'

  const findingIds: string[] = JSON.parse(task.finding_ids || '[]')
  if (findingIds.length === 0) return { ok: false, changes: [], preview: [], error: 'Task has no findings' }

  const placeholders = findingIds.map(() => '?').join(',')
  const findingRows = await db
    .prepare(`SELECT * FROM findings WHERE finding_id IN (${placeholders})`)
    .bind(...findingIds)
    .all<Finding>()
  const findings = findingRows.results ?? []

  const files = [...new Set(findings.map(f => f.file).filter(Boolean))]
  if (files.length === 0) return { ok: false, changes: [], preview: [], error: 'Findings reference no files' }

  const broadcast = makeBroadcast(env, task.audit_run_id)

  try {
    const changes: RepoFileChange[] = []
    const preview: FixPreview[] = []
    for (const filePath of files) {
      const content = await fetchFileContent(
        session.repo_url, parsed.owner, parsed.repo, filePath, baseBranch, tenantId, env
      )
      if (content === null) {
        return { ok: false, changes: [], preview: [], error: `Could not fetch current content of ${filePath} from the repository` }
      }

      const fileFindings = findings.filter(f => f.file === filePath)
      const messages = buildFixMessages(filePath, content, fileFindings, task.plan_text)
      if (options.customPrompt) {
        messages[messages.length - 1].content += `\n\n## ADDITIONAL INSTRUCTIONS FROM USER\n${options.customPrompt}`
      }

      const response = await llmCall({
        agentId: `fixer-${taskId}`,
        agentType: FIXER_AGENT_TYPE,
        taskType: 'code_fix',
        messages,
        auditRunId: task.audit_run_id,
        db,
        broadcast,
      }, env)

      const fixed = extractFileContent(response.text)
      if (fixed && fixed !== content) {
        changes.push({ path: filePath, content: fixed })
        preview.push({ file: filePath, original: content, fixed })
      }
    }

    if (changes.length === 0) {
      return { ok: false, changes: [], preview: [], error: 'Fix agent produced no changes' }
    }

    if (options.dryRun) {
      return { ok: true, changes, preview }
    }

    const branch = fixBranchName(taskId)
    await createBranch(session.repo_url, branch, baseBranch, tenantId, env)

    const commit = await commitFiles(
      session.repo_url,
      branch,
      changes,
      `fix: ${task.title} (AuditEngine task ${taskId.slice(-6)})`,
      tenantId,
      env,
      { name: 'AuditEngine', email: 'auditengine@localhost' }
    )

    const pr = await createPullRequest(
      session.repo_url,
      branch,
      baseBranch,
      `[AuditEngine] ${task.title}`,
      `Automated remediation for audit task \`${taskId}\`.\n\n` +
      (task.plan_text ? `## Remediation plan\n${task.plan_text}\n\n` : '') +
      `Findings addressed: ${findingIds.join(', ')}`,
      tenantId,
      env
    )

    await db
      .prepare("UPDATE tasks SET status = 'in_review', commit_sha = ?, assigned_agent = ?, updated_at = unixepoch() WHERE task_id = ?")
      .bind(commit.sha, `fixer-${taskId}`, taskId)
      .run()

    broadcast({
      type: 'fix_applied',
      audit_run_id: task.audit_run_id,
      payload: { task_id: taskId, branch, commit_sha: commit.sha, pr_url: pr.url },
      ts: Date.now(),
    })

    // Hand off to verification; failures here must not undo the fix.
    try {
      await verifyTask({ ...task, commit_sha: commit.sha, status: 'in_review' }, env, false, broadcast)
    } catch {
      // verification will be re-run from the task board or the coordinator
    }

    return { ok: true, changes, preview, branch, commit_sha: commit.sha, pr_url: pr.url } as unknown as GeneratedFixResult
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fix failed'
    await db
      .prepare('INSERT INTO agent_errors (tenant_id, audit_run_id, agent_id, error_type, error_msg, file_path) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(tenantId, task.audit_run_id, `fixer-${taskId}`, 'fix_error', message, files[0] ?? '')
      .run()
    return { ok: false, changes: [], preview: [], error: message }
  }
}

/**
 * Generate fixes for a task's findings, commit them to a new branch on the
 * audited repository, open a PR/MR, and hand the task to verification.
 */
export async function applyFixForTask(taskId: string, env: Env): Promise<FixResult> {
  const result = await generateFixForTask(taskId, env)
  if (!result.ok) {
    return { ok: false, error: result.error ?? 'Fix failed' }
  }
  // The apply path returned the branch/commit/pr from the full run.
  const full = result as unknown as GeneratedFixResult & { branch?: string; commit_sha?: string; pr_url?: string }
  return {
    ok: true,
    branch: full.branch,
    commit_sha: full.commit_sha,
    pr_url: full.pr_url,
  }
}
