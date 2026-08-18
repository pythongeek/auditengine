import type { Env, AgentType, Task, Finding, Tenant, AuditSession } from '../types/index'
import ingestionWorker from '../workers/ingestion'
import { verifyTask } from '../workers/verification'
import { runVisualQA } from '../workers/visual-qa'
import { DASHBOARD_HTML } from '../dashboard/dashboard-html'
import { HOME_HTML } from '../dashboard/home-html'
import { AUDIT_NEW_HTML } from '../dashboard/audit-new-html'
import { LOGIN_HTML } from '../dashboard/login-html'
import { TENANT_SELECTOR_HTML } from '../dashboard/tenant-selector-html'
import { AUDIT_LIST_HTML } from '../dashboard/audit-list-html'
import { TASK_BOARD_HTML } from '../dashboard/task-board-html'
import { FINDING_DETAIL_HTML } from '../dashboard/finding-detail-html'
import { ONBOARDING_HTML } from '../dashboard/onboarding-html'
import { SETTINGS_HTML } from '../dashboard/settings-html'
import { REPOS_HTML } from '../dashboard/repos-html'
import { listAgentConfigs, setAgentConfig, ALL_AGENT_TYPES } from './agent-config'
import { createOAuthState, verifyOAuthState, isAdmin, createToken } from './auth'
import { encryptToken } from './token-crypto'
import { listMaskedSettings, storeProviderApiKey, storeGitProviderToken } from './settings'
import { getOpenApiSpec } from './openapi'
import { createBranch, commitFiles, createPullRequest, type RepoFileChange } from './git-write'
import { getTokenForTenant as getGitHubTokenForTenant } from './github'
import { getTokenForTenant as getGitLabTokenForTenant } from './gitlab'
import { getTokenForTenant as getBitbucketTokenForTenant } from './bitbucket'
import { listRepoFiles } from './git-router'

const validAgentTypes = new Set<AgentType>(ALL_AGENT_TYPES)

