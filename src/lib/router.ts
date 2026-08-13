import type { Env, AgentType } from '../types/index'
import ingestionWorker from '../workers/ingestion'
import { DASHBOARD_HTML } from '../dashboard/dashboard-html'
import { HOME_HTML } from '../dashboard/home-html'
import { AUDIT_NEW_HTML } from '../dashboard/audit-new-html'
import { listAgentConfigs, setAgentConfig, ALL_AGENT_TYPES } from './agent-config'

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

export function handleHome(): Response {
  return htmlResponse(HOME_HTML)
}

export function handleAuditNew(): Response {
  return htmlResponse(AUDIT_NEW_HTML)
}

export function handleDashboardGet(): Response {
  return htmlResponse(DASHBOARD_HTML)
}

export async function handleDashboardWS(request: Request, env: Env, tenantId: string, auditRunId: string): Promise<Response> {
  const id = env.DASHBOARD_DO.idFromName('dashboard-' + auditRunId)
  const stub = env.DASHBOARD_DO.get(id)
  return stub.fetch(withTenantHeader(request, tenantId))
}

export async function handleIngest(request: Request, env: Env, tenantId: string): Promise<Response> {
  return ingestionWorker.fetch(withTenantHeader(request, tenantId), env)
}

export async function handleAuditStart(request: Request, env: Env, tenantId: string): Promise<Response> {
  let bodyText: string
  try {
    bodyText = await request.text()
  } catch {
    return errorResponse('Invalid body', 400)
  }

  let body: {
    audit_run_id?: string
    files?: Array<{ path: string; content: string }>
    repo_url?: string
    branch?: string
    commit_sha?: string
  }
  try {
    body = JSON.parse(bodyText) as typeof body
  } catch {
    return errorResponse('Invalid JSON', 400)
  }

  if (!body.audit_run_id || !Array.isArray(body.files)) {
    return errorResponse('Missing audit_run_id or files', 400)
  }

  // Run ingestion first
  const ingestRequest = new Request('https://localhost/ingest', {
    method: 'POST',
    body: JSON.stringify({
      audit_run_id: body.audit_run_id,
      files: body.files,
      repo_url: body.repo_url,
      branch: body.branch,
      commit_sha: body.commit_sha,
    }),
    headers: { 'Content-Type': 'application/json' },
  })
  const ingestResponse = await handleIngest(ingestRequest, env, tenantId)
  if (!ingestResponse.ok) {
    return errorResponse('Ingestion failed', 500)
  }

  // Boot coordinator DO
  const coordinatorId = env.COORDINATOR_DO.idFromName('coordinator-' + body.audit_run_id)
  const coordinatorStub = env.COORDINATOR_DO.get(coordinatorId)
  await coordinatorStub.fetch(new Request('https://coordinator/start', {
    method: 'POST',
    body: JSON.stringify({ audit_run_id: body.audit_run_id, tenant_id: tenantId }),
    headers: { 'Content-Type': 'application/json' },
  }))

  return jsonResponse({ audit_run_id: body.audit_run_id, status: 'started' })
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

export async function handleTenantScoreGet(env: Env, tenantId: string): Promise<Response> {
  const rows = await env.DB
    .prepare('SELECT id, readiness_score, status FROM audit_sessions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 10')
    .bind(tenantId)
    .all<{ id: string; readiness_score: number; status: string }>()

  return jsonResponse({ tenant_id: tenantId, sessions: rows.results ?? [] })
}
