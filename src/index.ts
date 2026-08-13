import type { Env, QueuedWriteRequest } from './types/index'
import { AgentDurableObject } from './agents/base-agent'
import { CoordinatorDurableObject } from './workers/coordinator'
import { DashboardDurableObject } from './dashboard/dashboard-do'
import { RateLimiterDurableObject } from './workers/rate-limiter'
import { SharedMemoryDurableObject } from './workers/shared-memory'
import { PriorityResolverWorkflow } from './workflows/priority-resolver-workflow'
import { SalvationWorkflow } from './workflows/salvation-workflow'
import { ContinuousAuditWorkflow } from './workflows/continuous-audit-workflow'
import {
  SecurityAgentDurableObject,
  ApiAgentDurableObject,
  FrontendAgentDurableObject,
  DatabaseAgentDurableObject,
  ArchitectureAgentDurableObject,
  TestingAgentDurableObject,
  PerformanceAgentDurableObject,
  DevopsAgentDurableObject,
  DocumentationAgentDurableObject,
  VisualQaAgentDurableObject,
  BackendAgentDurableObject,
  DependencyAgentDurableObject,
  A11yAgentDurableObject,
  I18nAgentDurableObject,
  LoggingAgentDurableObject,
  CodeQualityAgentDurableObject,
  ErrorHandlingAgentDurableObject,
  ConfigurationAgentDurableObject,
  RefactoringAgentDurableObject,
} from './workers/agents'
import { authenticate, ensureTenant } from './lib/auth'
import { checkRateLimit, rateLimitResponse } from './lib/rate-limit'
import {
  handleHome,
  handleAuditNew,
  handleDashboardGet,
  handleDashboardWS,
  handleIngest,
  handleAuditStart,
  handleTenantConfigGet,
  handleTenantConfigPatch,
  handleTenantScoreGet,
  errorResponse,
} from './lib/router'

export {
  AgentDurableObject,
  SecurityAgentDurableObject,
  ApiAgentDurableObject,
  FrontendAgentDurableObject,
  DatabaseAgentDurableObject,
  ArchitectureAgentDurableObject,
  TestingAgentDurableObject,
  PerformanceAgentDurableObject,
  DevopsAgentDurableObject,
  DocumentationAgentDurableObject,
  VisualQaAgentDurableObject,
  BackendAgentDurableObject,
  DependencyAgentDurableObject,
  A11yAgentDurableObject,
  I18nAgentDurableObject,
  LoggingAgentDurableObject,
  CodeQualityAgentDurableObject,
  ErrorHandlingAgentDurableObject,
  ConfigurationAgentDurableObject,
  RefactoringAgentDurableObject,
  SharedMemoryDurableObject,
  CoordinatorDurableObject,
  DashboardDurableObject,
  RateLimiterDurableObject,
  PriorityResolverWorkflow,
  SalvationWorkflow,
  ContinuousAuditWorkflow,
}

const MAX_QUEUE_BODY_BYTES = 100 * 1024

function isWrite(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD'
}

function unauthorizedResponse(message: string): Response {
  return errorResponse(message, 401, 'UNAUTHORIZED')
}

async function readBodyForQueue(request: Request): Promise<{ body: string; contentType: string; size: number } | null> {
  try {
    const contentType = request.headers.get('Content-Type') ?? ''
    const buffer = await request.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    if (bytes.length > MAX_QUEUE_BODY_BYTES) {
      return null
    }
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return { body: btoa(binary), contentType, size: bytes.length }
  } catch {
    return null
  }
}