export function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export function withTenantHeader(request: Request, tenantId: string): Request {
  const headers = new Headers(request.headers)
  headers.set('X-Tenant-Id', tenantId)
  return new Request(request, { headers })
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function errorResponse(message: string, status: number, code?: string): Response {
  return jsonResponse({ error: message, code }, status)
}

function broadcast(event: import('../types/index').DashboardEvent, env: Env): void {
  const id = env.DASHBOARD_DO.idFromName('dashboard-' + event.audit_run_id)
  const stub = env.DASHBOARD_DO.get(id)
  stub.fetch(new Request('https://dashboard/broadcast', {
    method: 'POST',
    body: JSON.stringify(event),
    headers: { 'Content-Type': 'application/json' },
  })).catch(() => {
    // broadcast failures are non-fatal
  })
}

export function handleOpenApiGet(): Response {
  return jsonResponse(getOpenApiSpec())
}

export function handleHome(): Response {
  return htmlResponse(HOME_HTML)
}

export function handleAuditNew(): Response {
  return htmlResponse(AUDIT_NEW_HTML)
}

export function handleRepos(): Response {
  return htmlResponse(REPOS_HTML)
}

export function handleDashboardGet(): Response {
  return htmlResponse(DASHBOARD_HTML)
}

export function handleLogin(): Response {
  return htmlResponse(LOGIN_HTML)
}

export function handleTenantSelector(): Response {
  return htmlResponse(TENANT_SELECTOR_HTML)
}

export function handleAuditListPage(): Response {
  return htmlResponse(AUDIT_LIST_HTML)
}

export function handleTaskBoard(): Response {
  return htmlResponse(TASK_BOARD_HTML)
}

export function handleFindingDetail(): Response {
  return htmlResponse(FINDING_DETAIL_HTML)
}

export function handleOnboarding(): Response {
  return htmlResponse(ONBOARDING_HTML)
}

export function handleSettings(): Response {
  return htmlResponse(SETTINGS_HTML)
}

export async function handleSettingsKeysGet(env: Env, request: Request): Promise<Response> {
  if (!(await isAdmin(request, env))) {
    return errorResponse('Admin credentials required', 401)
  }
  const keys = await listMaskedSettings(env.DB)
  return jsonResponse({ keys })
}

export async function handleSettingsKeysPost(env: Env, request: Request, body: unknown): Promise<Response> {
  if (!(await isAdmin(request, env))) {
    return errorResponse('Admin credentials required', 401)
  }
  if (!body || typeof body !== 'object') {
    return errorResponse('Invalid JSON body', 400)
  }
  const b = body as Record<string, unknown>

  const kimiKey = typeof b.kimi_api_key === 'string' ? b.kimi_api_key : undefined
  const minimaxKey = typeof b.minimax_api_key === 'string' ? b.minimax_api_key : undefined
  const githubToken = typeof b.github_token === 'string' ? b.github_token : undefined
  const gitlabToken = typeof b.gitlab_token === 'string' ? b.gitlab_token : undefined
  const bitbucketToken = typeof b.bitbucket_token === 'string' ? b.bitbucket_token : undefined

  const saved: Record<string, boolean> = {}

  if (kimiKey !== undefined) {
    await storeProviderApiKey(env.DB, 'kimi', env.ENCRYPTION_KEY, kimiKey)
    saved.kimi_api_key = kimiKey.length > 0
  }

  if (minimaxKey !== undefined) {
    await storeProviderApiKey(env.DB, 'minimax', env.ENCRYPTION_KEY, minimaxKey)
    saved.minimax_api_key = minimaxKey.length > 0
  }

  if (githubToken !== undefined) {
    await storeGitProviderToken(env.DB, 'github', env.ENCRYPTION_KEY, githubToken)
    saved.github_token = githubToken.length > 0
  }

  if (gitlabToken !== undefined) {
    await storeGitProviderToken(env.DB, 'gitlab', env.ENCRYPTION_KEY, gitlabToken)
    saved.gitlab_token = gitlabToken.length > 0
  }

  if (bitbucketToken !== undefined) {
    await storeGitProviderToken(env.DB, 'bitbucket', env.ENCRYPTION_KEY, bitbucketToken)
    saved.bitbucket_token = bitbucketToken.length > 0
  }

  await env.DB
    .prepare('INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data) VALUES (?, ?, ?, ?, ?)')
    .bind('', '', null, 'settings_keys_updated', JSON.stringify({ saved }))
    .run()

  return jsonResponse({ success: true, saved })
}

export async function handleDashboardWS(request: Request, env: Env, tenantId: string, auditRunId: string): Promise<Response> {
  const id = env.DASHBOARD_DO.idFromName('dashboard-' + auditRunId)
  const stub = env.DASHBOARD_DO.get(id)
  return stub.fetch(withTenantHeader(request, tenantId))
}

export async function handleIngest(request: Request, env: Env, tenantId: string): Promise<Response> {
  return ingestionWorker.fetch(withTenantHeader(request, tenantId), env)
}

export async function handleRepoFileList(env: Env, request: Request, tenantId: string): Promise<Response> {
  let body: {
    repo_url?: string
    branch?: string
  } = {}

  try {
    const text = await request.text().catch(() => '')
    try {
      body = JSON.parse(text) as typeof body
    } catch {
      return errorResponse('Invalid JSON', 400)
    }

    if (typeof body.repo_url !== 'string' || body.repo_url.length === 0) {
      return errorResponse('Missing repo_url', 400)
    }

    const files = await listRepoFiles(body.repo_url, body.branch, tenantId, env)
    return jsonResponse({ files })
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to list repository files', 500)
  }
}

export async function handleAuditStart(request: Request, env: Env, tenantId: string, ctx?: ExecutionContext): Promise<Response> {
  let body: {
    audit_run_id?: string
    files?: Array<{ path: string; content: string }>
    repo_url?: string
    branch?: string
    commit_sha?: string
    repo_group_id?: string
    selected_paths?: string[]
  } = {}

  try {
    let bodyText: string
    try {
      bodyText = await request.text()
    } catch {
      return errorResponse('Invalid body', 400)
    }

    try {
      body = JSON.parse(bodyText) as typeof body
    } catch {
      return errorResponse('Invalid JSON', 400)
    }

    if (!body.audit_run_id || (!Array.isArray(body.files) && !body.repo_url)) {
      return errorResponse('Missing audit_run_id or files/repo_url', 400)
    }

    // Repo ingestion can be long-running (hundreds of files / large zipballs) and
    // exceeds the HTTP request's waitUntil/CPU budget. Route repo audits through
    // a Cloudflare Workflow, which has a much longer execution window. File-only
    // audits stay on the HTTP path because they are usually small.
    if (body.repo_url) {
      await env.AUDIT_START_WORKFLOW.create({
        id: `audit-start-${body.audit_run_id}-${Date.now()}`,
        params: {
          audit_run_id: body.audit_run_id,
          tenant_id: tenantId,
          files: body.files,
          repo_url: body.repo_url,
          branch: body.branch,
          commit_sha: body.commit_sha,
          repo_group_id: body.repo_group_id,
          selected_paths: body.selected_paths,
        },
      })
      return jsonResponse({ audit_run_id: body.audit_run_id, status: 'queued' }, 202)
    }

    // Run file-only audits in the background so the UI stays responsive.
    const pipeline = async (): Promise<void> => {
      try {
        const ingestRequest = new Request('https://localhost/ingest', {
          method: 'POST',
          body: JSON.stringify({
            audit_run_id: body.audit_run_id,
            files: body.files,
            repo_url: body.repo_url,
            branch: body.branch,
            commit_sha: body.commit_sha,
            repo_group_id: body.repo_group_id,
            selected_paths: body.selected_paths,
          }),
          headers: { 'Content-Type': 'application/json' },
        })
        const ingestResponse = await handleIngest(ingestRequest, env, tenantId)
        if (!ingestResponse.ok) {
          let detail = 'Ingestion failed'
          try {
            const data = await ingestResponse.json() as { error?: string }
            if (data.error) detail = data.error
          } catch {
            // ignore
          }
          await env.DB
            .prepare('INSERT INTO agent_errors (tenant_id, audit_run_id, agent_id, error_type, error_msg, file_path) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(tenantId, body.audit_run_id ?? '', 'audit-start', 'ingestion_error', detail, body.repo_url ?? '')
            .run()
          return
        }

        const coordinatorId = env.COORDINATOR_DO.idFromName('coordinator-' + body.audit_run_id)
        const coordinatorStub = env.COORDINATOR_DO.get(coordinatorId)
        await coordinatorStub.fetch(new Request('https://coordinator/start', {
          method: 'POST',
          body: JSON.stringify({ audit_run_id: body.audit_run_id, tenant_id: tenantId }),
          headers: { 'Content-Type': 'application/json' },
        }))
      } catch (err) {
        try {
          await env.DB
            .prepare('INSERT INTO agent_errors (tenant_id, audit_run_id, agent_id, error_type, error_msg, file_path) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(tenantId, body.audit_run_id ?? '', 'audit-start', 'pipeline_error', err instanceof Error ? err.message : 'Unknown error', body.repo_url ?? '')
            .run()
        } catch {
          // ignore
        }
        throw err
      }
    }

    if (ctx) {
      ctx.waitUntil(pipeline())
    } else {
      // Queue consumer path: run inline so failures can be retried.
      await pipeline()
    }

    return jsonResponse({ audit_run_id: body.audit_run_id, status: 'queued' }, 202)
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to start audit', 500)
  }
}

export async function handleTenantConfigGet(env: Env, tenantId: string): Promise<Response> {
  const configs = await listAgentConfigs(env.DB, tenantId)
  return jsonResponse({ tenant_id: tenantId, configs })
}

export async function handleTenantConfigPatch(env: Env, tenantId: string, body: unknown): Promise<Response> {
  if (!body || typeof body !== 'object') {
    return errorResponse('Invalid JSON body', 400)
  }
  const b = body as Record<string, unknown>

  if (!b.agent_id || typeof b.agent_id !== 'string' || !b.updates || typeof b.updates !== 'object') {
    return errorResponse('Missing agent_id or updates', 400)
  }

  if (!validAgentTypes.has(b.agent_id as AgentType)) {
    return errorResponse('Invalid agent_id', 400)
  }

  const updated = await setAgentConfig(
    env.DB,
    tenantId,
    b.agent_id as AgentType,
    b.updates as Partial<import('../types/index').AgentConfig>
  )
  return jsonResponse({ tenant_id: tenantId, config: updated })
}

export async function handleTenantList(env: Env): Promise<Response> {
  const rows = await env.DB
    .prepare('SELECT id, name, plan, created_at, updated_at FROM tenants ORDER BY created_at DESC LIMIT 100')
    .all<Tenant>()

  return jsonResponse({ tenants: rows.results ?? [] })
}

function generateTenantId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = 'tenant-'
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

export async function handleTenantCreate(env: Env, body: unknown): Promise<Response> {
  if (!body || typeof body !== 'object') {
    return errorResponse('Invalid JSON body', 400)
  }
  const b = body as Record<string, unknown>
  const name = typeof b.name === 'string' && b.name.trim().length > 0 ? b.name.trim() : undefined
  const plan = typeof b.plan === 'string' ? b.plan : 'free'

  const tenantId = generateTenantId()
  const displayName = name || tenantId

  const existing = await env.DB.prepare('SELECT id FROM tenants WHERE id = ?').bind(tenantId).first()
  if (existing) {
    return errorResponse('Tenant ID collision, retry', 500)
  }

  await env.DB
    .prepare('INSERT INTO tenants (id, name, plan) VALUES (?, ?, ?)')
    .bind(tenantId, displayName, plan)
    .run()

  const token = await createToken(tenantId, env.JWT_SECRET, plan, 365 * 24 * 3600)

  await env.DB
    .prepare('INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data) VALUES (?, ?, ?, ?, ?)')
    .bind(tenantId, '', null, 'tenant_created', JSON.stringify({ plan }))
    .run()

  return jsonResponse({ tenant: { id: tenantId, name: displayName, plan }, token }, 201)
}

export async function handleTenantGet(env: Env, tenantId: string): Promise<Response> {
  const row = await env.DB
    .prepare('SELECT id, name, plan, created_at, updated_at FROM tenants WHERE id = ?')
    .bind(tenantId)
    .first<Tenant>()

  if (!row) {
    return errorResponse('Tenant not found', 404)
  }

  return jsonResponse({ tenant: row })
}

export async function handleGitBranch(env: Env, tenantId: string, body: unknown): Promise<Response> {
  if (!body || typeof body !== 'object') {
    return errorResponse('Invalid JSON body', 400)
  }
  const b = body as Record<string, unknown>
  if (typeof b.repo_url !== 'string' || typeof b.branch !== 'string') {
    return errorResponse('Missing repo_url or branch', 400)
  }
  const from = typeof b.from === 'string' ? b.from : 'main'
  try {
    await createBranch(b.repo_url, b.branch, from, tenantId, env)
    return jsonResponse({ success: true })
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to create branch', 500)
  }
}

export async function handleGitCommit(env: Env, tenantId: string, body: unknown): Promise<Response> {
  if (!body || typeof body !== 'object') {
    return errorResponse('Invalid JSON body', 400)
  }
  const b = body as Record<string, unknown>
  if (typeof b.repo_url !== 'string' || typeof b.branch !== 'string' || !Array.isArray(b.changes)) {
    return errorResponse('Missing repo_url, branch, or changes', 400)
  }
  const changes = b.changes as RepoFileChange[]
  const message = typeof b.message === 'string' ? b.message : 'AuditEngine automated commit'
  const author = typeof b.author === 'object' && b.author !== null ? (b.author as { name: string; email: string }) : undefined
  try {
    const result = await commitFiles(b.repo_url, b.branch, changes, message, tenantId, env, author)
    return jsonResponse({ success: true, commit: result })
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to commit', 500)
  }
}

export async function handleGitPullRequest(env: Env, tenantId: string, body: unknown): Promise<Response> {
  if (!body || typeof body !== 'object') {
    return errorResponse('Invalid JSON body', 400)
  }
  const b = body as Record<string, unknown>
  if (typeof b.repo_url !== 'string' || typeof b.head !== 'string' || typeof b.base !== 'string') {
    return errorResponse('Missing repo_url, head, or base', 400)
  }
  const title = typeof b.title === 'string' ? b.title : 'AuditEngine automated PR'
  const prBody = typeof b.body === 'string' ? b.body : ''
  try {
    const result = await createPullRequest(b.repo_url, b.head, b.base, title, prBody, tenantId, env)
    return jsonResponse({ success: true, pull_request: result })
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to create PR', 500)
  }
}

export async function handleAuditList(env: Env, tenantId: string): Promise<Response> {
  const rows = await env.DB
    .prepare('SELECT id, repo_url, repo_branch, status, readiness_score, total_files, files_analyzed, findings_count, created_at, completed_at FROM audit_sessions WHERE tenant_id = ? ORDER BY created_at DESC')
    .bind(tenantId)
    .all<AuditSession>()

  return jsonResponse({ tenant_id: tenantId, audits: rows.results ?? [] })
}

export async function handleAuditDetail(env: Env, tenantId: string, auditRunId: string): Promise<Response> {
  const owns = await verifyAuditRunTenant(env.DB, auditRunId, tenantId)
  if (!owns) return errorResponse('Audit run not found', 404)

  const session = await env.DB
    .prepare('SELECT id, repo_url, repo_branch, status, readiness_score, total_files, files_analyzed, findings_count, created_at, completed_at FROM audit_sessions WHERE id = ?')
    .bind(auditRunId)
    .first<AuditSession>()

  if (!session) {
    return errorResponse('Audit run not found', 404)
  }

  const statusCounts = await env.DB
    .prepare('SELECT status, COUNT(*) as count FROM findings WHERE audit_run_id = ? AND (tenant_id = ? OR tenant_id = \'\') GROUP BY status')
    .bind(auditRunId, tenantId)
    .all<{ status: string; count: number }>()

  const severityCounts = await env.DB
    .prepare('SELECT severity, COUNT(*) as count FROM findings WHERE audit_run_id = ? AND (tenant_id = ? OR tenant_id = \'\') GROUP BY severity')
    .bind(auditRunId, tenantId)
    .all<{ severity: string; count: number }>()

  return jsonResponse({
    tenant_id: tenantId,
    audit: session,
    findings: {
      by_status: statusCounts.results ?? [],
      by_severity: severityCounts.results ?? [],
    },
  })
}

export async function handleTenantScoreGet(env: Env, tenantId: string): Promise<Response> {
  const rows = await env.DB
    .prepare('SELECT id, readiness_score, status FROM audit_sessions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 10')
    .bind(tenantId)
    .all<{ id: string; readiness_score: number; status: string }>()

  return jsonResponse({ tenant_id: tenantId, sessions: rows.results ?? [] })
}

export async function handleGroupGet(env: Env, tenantId: string, groupId: string): Promise<Response> {
  const group = await env.DB
    .prepare('SELECT group_id, tenant_id, name, created_at FROM repo_groups WHERE group_id = ? AND tenant_id = ?')
    .bind(groupId, tenantId)
    .first<{ group_id: string; tenant_id: string; name: string; created_at: number }>()
  if (!group) {
    return errorResponse('Group not found', 404)
  }

  const members = await env.DB
    .prepare(`
      SELECT m.audit_run_id, m.role, s.repo_url, s.status, s.readiness_score
      FROM repo_group_members m
      JOIN audit_sessions s ON s.id = m.audit_run_id
      WHERE m.group_id = ?
    `)
    .bind(groupId)
    .all<{ audit_run_id: string; role: string; repo_url: string; status: string; readiness_score: number }>()

  return jsonResponse({
    tenant_id: tenantId,
    group: {
      group_id: group.group_id,
      name: group.name,
      created_at: group.created_at,
    },
    audits: members.results ?? [],
  })
}

export async function handleDependencyCreate(
  env: Env,
  tenantId: string,
  body: unknown
): Promise<Response> {
  if (!body || typeof body !== 'object') {
    return errorResponse('Invalid JSON body', 400)
  }
  const b = body as Record<string, unknown>

  if (
    typeof b.group_id !== 'string' ||
    typeof b.dependency_path !== 'string' ||
    typeof b.consumer_run_id !== 'string' ||
    typeof b.provider_run_id !== 'string'
  ) {
    return errorResponse('Missing group_id, dependency_path, consumer_run_id, or provider_run_id', 400)
  }

  const ownsGroup = await env.DB
    .prepare('SELECT 1 FROM repo_groups WHERE group_id = ? AND tenant_id = ?')
    .bind(b.group_id, tenantId)
    .first()
  if (!ownsGroup) {
    return errorResponse('Group not found', 404)
  }

  await env.DB
    .prepare(`
      INSERT OR IGNORE INTO repo_dependencies (tenant_id, group_id, dependency_path, consumer_run_id, provider_run_id)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(tenantId, b.group_id, b.dependency_path, b.consumer_run_id, b.provider_run_id)
    .run()

  return jsonResponse({
    tenant_id: tenantId,
    group_id: b.group_id,
    dependency_path: b.dependency_path,
    consumer_run_id: b.consumer_run_id,
    provider_run_id: b.provider_run_id,
  })
}

const LOCK_TIMEOUT_SECONDS = 48 * 3600

const VALID_TASK_STATUS_TRANSITIONS: Record<Task['status'], Task['status'][]> = {
  backlog: ['in_progress', 'backlog'],
  in_progress: ['in_review', 'backlog'],
  in_review: ['done', 'backlog'],
  done: ['backlog'],
}

const VALID_FINDING_STATUSES = new Set<string>([
  'open', 'in_progress', 'in_review', 'resolved', 'closed', 'superseded', 'wont_fix',
])

async function verifyAuditRunTenant(
  db: D1Database,
  auditRunId: string,
  tenantId: string
): Promise<boolean> {
  const row = await db
    .prepare('SELECT tenant_id FROM audit_sessions WHERE id = ?')
    .bind(auditRunId)
    .first<{ tenant_id: string }>()
  return row?.tenant_id === tenantId
}

async function logTaskEvent(
  db: D1Database,
  tenantId: string,
  auditRunId: string,
  taskId: string,
  eventType: string,
  eventData: Record<string, unknown>
): Promise<void> {
  await db
    .prepare('INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data) VALUES (?, ?, ?, ?, ?)')
    .bind(tenantId, auditRunId, taskId, eventType, JSON.stringify(eventData))
    .run()
}

export async function handleTaskList(
  env: Env,
  tenantId: string,
  auditRunId: string,
  statusFilter?: string
): Promise<Response> {
  const owns = await verifyAuditRunTenant(env.DB, auditRunId, tenantId)
  if (!owns) return errorResponse('Audit run not found', 404)

  let sql = 'SELECT * FROM tasks WHERE audit_run_id = ?'
  const params: (string | number)[] = [auditRunId]
  if (statusFilter) {
    sql += ' AND status = ?'
    params.push(statusFilter)
  }
  sql += ' ORDER BY priority_score DESC, created_at DESC'

  const rows = await env.DB
    .prepare(sql)
    .bind(...params)
    .all<Task>()

  return jsonResponse({ tenant_id: tenantId, audit_run_id: auditRunId, tasks: rows.results ?? [] })
}

export async function handleTaskPatch(
  env: Env,
  tenantId: string,
  auditRunId: string,
  taskId: string,
  body: unknown
): Promise<Response> {
  const owns = await verifyAuditRunTenant(env.DB, auditRunId, tenantId)
  if (!owns) return errorResponse('Audit run not found', 404)

  if (!body || typeof body !== 'object') {
    return errorResponse('Invalid JSON body', 400)
  }
  const b = body as Record<string, unknown>
  const newStatus = b.status
  if (typeof newStatus !== 'string' || !VALID_TASK_STATUS_TRANSITIONS[newStatus as Task['status']]) {
    return errorResponse('Invalid or missing status', 400)
  }

  const task = await env.DB
    .prepare('SELECT * FROM tasks WHERE task_id = ? AND audit_run_id = ?')
    .bind(taskId, auditRunId)
    .first<Task>()
  if (!task) {
    return errorResponse('Task not found', 404)
  }

  const allowed = VALID_TASK_STATUS_TRANSITIONS[task.status]
  if (!allowed.includes(newStatus as Task['status'])) {
    return errorResponse(`Invalid status transition from ${task.status} to ${newStatus}`, 400)
  }

  if (newStatus === 'in_progress') {
    const assignedAgent = typeof b.assigned_agent === 'string' ? b.assigned_agent : task.assigned_agent ?? 'unknown'
    await env.DB
      .prepare('UPDATE tasks SET status = ?, assigned_agent = ?, lock_expires_at = unixepoch() + ?, updated_at = unixepoch() WHERE task_id = ?')
      .bind('in_progress', assignedAgent, LOCK_TIMEOUT_SECONDS, taskId)
      .run()
    await logTaskEvent(env.DB, tenantId, auditRunId, taskId, 'task_in_progress', { assigned_agent: assignedAgent, lock_expires_at: 'unixepoch() + 48h' })
    return jsonResponse({ task_id: taskId, status: 'in_progress', assigned_agent: assignedAgent, lock_expires_at_seconds: LOCK_TIMEOUT_SECONDS })
  }

  if (newStatus === 'backlog') {
    await env.DB
      .prepare('UPDATE tasks SET status = ?, assigned_agent = ?, lock_expires_at = ?, updated_at = unixepoch() WHERE task_id = ?')
      .bind('backlog', null, null, taskId)
      .run()
    await logTaskEvent(env.DB, tenantId, auditRunId, taskId, 'task_reset_backlog', {})
    return jsonResponse({ task_id: taskId, status: 'backlog' })
  }

  if (newStatus === 'in_review') {
    const findingIds: string[] = JSON.parse(task.finding_ids)
    if (findingIds.length > 0) {
      const screenshotFindings = await env.DB
        .prepare(`SELECT finding_id FROM findings WHERE finding_id IN (${findingIds.map(() => '?').join(',')}) AND screenshot_id IS NOT NULL AND status != 'resolved'`)
        .bind(...findingIds)
        .all<{ finding_id: string }>()

      if ((screenshotFindings.results ?? []).length > 0) {
        await runVisualQA(auditRunId, env)
        const newFailures = await env.DB
          .prepare("SELECT finding_id FROM findings WHERE audit_run_id = ? AND source = 'visual_qa' AND status = 'open'")
          .bind(auditRunId)
          .all<{ finding_id: string }>()

        if ((newFailures.results ?? []).length > 0) {
          await env.DB
            .prepare('UPDATE tasks SET status = ?, assigned_agent = ?, lock_expires_at = ?, updated_at = unixepoch() WHERE task_id = ?')
            .bind('backlog', null, null, taskId)
            .run()
          await logTaskEvent(env.DB, tenantId, auditRunId, taskId, 'task_returned_to_backlog', { reason: 'visual_qa re-run detected unresolved screenshot issues' })
          return jsonResponse({ task_id: taskId, status: 'backlog', reason: 'visual_qa re-run detected unresolved screenshot issues' })
        }
      }
    }

    await env.DB
      .prepare('UPDATE tasks SET status = ?, updated_at = unixepoch() WHERE task_id = ?')
      .bind('in_review', taskId)
      .run()
    await logTaskEvent(env.DB, tenantId, auditRunId, taskId, 'task_in_review', {})
    return jsonResponse({ task_id: taskId, status: 'in_review' })
  }

  // newStatus === 'done'
  if (task.status !== 'in_review') {
    return errorResponse('Task must be in_review before marking done', 400)
  }
  const commitSha = typeof b.commit_sha === 'string' ? b.commit_sha : null
  if (!commitSha) {
    return errorResponse('commit_sha is required to mark a task done', 400)
  }
  const humanApproved = b.human_approved === true

  await env.DB
    .prepare('UPDATE tasks SET status = ?, commit_sha = ?, updated_at = unixepoch() WHERE task_id = ?')
    .bind('in_review', commitSha, taskId)
    .run()

  const updatedTask: Task = { ...task, status: 'in_review', commit_sha: commitSha }
  let verificationResult: import('../types/index').VerifyResult
  try {
    verificationResult = await verifyTask(updatedTask, env, humanApproved, (event) => broadcast(event, env))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'verification failed'
    await logTaskEvent(env.DB, tenantId, auditRunId, taskId, 'verification_error', { error: msg })
    return errorResponse(msg, 500)
  }

  await logTaskEvent(env.DB, tenantId, auditRunId, taskId, 'task_verification_triggered', { commit_sha: commitSha, result: verificationResult.result, human_approved: humanApproved })
  return jsonResponse({ task_id: taskId, status: 'in_review', commit_sha: commitSha, verification: verificationResult })
}

export async function handleTaskVerify(
  env: Env,
  tenantId: string,
  auditRunId: string,
  taskId: string,
  body: unknown = {}
): Promise<Response> {
  const owns = await verifyAuditRunTenant(env.DB, auditRunId, tenantId)
  if (!owns) return errorResponse('Audit run not found', 404)

  const task = await env.DB
    .prepare('SELECT * FROM tasks WHERE task_id = ? AND audit_run_id = ?')
    .bind(taskId, auditRunId)
    .first<Task>()
  if (!task) {
    return errorResponse('Task not found', 404)
  }
  if (!task.commit_sha) {
    return errorResponse('Task has no commit_sha', 400)
  }

  const b = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const humanApproved = b.human_approved === true

  let verificationResult: import('../types/index').VerifyResult
  try {
    verificationResult = await verifyTask(task, env, humanApproved, (event) => broadcast(event, env))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'verification failed'
    await logTaskEvent(env.DB, tenantId, auditRunId, taskId, 'verification_error', { error: msg, human_approved: humanApproved })
    return errorResponse(msg, 500)
  }

  await logTaskEvent(env.DB, tenantId, auditRunId, taskId, 'task_verify_endpoint', { result: verificationResult.result, human_approved: humanApproved })
  return jsonResponse({ task_id: taskId, verification: verificationResult })
}

export async function handleFindingList(
  env: Env,
  tenantId: string,
  auditRunId: string,
  severityFilter?: string,
  statusFilter?: string
): Promise<Response> {
  const owns = await verifyAuditRunTenant(env.DB, auditRunId, tenantId)
  if (!owns) return errorResponse('Audit run not found', 404)

  let sql = 'SELECT * FROM findings WHERE audit_run_id = ? AND (tenant_id = ? OR tenant_id = \'\')'
  const params: (string | number)[] = [auditRunId, tenantId]
  if (severityFilter) {
    sql += ' AND severity = ?'
    params.push(severityFilter)
  }
  if (statusFilter) {
    sql += ' AND status = ?'
    params.push(statusFilter)
  }
  sql += ' ORDER BY ts DESC'

  const rows = await env.DB
    .prepare(sql)
    .bind(...params)
    .all<Finding>()

  return jsonResponse({ tenant_id: tenantId, audit_run_id: auditRunId, findings: rows.results ?? [] })
}

export async function handleFindingPatch(
  env: Env,
  tenantId: string,
  auditRunId: string,
  findingId: string,
  body: unknown
): Promise<Response> {
  const owns = await verifyAuditRunTenant(env.DB, auditRunId, tenantId)
  if (!owns) return errorResponse('Audit run not found', 404)

  if (!body || typeof body !== 'object') {
    return errorResponse('Invalid JSON body', 400)
  }
  const b = body as Record<string, unknown>
  const newStatus = b.status
  if (typeof newStatus !== 'string' || !VALID_FINDING_STATUSES.has(newStatus)) {
    return errorResponse('Invalid or missing status', 400)
  }

  const finding = await env.DB
    .prepare('SELECT * FROM findings WHERE finding_id = ? AND audit_run_id = ? AND (tenant_id = ? OR tenant_id = \'\')')
    .bind(findingId, auditRunId, tenantId)
    .first<Finding>()
  if (!finding) {
    return errorResponse('Finding not found', 404)
  }

  await env.DB
    .prepare('UPDATE findings SET status = ?, updated_at = unixepoch() WHERE finding_id = ?')
    .bind(newStatus, findingId)
    .run()

  await logTaskEvent(env.DB, tenantId, auditRunId, findingId, 'finding_status_changed', { from: finding.status, to: newStatus, reason: b.reason ?? null })
  return jsonResponse({ finding_id: findingId, status: newStatus })
}

async function verifyGitHubSignature(body: ArrayBuffer, signature: string, secret: string): Promise<boolean> {
  const expected = signature.replace(/^sha256=/, '')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, body)
  const actual = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return expected === actual
}

export async function handleGitHubWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const signature = request.headers.get('X-Hub-Signature-256') ?? ''
  if (!signature) {
    return errorResponse('Missing signature', 401)
  }

  const body = await request.arrayBuffer()
  const valid = await verifyGitHubSignature(body, signature, env.GITHUB_WEBHOOK_SECRET)
  if (!valid) {
    return errorResponse('Invalid signature', 401)
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return errorResponse('Invalid JSON payload', 400)
  }

  if (!payload || typeof payload !== 'object') {
    return errorResponse('Invalid payload', 400)
  }
  const p = payload as Record<string, unknown>

  if (p.ref === undefined) {
    return errorResponse('Missing ref', 400)
  }

  const repository = p.repository as Record<string, unknown> | undefined
  const htmlUrl = typeof repository?.html_url === 'string' ? repository.html_url : undefined
  if (!htmlUrl) {
    return errorResponse('Missing repository html_url', 400)
  }

  const ref = typeof p.ref === 'string' ? p.ref.replace(/^refs\/heads\//, '') : 'main'

  const row = await env.DB
    .prepare('SELECT id, tenant_id FROM audit_sessions WHERE repo_url = ? OR repo_url = ? LIMIT 1')
    .bind(htmlUrl, htmlUrl + '.git')
    .first<{ id: string; tenant_id: string }>()

  if (!row) {
    return errorResponse('No audit session for this repository', 404)
  }

  await env.CONTINUOUS_AUDIT_WORKFLOW.create({
    id: `continuous-audit-${row.id}-${Date.now()}`,
    params: { auditRunId: row.id, tenantId: row.tenant_id },
  })

  await env.DB
    .prepare('INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data) VALUES (?, ?, ?, ?, ?)')
    .bind(row.tenant_id, row.id, null, 'webhook_triggered', JSON.stringify({ provider: 'github', ref, repository_url: htmlUrl }))
    .run()

  return jsonResponse({ triggered: true, audit_run_id: row.id, ref })
}

// ── Provider OAuth helpers ────────────────────────────────────────────────

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

async function verifyGitLabSignature(body: ArrayBuffer, token: string, secret: string): Promise<boolean> {
  return token === secret
}

async function verifyBitbucketSignature(body: ArrayBuffer, signature: string, secret: string): Promise<boolean> {
  const expected = signature.replace(/^sha256=/, '')
  const key = await importHmacKey(secret)
  const mac = await crypto.subtle.sign('HMAC', key, body)
  const actual = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return expected === actual
}

async function exchangeOAuthCode(
  provider: 'github' | 'gitlab' | 'bitbucket',
  code: string,
  redirectUri: string,
  env: Env
): Promise<string | null> {
  let tokenUrl: string
  let body: Record<string, string>
  let headers: Record<string, string> = { Accept: 'application/json' }

  if (provider === 'github') {
    tokenUrl = 'https://github.com/login/oauth/access_token'
    body = {
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }
    headers = { Accept: 'application/json' }
  } else if (provider === 'gitlab') {
    tokenUrl = 'https://gitlab.com/oauth/token'
    body = {
      client_id: env.GITLAB_CLIENT_ID,
      client_secret: env.GITLAB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }
  } else {
    tokenUrl = 'https://bitbucket.org/site/oauth2/access_token'
    body = {
      client_id: env.BITBUCKET_CLIENT_ID,
      client_secret: env.BITBUCKET_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body).toString(),
  })

  if (!res.ok) return null
  const data = await res.json() as { access_token?: string }
  return data.access_token ?? null
}

export async function handleGitHubOAuthRedirect(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }
  const url = new URL(request.url)
  const tenantId = url.searchParams.get('tenant_id')
  if (!tenantId) {
    return errorResponse('Missing tenant_id', 400)
  }
  const state = await createOAuthState(tenantId, 'github', env.JWT_SECRET)
  const redirectUri = `${url.origin}/auth/github/callback`
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(env.GITHUB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo&state=${encodeURIComponent(state)}`
  return Response.redirect(authUrl, 302)
}

export async function handleGitHubOAuthCallback(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) {
    return errorResponse('Missing code or state', 400)
  }
  const verified = await verifyOAuthState(state, 'github', env.JWT_SECRET)
  if (!verified) {
    return errorResponse('Invalid state', 401)
  }

  const token = await exchangeOAuthCode('github', code, `${url.origin}/auth/github/callback`, env)
  if (!token) {
    return errorResponse('Failed to exchange code', 500)
  }

  const encrypted = await encryptToken(token, env.ENCRYPTION_KEY)
  if (!encrypted) {
    return errorResponse('Token encryption failed', 500)
  }

  await env.DB
    .prepare('UPDATE tenants SET github_token = ? WHERE id = ?')
    .bind(encrypted, verified.tenantId)
    .run()

  await env.DB
    .prepare('INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data) VALUES (?, ?, ?, ?, ?)')
    .bind(verified.tenantId, '', null, 'oauth_connected', JSON.stringify({ provider: 'github', tenant_id: verified.tenantId }))
    .run()

  return jsonResponse({ success: true, provider: 'github', tenant_id: verified.tenantId })
}

export async function handleGitLabOAuthRedirect(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }
  const url = new URL(request.url)
  const tenantId = url.searchParams.get('tenant_id')
  if (!tenantId) {
    return errorResponse('Missing tenant_id', 400)
  }
  const state = await createOAuthState(tenantId, 'gitlab', env.JWT_SECRET)
  const redirectUri = `${url.origin}/auth/gitlab/callback`
  const authUrl = `https://gitlab.com/oauth/authorize?client_id=${encodeURIComponent(env.GITLAB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read_api+read_repository&state=${encodeURIComponent(state)}`
  return Response.redirect(authUrl, 302)
}

export async function handleGitLabOAuthCallback(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) {
    return errorResponse('Missing code or state', 400)
  }
  const verified = await verifyOAuthState(state, 'gitlab', env.JWT_SECRET)
  if (!verified) {
    return errorResponse('Invalid state', 401)
  }

  const token = await exchangeOAuthCode('gitlab', code, `${url.origin}/auth/gitlab/callback`, env)
  if (!token) {
    return errorResponse('Failed to exchange code', 500)
  }

  const encrypted = await encryptToken(token, env.ENCRYPTION_KEY)
  if (!encrypted) {
    return errorResponse('Token encryption failed', 500)
  }

  await env.DB
    .prepare('UPDATE tenants SET gitlab_token = ? WHERE id = ?')
    .bind(encrypted, verified.tenantId)
    .run()

  return jsonResponse({ success: true, provider: 'gitlab', tenant_id: verified.tenantId })
}

export async function handleBitbucketOAuthRedirect(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }
  const url = new URL(request.url)
  const tenantId = url.searchParams.get('tenant_id')
  if (!tenantId) {
    return errorResponse('Missing tenant_id', 400)
  }
  const state = await createOAuthState(tenantId, 'bitbucket', env.JWT_SECRET)
  const redirectUri = `${url.origin}/auth/bitbucket/callback`
  const authUrl = `https://bitbucket.org/site/oauth2/authorize?client_id=${encodeURIComponent(env.BITBUCKET_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`
  return Response.redirect(authUrl, 302)
}

