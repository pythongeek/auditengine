import type { Env, QueuedWriteRequest } from './types/index'
import { AgentDurableObject } from './agents/base-agent'
import { CoordinatorDurableObject } from './workers/coordinator'
import { DashboardDurableObject } from './dashboard/dashboard-do'
import { RateLimiterDurableObject } from './workers/rate-limiter'
import { SharedMemoryDurableObject } from './workers/shared-memory'
import { PriorityResolverWorkflow } from './workflows/priority-resolver-workflow'
import { SalvationWorkflow } from './workflows/salvation-workflow'
import { ContinuousAuditWorkflow } from './workflows/continuous-audit-workflow'
import { AuditStartWorkflow } from './workflows/audit-start-workflow'
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
import { authenticate, ensureTenant, isAdmin } from './lib/auth'
import { checkRateLimit, rateLimitResponse } from './lib/rate-limit'
import {
  handleHome,
  handleAuditNew,
  handleRepos,
  handleDashboardGet,
  handleDashboardWS,
  handleIngest,
  handleAuditStart,
  handleTenantConfigGet,
  handleTenantConfigPatch,
  handleTenantScoreGet,
  handleTaskList,
  handleTaskPatch,
  handleTaskVerify,
  handleFindingList,
  handleFindingPatch,
  handleGitHubWebhook,
  handleGitLabWebhook,
  handleBitbucketWebhook,
  handleGitHubOAuthRedirect,
  handleGitHubOAuthCallback,
  handleGitLabOAuthRedirect,
  handleGitLabOAuthCallback,
  handleBitbucketOAuthRedirect,
  handleBitbucketOAuthCallback,
  handleGroupGet,
  handleDependencyCreate,
  handleTenantList,
  handleTenantCreate,
  handleTenantGet,
  handleGitBranch,
  handleGitCommit,
  handleGitPullRequest,
  handleAuditList,
  handleAuditDetail,
  handleLogin,
  handleTenantSelector,
  handleAuditListPage,
  handleTaskBoard,
  handleFindingDetail,
  handleOnboarding,
  handleSettings,
  handleSettingsKeysGet,
  handleSettingsKeysPost,
  handleOpenApiGet,
  handleRepoFileList,
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
  AuditStartWorkflow,
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

async function dispatchRoute(request: Request, env: Env, tenantId: string, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/api/v1/repo/files' && request.method === 'POST') {
    return handleRepoFileList(env, request, tenantId)
  }

  if (url.pathname === '/ingest' && request.method === 'POST') {
    return handleIngest(request, env, tenantId)
  }

  if (url.pathname === '/audit/start' && request.method === 'POST') {
    return handleAuditStart(request, env, tenantId, ctx)
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

  if (url.pathname === '/api/v1/tenants' && request.method === 'GET') {
    return handleTenantList(env)
  }

  if (url.pathname === '/api/v1/tenant' && request.method === 'GET') {
    return handleTenantGet(env, tenantId)
  }

  const gitBranchMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/git\/branch$/)
  if (gitBranchMatch && request.method === 'POST') {
    if (tenantId !== gitBranchMatch[1]) {
      return errorResponse('Forbidden', 403, 'FORBIDDEN')
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid JSON', 400)
    }
    return handleGitBranch(env, tenantId, body)
  }

  const gitCommitMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/git\/commit$/)
  if (gitCommitMatch && request.method === 'POST') {
    if (tenantId !== gitCommitMatch[1]) {
      return errorResponse('Forbidden', 403, 'FORBIDDEN')
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid JSON', 400)
    }
    return handleGitCommit(env, tenantId, body)
  }

  const gitPrMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/git\/pull-request$/)
  if (gitPrMatch && request.method === 'POST') {
    if (tenantId !== gitPrMatch[1]) {
      return errorResponse('Forbidden', 403, 'FORBIDDEN')
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid JSON', 400)
    }
    return handleGitPullRequest(env, tenantId, body)
  }

  const auditsMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits$/)
  if (auditsMatch && request.method === 'GET') {
    if (tenantId !== auditsMatch[1]) {
      return errorResponse('Cannot access another tenant audits', 403, 'FORBIDDEN')
    }
    return handleAuditList(env, tenantId)
  }

  const auditDetailMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits\/([^/]+)$/)
  if (auditDetailMatch && request.method === 'GET') {
    if (tenantId !== auditDetailMatch[1]) {
      return errorResponse('Cannot access another tenant audit', 403, 'FORBIDDEN')
    }
    return handleAuditDetail(env, tenantId, auditDetailMatch[2])
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

  const groupMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/groups\/([^/]+)$/)
  if (groupMatch && request.method === 'GET') {
    if (tenantId !== groupMatch[1]) return errorResponse('Cannot access another tenant group', 403, 'FORBIDDEN')
    return handleGroupGet(env, tenantId, groupMatch[2])
  }

  const dependencyMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/dependencies$/)
  if (dependencyMatch && request.method === 'POST') {
    if (tenantId !== dependencyMatch[1]) return errorResponse('Cannot access another tenant dependencies', 403, 'FORBIDDEN')
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid JSON', 400)
    }
    return handleDependencyCreate(env, tenantId, body)
  }

  const tasksMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits\/([^/]+)\/tasks$/)
  if (tasksMatch && request.method === 'GET') {
    if (tenantId !== tasksMatch[1]) return errorResponse('Cannot access another tenant audit', 403, 'FORBIDDEN')
    return handleTaskList(env, tenantId, tasksMatch[2], url.searchParams.get('status') ?? undefined)
  }

  const taskPatchMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits\/([^/]+)\/tasks\/([^/]+)$/)
  if (taskPatchMatch && request.method === 'PATCH') {
    if (tenantId !== taskPatchMatch[1]) return errorResponse('Cannot access another tenant audit', 403, 'FORBIDDEN')
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid JSON', 400)
    }
    return handleTaskPatch(env, tenantId, taskPatchMatch[2], taskPatchMatch[3], body)
  }

  const taskVerifyMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits\/([^/]+)\/tasks\/([^/]+)\/verify$/)
  if (taskVerifyMatch && request.method === 'POST') {
    if (tenantId !== taskVerifyMatch[1]) return errorResponse('Cannot access another tenant audit', 403, 'FORBIDDEN')
    let body: unknown
    try {
      body = await request.json()
    } catch {
      body = {}
    }
    return handleTaskVerify(env, tenantId, taskVerifyMatch[2], taskVerifyMatch[3], body)
  }

  const findingsMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits\/([^/]+)\/findings$/)
  if (findingsMatch && request.method === 'GET') {
    if (tenantId !== findingsMatch[1]) return errorResponse('Cannot access another tenant audit', 403, 'FORBIDDEN')
    return handleFindingList(env, tenantId, findingsMatch[2], url.searchParams.get('severity') ?? undefined, url.searchParams.get('status') ?? undefined)
  }

  const findingPatchMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits\/([^/]+)\/findings\/([^/]+)$/)
  if (findingPatchMatch && request.method === 'PATCH') {
    if (tenantId !== findingPatchMatch[1]) return errorResponse('Cannot access another tenant audit', 403, 'FORBIDDEN')
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid JSON', 400)
    }
    return handleFindingPatch(env, tenantId, findingPatchMatch[2], findingPatchMatch[3], body)
  }

  return new Response('AuditEngine v1.0', { status: 200 })
}

