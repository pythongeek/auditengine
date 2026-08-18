import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import worker from '../src/index'
import type { Env } from '../src/types/index'
import { makeMockEnvStrings } from './helpers'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeMockD1(auditSession: { id: string; tenant_id: string; repo_url: string; repo_branch: string } | null) {
  const runs: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: () => {
          runs.push({ sql, params })
          return Promise.resolve({ changes: 1, meta: {} })
        },
        first: () => {
          runs.push({ sql, params })
          const lower = sql.toLowerCase()
          if (lower.includes('audit_sessions') && auditSession) {
            return Promise.resolve(auditSession)
          }
          return Promise.resolve(null)
        },
        all: () => {
          runs.push({ sql, params })
          return Promise.resolve({ results: [] })
        },
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
  return { db, runs }
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  const auditSession = { id: 'run-001', tenant_id: 'tenant-1', repo_url: 'https://github.com/acme/widgets', repo_branch: 'main' }
  const workflowCalls: unknown[] = []
  return {
    DB: makeMockD1(auditSession).db,
    R2: {} as R2Bucket,
    AGENT_DO: {} as DurableObjectNamespace,
    SECURITY_AGENT_DO: {} as DurableObjectNamespace,
    API_AGENT_DO: {} as DurableObjectNamespace,
    FRONTEND_AGENT_DO: {} as DurableObjectNamespace,
    DATABASE_AGENT_DO: {} as DurableObjectNamespace,
    ARCHITECTURE_AGENT_DO: {} as DurableObjectNamespace,
    TESTING_AGENT_DO: {} as DurableObjectNamespace,
    PERFORMANCE_AGENT_DO: {} as DurableObjectNamespace,
    DEVOPS_AGENT_DO: {} as DurableObjectNamespace,
    DOCUMENTATION_AGENT_DO: {} as DurableObjectNamespace,
    VISUAL_QA_AGENT_DO: {} as DurableObjectNamespace,
    BACKEND_AGENT_DO: {} as DurableObjectNamespace,
    DEPENDENCY_AGENT_DO: {} as DurableObjectNamespace,
    A11Y_AGENT_DO: {} as DurableObjectNamespace,
    I18N_AGENT_DO: {} as DurableObjectNamespace,
    LOGGING_AGENT_DO: {} as DurableObjectNamespace,
    CODE_QUALITY_AGENT_DO: {} as DurableObjectNamespace,
    ERROR_HANDLING_AGENT_DO: {} as DurableObjectNamespace,
    CONFIGURATION_AGENT_DO: {} as DurableObjectNamespace,
    REFACTORING_AGENT_DO: {} as DurableObjectNamespace,
    SHARED_MEMORY_DO: {} as DurableObjectNamespace,
    COORDINATOR_DO: {} as DurableObjectNamespace,
    DASHBOARD_DO: {} as DurableObjectNamespace,
    RATE_LIMIT_DO: {} as DurableObjectNamespace,
    PRIORITY_RESOLVER_WORKFLOW: { create: async (params: unknown) => { workflowCalls.push(params); return {} as WorkflowInstance } } as unknown as Workflow,
    SALVATION_WORKFLOW: { create: async () => ({}) as WorkflowInstance } as unknown as Workflow,
    CONTINUOUS_AUDIT_WORKFLOW: { create: async (params: unknown) => { workflowCalls.push(params); return {} as WorkflowInstance } } as unknown as Workflow,
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    ...makeMockEnvStrings({ GITHUB_WEBHOOK_SECRET: 'secret' }),
    ...overrides,
  } as Env
}

async function githubWebhookPayload(secret: string, payload: unknown): Promise<{ body: ArrayBuffer; signature: string }> {
  const encoder = new TextEncoder()
  const body = encoder.encode(JSON.stringify(payload))
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, body)
  const signature = 'sha256=' + Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return { body: body.buffer as ArrayBuffer, signature }
}

async function gitlabWebhookPayload(secret: string, payload: unknown): Promise<{ body: ArrayBuffer; token: string }> {
  const encoder = new TextEncoder()
  const body = encoder.encode(JSON.stringify(payload)).buffer as ArrayBuffer
  return { body, token: secret }
}

async function bitbucketWebhookPayload(secret: string, payload: unknown): Promise<{ body: ArrayBuffer; signature: string }> {
  const encoder = new TextEncoder()
  const body = encoder.encode(JSON.stringify(payload))
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, body)
  const signature = 'sha256=' + Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return { body: body.buffer as ArrayBuffer, signature }
}