function buildRequestFromQueue(message: QueuedWriteRequest): Request {
  const binary = atob(message.body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Request('https://localhost' + message.pathname, {
    method: message.method,
    body: bytes.buffer,
    headers: { 'Content-Type': message.contentType },
  })
}

async function dispatchRoute(request: Request, env: Env, tenantId: string): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/ingest' && request.method === 'POST') {
    return handleIngest(request, env, tenantId)
  }

  if (url.pathname === '/audit/start' && request.method === 'POST') {
    return handleAuditStart(request, env, tenantId)
  }

  if (url.pathname === '/dashboard' && request.method === 'GET') {
    return handleDashboardGet()
  }

  if (url.pathname === '/dashboard/ws') {
    const auditRunId = url.searchParams.get('audit_run_id')
    if (!auditRunId) {
      return new Response('Missing audit_run_id', { status: 400 })
    }
    return handleDashboardWS(request, env, tenantId, auditRunId)
  }

  const configMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/config$/)
  if (configMatch) {
    if (tenantId !== configMatch[1]) {
      return errorResponse('Cannot access another tenant config', 403, 'FORBIDDEN')
    }
    if (request.method === 'GET') {
      return handleTenantConfigGet(env, tenantId)
    }
    if (request.method === 'PATCH') {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return errorResponse('Invalid JSON', 400)
      }
      return handleTenantConfigPatch(env, tenantId, body)
    }
    return new Response('Method not allowed', { status: 405 })
  }

  const scoreMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/score$/)
  if (scoreMatch && request.method === 'GET') {
    if (tenantId !== scoreMatch[1]) {
      return errorResponse('Cannot access another tenant score', 403, 'FORBIDDEN')
    }
    return handleTenantScoreGet(env, tenantId)
  }

  return new Response('AuditEngine v1.0', { status: 200 })
}

async function handleProtectedRoute(
  request: Request,
  env: Env,
  routeTenantId: string | null
): Promise<Response> {
  let tenantId: string
  try {
    const auth = await authenticate(request, env)
    tenantId = auth.tenantId
    await ensureTenant(tenantId, env.DB)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unauthorized'
    return unauthorizedResponse(msg)
  }

  if (routeTenantId && tenantId !== routeTenantId) {
    return errorResponse('Forbidden', 403, 'FORBIDDEN')
  }

  const isPriority = request.headers.get('X-Priority') === 'salvation'

  if (!isPriority) {
    const allowed = await checkRateLimit(request, tenantId, env.RATE_LIMIT_DO)
    if (!allowed) {
      if (isWrite(request.method)) {
        return await enqueueWrite(request, env, tenantId)
      }
      return rateLimitResponse()
    }
  }

  return dispatchRoute(request, env, tenantId)
}

async function enqueueWrite(request: Request, env: Env, tenantId: string): Promise<Response> {
  const payload = await readBodyForQueue(request)
  if (!payload) {
    return rateLimitResponse()
  }

  const message: QueuedWriteRequest = {
    tenantId,
    method: request.method,
    pathname: new URL(request.url).pathname + new URL(request.url).search,
    body: payload.body,
    contentType: payload.contentType,
    priority: request.headers.get('X-Priority') === 'salvation',
    receivedAt: Date.now(),
  }

  try {
    const result = await env.WRITE_QUEUE.send(message)
    return new Response(JSON.stringify({
      queued: true,
      queue_size: result.metadata.metrics.backlogCount,
      retry_after: 60,
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return rateLimitResponse()
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Public routes
    if (url.pathname === '/' && request.method === 'GET') {
      return handleHome()
    }
    if (url.pathname === '/audit/new' && request.method === 'GET') {
      return handleAuditNew()
    }

    // Protected routes
    if (url.pathname === '/ingest' && request.method === 'POST') {
      return handleProtectedRoute(request, env, null)
    }
    if (url.pathname === '/dashboard' && request.method === 'GET') {
      return handleProtectedRoute(request, env, null)
    }
    if (url.pathname === '/dashboard/ws') {
      return handleProtectedRoute(request, env, null)
    }
    if (url.pathname === '/audit/start' && request.method === 'POST') {
      return handleProtectedRoute(request, env, null)
    }

    const configMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/config$/)
    if (configMatch) {
      return handleProtectedRoute(request, env, configMatch[1])
    }

    const scoreMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/score$/)
    if (scoreMatch && request.method === 'GET') {
      return handleProtectedRoute(request, env, scoreMatch[1])
    }

    return new Response('AuditEngine v1.0', { status: 200 })
  },

  async queue(batch: MessageBatch<QueuedWriteRequest>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const request = buildRequestFromQueue(message.body)
      try {
        const response = await dispatchRoute(request, env, message.body.tenantId)
        if (response.status >= 500) {
          message.retry()
        } else {
          message.ack()
        }
      } catch {
        message.retry()
      }
    }
  },
}