export async function handleBitbucketOAuthCallback(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405)
  }
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) {
    return errorResponse('Missing code or state', 400)
  }
  const verified = await verifyOAuthState(state, 'bitbucket', env.JWT_SECRET)
  if (!verified) {
    return errorResponse('Invalid state', 401)
  }

  const token = await exchangeOAuthCode('bitbucket', code, `${url.origin}/auth/bitbucket/callback`, env)
  if (!token) {
    return errorResponse('Failed to exchange code', 500)
  }

  const encrypted = await encryptToken(token, env.ENCRYPTION_KEY)
  if (!encrypted) {
    return errorResponse('Token encryption failed', 500)
  }

  await env.DB
    .prepare('UPDATE tenants SET bitbucket_token = ? WHERE id = ?')
    .bind(encrypted, verified.tenantId)
    .run()

  return jsonResponse({ success: true, provider: 'bitbucket', tenant_id: verified.tenantId })
}

export async function handleGitLabWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const signature = request.headers.get('X-Gitlab-Token') ?? ''
  if (!signature) {
    return errorResponse('Missing token', 401)
  }

  const body = await request.arrayBuffer()
  const valid = await verifyGitLabSignature(body, signature, env.GITLAB_WEBHOOK_SECRET)
  if (!valid) {
    return errorResponse('Invalid token', 401)
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return errorResponse('Invalid JSON payload', 400)
  }

  if (!payload || typeof payload !== 'object') {
    return errorResponse('Invalid payload', 400)
  }
  const p = payload as Record<string, unknown>

  const ref = typeof p.ref === 'string' ? p.ref.replace(/^refs\/heads\//, '') : 'main'
  const project = p.project as Record<string, unknown> | undefined
  const htmlUrl = typeof project?.web_url === 'string' ? project.web_url : undefined
  if (!htmlUrl) {
    return errorResponse('Missing project web_url', 400)
  }

  const row = await env.DB
    .prepare('SELECT id, tenant_id FROM audit_sessions WHERE repo_url = ? OR repo_url = ? LIMIT 1')
    .bind(htmlUrl, htmlUrl + '.git')
    .first<{ id: string; tenant_id: string }>()

  if (!row) {
    return errorResponse('No audit session for this repository', 404)
  }

  await env.CONTINUOUS_AUDIT_WORKFLOW.create({
    id: `continuous-audit-${row.id}-${Date.now()}`,
    params: { auditRunId: row.id, tenantId: row.tenant_id },
  })

  await env.DB
    .prepare('INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data) VALUES (?, ?, ?, ?, ?)')
    .bind(row.tenant_id, row.id, null, 'webhook_triggered', JSON.stringify({ provider: 'gitlab', ref, repository_url: htmlUrl }))
    .run()

  return jsonResponse({ triggered: true, audit_run_id: row.id, ref })
}