describe('webhooks', () => {
  it('GitHub push webhook verifies signature and triggers continuous audit workflow', async () => {
    const env = makeEnv()
    const payload = {
      ref: 'refs/heads/main',
      repository: { html_url: 'https://github.com/acme/widgets' },
    }
    const { body, signature } = await githubWebhookPayload('secret', payload)

    const request = new Request('https://localhost/webhooks/github', {
      method: 'POST',
      body,
      headers: { 'X-Hub-Signature-256': signature, 'Content-Type': 'application/json' },
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    const result = await response.json() as { triggered: boolean; audit_run_id: string }

    expect(response.status).toBe(200)
    expect(result.triggered).toBe(true)
    expect(result.audit_run_id).toBe('run-001')
  })

  it('GitHub webhook rejects invalid signature', async () => {
    const env = makeEnv()
    const payload = { ref: 'refs/heads/main', repository: { html_url: 'https://github.com/acme/widgets' } }
    const encoder = new TextEncoder()
    const body = encoder.encode(JSON.stringify(payload)).buffer as ArrayBuffer

    const request = new Request('https://localhost/webhooks/github', {
      method: 'POST',
      body,
      headers: { 'X-Hub-Signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000', 'Content-Type': 'application/json' },
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(401)
  })

  it('GitHub webhook returns 404 when no audit session matches repo', async () => {
    const env = makeEnv({ DB: makeMockD1(null).db })
    const payload = { ref: 'refs/heads/main', repository: { html_url: 'https://github.com/acme/other' } }
    const { body, signature } = await githubWebhookPayload('secret', payload)

    const request = new Request('https://localhost/webhooks/github', {
      method: 'POST',
      body,
      headers: { 'X-Hub-Signature-256': signature, 'Content-Type': 'application/json' },
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(404)
  })

  it('GitLab webhook verifies token and triggers continuous audit workflow', async () => {
    const auditSession = { id: 'run-002', tenant_id: 'tenant-1', repo_url: 'https://gitlab.com/acme/widgets', repo_branch: 'main' }
    const env = makeEnv({ DB: makeMockD1(auditSession).db, GITLAB_WEBHOOK_SECRET: 'secret' })
    const payload = { ref: 'refs/heads/main', project: { web_url: 'https://gitlab.com/acme/widgets' } }
    const { body, token } = await gitlabWebhookPayload('secret', payload)

    const request = new Request('https://localhost/webhooks/gitlab', {
      method: 'POST',
      body,
      headers: { 'X-Gitlab-Token': token, 'Content-Type': 'application/json' },
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    const result = await response.json() as { triggered: boolean; audit_run_id: string }

    expect(response.status).toBe(200)
    expect(result.triggered).toBe(true)
    expect(result.audit_run_id).toBe('run-002')
  })

  it('GitLab webhook rejects missing token', async () => {
    const env = makeEnv({ GITLAB_WEBHOOK_SECRET: 'secret' })
    const request = new Request('https://localhost/webhooks/gitlab', { method: 'POST', body: '{}' })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(401)
  })

  it('Bitbucket webhook verifies signature and triggers continuous audit workflow', async () => {
    const auditSession = { id: 'run-003', tenant_id: 'tenant-1', repo_url: 'https://bitbucket.org/acme/widgets', repo_branch: 'main' }
    const env = makeEnv({ DB: makeMockD1(auditSession).db, BITBUCKET_WEBHOOK_SECRET: 'secret' })
    const payload = {
      push: { changes: [{ new: { name: 'main' } }] },
      repository: { links: { html: { href: 'https://bitbucket.org/acme/widgets' } } },
    }
    const { body, signature } = await bitbucketWebhookPayload('secret', payload)

    const request = new Request('https://localhost/webhooks/bitbucket', {
      method: 'POST',
      body,
      headers: { 'X-Hub-Signature-256': signature, 'Content-Type': 'application/json' },
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    const result = await response.json() as { triggered: boolean; audit_run_id: string }

    expect(response.status).toBe(200)
    expect(result.triggered).toBe(true)
    expect(result.audit_run_id).toBe('run-003')
  })

  it('Bitbucket webhook rejects invalid signature', async () => {
    const env = makeEnv({ BITBUCKET_WEBHOOK_SECRET: 'secret' })
    const encoder = new TextEncoder()
    const body = encoder.encode(JSON.stringify({})).buffer as ArrayBuffer

    const request = new Request('https://localhost/webhooks/bitbucket', {
      method: 'POST',
      body,
      headers: { 'X-Hub-Signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000', 'Content-Type': 'application/json' },
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(401)
  })
})