async function handleProtectedRoute(
  request: Request,
  env: Env,
  routeTenantId: string | null,
  options: { forceQueue?: boolean; ctx?: ExecutionContext } = {}
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

  if (options.forceQueue && isWrite(request.method)) {
    return await enqueueWrite(request, env, tenantId)
  }

  if (!isPriority) {
    const allowed = await checkRateLimit(request, tenantId, env.RATE_LIMIT_DO)
    if (!allowed) {
      if (isWrite(request.method)) {
        return await enqueueWrite(request, env, tenantId)
      }
      return rateLimitResponse()
    }
  }

  return dispatchRoute(request, env, tenantId, options.ctx)
}

async function logQueueError(env: Env, message: QueuedWriteRequest, error: string): Promise<void> {
  try {
    await env.DB
      .prepare('INSERT INTO agent_errors (tenant_id, audit_run_id, agent_id, error_type, error_msg, file_path) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(message.tenantId, '', 'queue-consumer', 'queue_error', error, message.pathname)
      .run()
  } catch {
    // ignore
  }
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
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Public routes
    if (url.pathname === '/' && request.method === 'GET') {
      return handleHome()
    }
    if (url.pathname === '/audit/new' && request.method === 'GET') {
      return handleAuditNew()
    }
    if (url.pathname === '/repos' && request.method === 'GET') {
      return handleRepos()
    }
    if (url.pathname === '/login' && request.method === 'GET') {
      return handleLogin()
    }
    if (url.pathname === '/tenants' && request.method === 'GET') {
      return handleTenantSelector()
    }
    if (url.pathname === '/audits' && request.method === 'GET') {
      return handleAuditListPage()
    }
    if (url.pathname === '/task-board' && request.method === 'GET') {
      return handleTaskBoard()
    }
    if (url.pathname === '/finding' && request.method === 'GET') {
      return handleFindingDetail()
    }
    if (url.pathname === '/onboarding' && request.method === 'GET') {
      return handleOnboarding()
    }
    if (url.pathname === '/settings' && request.method === 'GET') {
      return handleSettings()
    }
    if (url.pathname === '/dashboard' && request.method === 'GET') {
      return handleDashboardGet()
    }
    if (url.pathname === '/auth/github' && request.method === 'GET') {
      return handleGitHubOAuthRedirect(request, env)
    }
    if (url.pathname === '/auth/github/callback' && request.method === 'GET') {
      return handleGitHubOAuthCallback(request, env)
    }
    if (url.pathname === '/auth/gitlab' && request.method === 'GET') {
      return handleGitLabOAuthRedirect(request, env)
    }
    if (url.pathname === '/auth/gitlab/callback' && request.method === 'GET') {
      return handleGitLabOAuthCallback(request, env)
    }
    if (url.pathname === '/auth/bitbucket' && request.method === 'GET') {
      return handleBitbucketOAuthRedirect(request, env)
    }
    if (url.pathname === '/auth/bitbucket/callback' && request.method === 'GET') {
      return handleBitbucketOAuthCallback(request, env)
    }
    if (url.pathname === '/api/v1/openapi.json' && request.method === 'GET') {
      return handleOpenApiGet()
    }
    if (url.pathname === '/webhooks/github' && request.method === 'POST') {
      return handleGitHubWebhook(request, env)
    }
    if (url.pathname === '/webhooks/gitlab' && request.method === 'POST') {
      return handleGitLabWebhook(request, env)
    }
    if (url.pathname === '/webhooks/bitbucket' && request.method === 'POST') {
      return handleBitbucketWebhook(request, env)
    }

    // Admin-only tenant list
    if (url.pathname === '/api/v1/tenants' && request.method === 'GET') {
      const admin = await isAdmin(request, env)
      if (!admin) {
        return unauthorizedResponse('Admin credentials required')
      }
      return handleTenantList(env)
    }

    // Admin-only tenant creation
    if (url.pathname === '/api/v1/tenants' && request.method === 'POST') {
      const admin = await isAdmin(request, env)
      if (!admin) {
        return unauthorizedResponse('Admin credentials required')
      }
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return errorResponse('Invalid JSON', 400)
      }
      return handleTenantCreate(env, body)
    }

    // Admin-only provider API key settings
    if (url.pathname === '/api/v1/settings/keys' && request.method === 'GET') {
      const admin = await isAdmin(request, env)
      if (!admin) {
        return unauthorizedResponse('Admin credentials required')
      }
      return handleSettingsKeysGet(env, request)
    }

    if (url.pathname === '/api/v1/settings/keys' && request.method === 'POST') {
      const admin = await isAdmin(request, env)
      if (!admin) {
        return unauthorizedResponse('Admin credentials required')
      }
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return errorResponse('Invalid JSON', 400)
      }
      return handleSettingsKeysPost(env, request, body)
    }

    const auditsMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits$/)
    if (auditsMatch && request.method === 'GET') {
      return handleProtectedRoute(request, env, auditsMatch[1])
    }

    const auditDetailMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits\/([^/]+)$/)
    if (auditDetailMatch && request.method === 'GET') {
      return handleProtectedRoute(request, env, auditDetailMatch[1])
    }

    // Protected routes
    if (url.pathname === '/api/v1/tenant' && request.method === 'GET') {
      return handleProtectedRoute(request, env, null)
    }
    const gitBranchMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/git\/branch$/)
    if (gitBranchMatch && request.method === 'POST') {
      return handleProtectedRoute(request, env, gitBranchMatch[1])
    }
    const gitCommitMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/git\/commit$/)
    if (gitCommitMatch && request.method === 'POST') {
      return handleProtectedRoute(request, env, gitCommitMatch[1])
    }
    const gitPrMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/git\/pull-request$/)
    if (gitPrMatch && request.method === 'POST') {
      return handleProtectedRoute(request, env, gitPrMatch[1])
    }
    if (url.pathname === '/ingest' && request.method === 'POST') {
      return handleProtectedRoute(request, env, null)
    }
    if (url.pathname === '/dashboard/ws') {
      return handleProtectedRoute(request, env, null)
    }
    if (url.pathname === '/audit/start' && request.method === 'POST') {
      return handleProtectedRoute(request, env, null, { ctx })
    }

    if (url.pathname === '/api/v1/repo/files' && request.method === 'POST') {
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

    const groupMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/groups\/([^/]+)$/)
    if (groupMatch && request.method === 'GET') {
      return handleProtectedRoute(request, env, groupMatch[1])
    }

    const dependencyMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/dependencies$/)
    if (dependencyMatch && request.method === 'POST') {
      return handleProtectedRoute(request, env, dependencyMatch[1])
    }

    const tasksMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits\/([^/]+)\/tasks$/)
    if (tasksMatch && request.method === 'GET') {
      return handleProtectedRoute(request, env, tasksMatch[1])
    }

    const taskPatchMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits\/([^/]+)\/tasks\/([^/]+)$/)
    if (taskPatchMatch && request.method === 'PATCH') {
      return handleProtectedRoute(request, env, taskPatchMatch[1])
    }

    const taskVerifyMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits\/([^/]+)\/tasks\/([^/]+)\/verify$/)
    if (taskVerifyMatch && request.method === 'POST') {
      return handleProtectedRoute(request, env, taskVerifyMatch[1])
    }

    const findingsMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits\/([^/]+)\/findings$/)
    if (findingsMatch && request.method === 'GET') {
      return handleProtectedRoute(request, env, findingsMatch[1])
    }

    const findingPatchMatch = url.pathname.match(/^\/api\/v1\/tenants\/([^/]+)\/audits\/([^/]+)\/findings\/([^/]+)$/)
    if (findingPatchMatch && request.method === 'PATCH') {
      return handleProtectedRoute(request, env, findingPatchMatch[1])
    }

    return new Response('AuditEngine v1.0', { status: 200 })
  },

  async queue(batch: MessageBatch<QueuedWriteRequest>, env: Env): Promise<void> {
    console.log(`queue handler invoked with ${batch.messages.length} messages`)
    for (const message of batch.messages) {
      const request = buildRequestFromQueue(message.body)
      try {
        await logQueueError(env, message.body, `processing ${message.body.pathname}`)
        const response = await dispatchRoute(request, env, message.body.tenantId)
        if (response.status >= 500) {
          await logQueueError(env, message.body, `HTTP ${response.status}`)
          message.retry()
        } else {
          message.ack()
        }
      } catch (err) {
        await logQueueError(env, message.body, err instanceof Error ? err.message : 'Unknown error')
        message.retry()
      }
    }
  },
}