export async function handleBitbucketWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const signature = request.headers.get('X-Hub-Signature') ?? request.headers.get('X-Hub-Signature-256') ?? ''
  if (!signature) {
    return errorResponse('Missing signature', 401)
  }

  const body = await request.arrayBuffer()
  const valid = await verifyBitbucketSignature(body, signature, env.BITBUCKET_WEBHOOK_SECRET)
  if (!valid) {
    return errorResponse('Invalid signature', 401)
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return errorResponse('Invalid JSON payload', 400)
  }

  if (!payload || typeof payload !== 'object') {
    return errorResponse('Invalid payload', 400)
  }
  const p = payload as Record<string, unknown>

  const push = p.push as Record<string, unknown> | undefined
  const changes = Array.isArray(push?.changes) ? push.changes as Array<Record<string, unknown>> : []
  if (changes.length === 0) {
    return errorResponse('No push changes', 400)
  }

  const repository = p.repository as Record<string, unknown> | undefined
  const links = repository?.links as Record<string, unknown> | undefined
  const htmlLink = links?.html as { href?: string } | undefined
  const htmlUrl = typeof htmlLink?.href === 'string' ? htmlLink.href : undefined
  if (!htmlUrl) {
    return errorResponse('Missing repository html_url', 400)
  }

  const change = changes[0]
  const newRef = change.new as { name?: string } | undefined
  const ref = typeof newRef?.name === 'string' ? newRef.name : 'main'

  const row = await env.DB
    .prepare('SELECT id, tenant_id FROM audit_sessions WHERE repo_url = ? OR repo_url = ? LIMIT 1')
    .bind(htmlUrl, htmlUrl + '.git')
    .first<{ id: string; tenant_id: string }>()

  if (!row) {
    return errorResponse('No audit session for this repository', 404)
  }

  await env.CONTINUOUS_AUDIT_WORKFLOW.create({
    id: `continuous-audit-${row.id}-${Date.now()}`,
    params: { auditRunId: row.id, tenantId: row.tenant_id },
  })

  await env.DB
    .prepare('INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data) VALUES (?, ?, ?, ?, ?)')
    .bind(row.tenant_id, row.id, null, 'webhook_triggered', JSON.stringify({ provider: 'bitbucket', ref, repository_url: htmlUrl }))
    .run()

  return jsonResponse({ triggered: true, audit_run_id: row.id, ref })
}
