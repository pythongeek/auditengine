import { describe, it, expect, vi } from 'vitest'
import worker from '../src/index'
import { createToken } from '../src/lib/auth'
import { makeMockAgentNamespaces, makeMockWorkflows, makeMockEnvStrings } from './helpers'
import type { Env, Task, Finding } from '../src/types/index'

vi.mock('../src/workers/verification', () => ({
  verifyTask: vi.fn(async () => ({ result: 'resolved', finding_results: [] })),
  recalcProductionScore: vi.fn(async () => {}),
  escalateSeverity: vi.fn(async () => {}),
}))

import { verifyTask } from '../src/workers/verification'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

function makeMockD1(options: { tasks?: Task[]; findings?: Finding[]; auditSessions?: Array<{ id: string; tenant_id: string }> } = {}) {
  const tasks = options.tasks ?? []
  const findings = options.findings ?? []
  const auditSessions = options.auditSessions ?? [{ id: 'run-1', tenant_id: 'tenant-1' }]
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
          if (lower.includes('audit_sessions') && lower.includes('tenant_id')) {
            return Promise.resolve(auditSessions.find(s => s.id === params[0]) ?? null)
          }
          if (lower.includes('from tenants')) {
            return Promise.resolve(null)
          }
          if (lower.includes('from tasks')) {
            if (lower.includes('task_id')) {
              return Promise.resolve(tasks.find(t => t.task_id === params[0]) ?? null)
            }
            return Promise.resolve(null)
          }
          if (lower.includes('from findings')) {
            if (lower.includes('finding_id')) {
              return Promise.resolve(findings.find(f => f.finding_id === params[0]) ?? null)
            }
            return Promise.resolve(null)
          }
          return Promise.resolve(null)
        },
        all: () => {
          runs.push({ sql, params })
          const lower = sql.toLowerCase()
          if (lower.includes('from tasks')) {
            const statusFilter = params.find(p => typeof p === 'string' && ['backlog', 'in_progress', 'in_review', 'done'].includes(p)) as string | undefined
            const result = statusFilter ? tasks.filter(t => t.status === statusFilter) : tasks
            return Promise.resolve({ results: result })
          }
          if (lower.includes('from findings')) return Promise.resolve({ results: findings })
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

function makeMockRateLimiterDO(allowed: boolean): DurableObjectNamespace {
  return {
    idFromName: () => ({ toString: () => 'rate-limiter-id' }),
    get: () => ({
      fetch: async () => new Response(JSON.stringify({ allowed }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    }),
  } as unknown as DurableObjectNamespace
}

async function makeEnv(overrides: Partial<Env> = {}): Promise<Env> {
  return {
    DB: makeMockD1().db,
    R2: {} as R2Bucket,
    ...makeMockAgentNamespaces(),
    COORDINATOR_DO: {} as DurableObjectNamespace,
    DASHBOARD_DO: {} as DurableObjectNamespace,
    RATE_LIMIT_DO: makeMockRateLimiterDO(true),
    ...makeMockWorkflows(),
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    ...makeMockEnvStrings(),
    ...overrides,
  } as Env
}

function sampleTask(overrides: Partial<Task> = {}): Task {
  return {
    task_id: 'task-1',
    tenant_id: 'tenant-1',
    audit_run_id: 'run-1',
    title: 'Fix auth issue',
    finding_ids: JSON.stringify(['finding-1']),
    priority_score: 90,
    multipliers: JSON.stringify(['base(90)']),
    status: 'backlog',
    assigned_agent: null,
    commit_sha: null,
    created_at: 1,
    updated_at: 1,
    conflict_flag: 0,
    conflict_reason: null,
    lock_expires_at: null,
    ...overrides,
  }
}

function sampleFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    finding_id: 'finding-1',
    tenant_id: 'tenant-1',
    audit_run_id: 'run-1',
    agent_id: 'agent-1',
    agent_type: 'security',
    severity: 'critical',
    category: 'auth_bypass',
    file: 'src/auth.ts',
    line_range: [1, 10],
    evidence_quote: 'const token = req.headers.authorization',
    description: 'Missing token validation',
    impact: 'Unauthorized access',
    verified_by: [],
    source: 'agent',
    status: 'open',
    recurrence_count: 0,
    is_regression: false,
    ts: 1,
    verified_at: null,
    screenshot_id: null,
    ...overrides,
  }
}

async function authHeaders(tenantId: string): Promise<HeadersInit> {
  const token = await createToken(tenantId, 'test-secret')
  return { Authorization: `Bearer ${token}` }
}

describe('task lifecycle REST API', () => {
  it('lists tasks for an audit run', async () => {
    const { db } = makeMockD1({ tasks: [sampleTask()] })
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/audits/run-1/tasks', {
      headers: await authHeaders('tenant-1'),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    const body = await response.json() as { tasks: Task[] }

    expect(response.status).toBe(200)
    expect(body.tasks).toHaveLength(1)
    expect(body.tasks[0].task_id).toBe('task-1')
  })

  it('filters tasks by status', async () => {
    const { db } = makeMockD1({ tasks: [sampleTask(), sampleTask({ task_id: 'task-2', status: 'in_progress' })] })
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/audits/run-1/tasks?status=backlog', {
      headers: await authHeaders('tenant-1'),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    const body = await response.json() as { tasks: Task[] }

    expect(body.tasks).toHaveLength(1)
    expect(body.tasks[0].status).toBe('backlog')
  })

  it('moves a task to in_progress and sets a 48-hour lock', async () => {
    const { db, runs } = makeMockD1({ tasks: [sampleTask()] })
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/audits/run-1/tasks/task-1', {
      method: 'PATCH',
      headers: { ...(await authHeaders('tenant-1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress', assigned_agent: 'human-1' }),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    const body = await response.json() as { status: string; assigned_agent: string; lock_expires_at_seconds: number }

    expect(response.status).toBe(200)
    expect(body.status).toBe('in_progress')
    expect(body.assigned_agent).toBe('human-1')
    expect(body.lock_expires_at_seconds).toBe(48 * 3600)

    const updateRun = runs.find(r => r.sql.toLowerCase().includes('update tasks') && r.sql.toLowerCase().includes('lock_expires_at'))
    expect(updateRun).toBeDefined()
    expect(updateRun?.params).toContain('in_progress')
    expect(updateRun?.params).toContain('human-1')
  })

  it('rejects invalid status transitions', async () => {
    const { db } = makeMockD1({ tasks: [sampleTask({ status: 'in_progress', assigned_agent: 'human-1' })] })
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/audits/run-1/tasks/task-1', {
      method: 'PATCH',
      headers: { ...(await authHeaders('tenant-1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    expect(response.status).toBe(400)
  })

  it('rejects marking done without a commit_sha', async () => {
    const { db } = makeMockD1({ tasks: [sampleTask({ status: 'in_review' })] })
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/audits/run-1/tasks/task-1', {
      method: 'PATCH',
      headers: { ...(await authHeaders('tenant-1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    expect(response.status).toBe(400)
  })

  it('marks done from in_review, stores commit_sha, triggers verification, and returns in_review', async () => {
    const { db, runs } = makeMockD1({ tasks: [sampleTask({ status: 'in_review', assigned_agent: 'human-1' })] })
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/audits/run-1/tasks/task-1', {
      method: 'PATCH',
      headers: { ...(await authHeaders('tenant-1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done', commit_sha: 'abc123' }),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    const body = await response.json() as { status: string; commit_sha: string; verification: { result: string } }

    expect(response.status).toBe(200)
    expect(body.status).toBe('in_review')
    expect(body.commit_sha).toBe('abc123')
    expect(body.verification.result).toBe('resolved')
    expect(verifyTask).toHaveBeenCalled()

    const updateRun = runs.find(r => r.sql.toLowerCase().includes('update tasks') && r.sql.toLowerCase().includes('commit_sha'))
    expect(updateRun).toBeDefined()
  })

  it('triggers verification on POST /verify', async () => {
    const { db } = makeMockD1({ tasks: [sampleTask({ status: 'in_review', commit_sha: 'def456' })] })
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/audits/run-1/tasks/task-1/verify', {
      method: 'POST',
      headers: await authHeaders('tenant-1'),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    const body = await response.json() as { verification: { result: string } }

    expect(response.status).toBe(200)
    expect(body.verification.result).toBe('resolved')
    expect(verifyTask).toHaveBeenCalled()
  })

  it('lists findings for an audit run', async () => {
    const { db } = makeMockD1({ findings: [sampleFinding()] })
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/audits/run-1/findings', {
      headers: await authHeaders('tenant-1'),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    const body = await response.json() as { findings: Finding[] }

    expect(response.status).toBe(200)
    expect(body.findings).toHaveLength(1)
    expect(body.findings[0].finding_id).toBe('finding-1')
  })

  it('patches a finding status', async () => {
    const { db, runs } = makeMockD1({ findings: [sampleFinding()] })
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/audits/run-1/findings/finding-1', {
      method: 'PATCH',
      headers: { ...(await authHeaders('tenant-1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'wont_fix', reason: 'Accepted risk' }),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    const body = await response.json() as { finding_id: string; status: string }

    expect(response.status).toBe(200)
    expect(body.status).toBe('wont_fix')
    const updateRun = runs.find(r => r.sql.toLowerCase().includes('update findings'))
    expect(updateRun).toBeDefined()
  })

  it('returns 403 for cross-tenant access', async () => {
    const { db } = makeMockD1()
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/audits/run-1/tasks', {
      headers: await authHeaders('tenant-2'),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    expect(response.status).toBe(403)
  })
})
