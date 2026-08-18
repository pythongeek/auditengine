import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import worker from '../src/index'
import { verifyTask } from '../src/workers/verification'
import { createToken } from '../src/lib/auth'
import { makeMockAgentNamespaces, makeMockWorkflows, makeMockEnvStrings } from './helpers'
import type { Env, Finding, Task, RepoGroup, RepoGroupMember, RepoDependency } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

function makeMockD1(options: {
  auditSessions?: Array<{ id: string; tenant_id: string; repo_url: string; repo_branch: string; last_commit_sha?: string | null; status?: string; readiness_score?: number }>
  findings?: Finding[]
  tasks?: Task[]
  repoGroups?: RepoGroup[]
  repoGroupMembers?: RepoGroupMember[]
  repoDependencies?: RepoDependency[]
} = {}) {
  const auditSessions = options.auditSessions ?? []
  const findings = options.findings ?? []
  const tasks = options.tasks ?? []
  const repoGroups = options.repoGroups ?? []
  const repoGroupMembers = options.repoGroupMembers ?? []
  const repoDependencies = options.repoDependencies ?? []
  const runs: { sql: string; params: unknown[] }[] = []
  const inserted: { table: string; params: unknown[] }[] = []

  function firstFor(sql: string, params: unknown[]) {
    const lower = sql.toLowerCase()
    if (lower.includes('from audit_sessions')) {
      return auditSessions.find(s => s.id === params[0]) ?? null
    }
    if (lower.includes('from repo_groups')) {
      return repoGroups.find(g => g.group_id === params[0] && g.tenant_id === params[1]) ?? null
    }
    if (lower.includes('from findings') && lower.includes('finding_id')) {
      return findings.find(f => f.finding_id === params[0]) ?? null
    }
    if (lower.includes('from tasks') && lower.includes('task_id')) {
      return tasks.find(t => t.task_id === params[0]) ?? null
    }
    return null
  }

  function allFor(sql: string, params: unknown[]) {
    const lower = sql.toLowerCase()
    if (lower.includes('from repo_group_members')) {
      return repoGroupMembers.filter(m => m.group_id === params[0])
    }
    if (lower.includes('from repo_dependencies')) {
      return repoDependencies.filter(d => d.provider_run_id === params[0] && d.dependency_path === params[1])
    }
    if (lower.includes('from findings') && lower.includes('audit_run_id')) {
      return findings.filter(f => f.audit_run_id === params[0] && f.file === params[1] && ['open', 'in_progress', 'in_review'].includes(f.status))
    }
    if (lower.includes('from tasks')) {
      return tasks.filter(t => t.audit_run_id === params[0])
    }
    return []
  }

  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: () => {
          runs.push({ sql, params })
          const lower = sql.toLowerCase()
          if (lower.includes('insert') && lower.includes('repo_groups')) inserted.push({ table: 'repo_groups', params })
          if (lower.includes('insert') && lower.includes('repo_group_members')) inserted.push({ table: 'repo_group_members', params })
          if (lower.includes('insert') && lower.includes('repo_dependencies')) inserted.push({ table: 'repo_dependencies', params })
          if (lower.includes('insert') && lower.includes('tasks')) inserted.push({ table: 'tasks', params })
          return Promise.resolve({ changes: 1, meta: {} })
        },
        first: () => {
          runs.push({ sql, params })
          return Promise.resolve(firstFor(sql, params))
        },
        all: () => {
          runs.push({ sql, params })
          return Promise.resolve({ results: allFor(sql, params) })
        },
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database

  return { db, runs, inserted }
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

function makeEnv(overrides: Partial<Env> = {}): Env {
  const ns = {} as DurableObjectNamespace
  const dashboardNs = {
    idFromName: () => ({ toString: () => 'dashboard-id' }),
    get: () => ({
      fetch: () => Promise.resolve(new Response('OK', { status: 200 })),
    }),
  } as unknown as DurableObjectNamespace
  const namespaces = makeMockAgentNamespaces()
  for (const key of Object.keys(namespaces)) {
    (namespaces as Record<string, DurableObjectNamespace>)[key] = ns
  }
  const coordinatorNs = {
    idFromName: () => ({ toString: () => 'coordinator-id' }),
    get: () => ({
      fetch: () => Promise.resolve(new Response('OK', { status: 200 })),
    }),
  } as unknown as DurableObjectNamespace

  return {
    DB: makeMockD1().db,
    R2: {
      put: () => Promise.resolve({} as R2Object),
      get: () => Promise.resolve(null),
      list: () => Promise.resolve({ objects: [], truncated: false, cursor: '' } as unknown as R2Objects),
      delete: () => Promise.resolve(),
    } as unknown as R2Bucket,
    ...namespaces,
    COORDINATOR_DO: coordinatorNs,
    DASHBOARD_DO: dashboardNs,
    RATE_LIMIT_DO: makeMockRateLimiterDO(true),
    ...makeMockWorkflows(),
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    ...makeMockEnvStrings(),
    ...overrides,
  } as Env
}

async function authHeaders(tenantId: string): Promise<HeadersInit> {
  const token = await createToken(tenantId, 'test-secret')
  return { Authorization: `Bearer ${token}` }
}

function mockGithubDiff(diff: { files: Array<{ filename: string; patch: string }> }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/commits/')) {
      return new Response(JSON.stringify(diff), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('Not found', { status: 404 })
  }))
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

function sampleTask(overrides: Partial<Task> = {}): Task {
  return {
    task_id: 'task-1',
    tenant_id: 'tenant-1',
    audit_run_id: 'run-1',
    title: 'Fix auth issue',
    finding_ids: JSON.stringify(['finding-1']),
    priority_score: 90,
    multipliers: JSON.stringify(['base(90)']),
    status: 'in_review',
    assigned_agent: null,
    commit_sha: 'abc123',
    created_at: 1,
    updated_at: 1,
    conflict_flag: 0,
    conflict_reason: null,
    lock_expires_at: null,
    ...overrides,
  }
}

describe('repo groups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates repo group membership on ingest with repo_group_id', async () => {
    const { db, inserted } = makeMockD1()
    const env = makeEnv({ DB: db })
    const request = new Request('https://localhost/ingest', {
      method: 'POST',
      headers: { ...(await authHeaders('tenant-1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audit_run_id: 'run-1',
        files: [{ path: 'src/auth.ts', content: 'const x = 1' }],
        repo_group_id: 'group-1',
      }),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(200)
    expect(inserted.some(i => i.table === 'repo_groups' && i.params[0] === 'group-1')).toBe(true)
    expect(inserted.some(i => i.table === 'repo_group_members' && i.params[0] === 'group-1' && i.params[1] === 'run-1')).toBe(true)
  })

  it('creates repo group membership on audit/start with repo_group_id', async () => {
    const { db, inserted } = makeMockD1()
    const env = makeEnv({ DB: db })
    const request = new Request('https://localhost/audit/start', {
      method: 'POST',
      headers: { ...(await authHeaders('tenant-1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audit_run_id: 'run-2',
        files: [{ path: 'src/api.ts', content: 'const y = 2' }],
        repo_group_id: 'group-1',
      }),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(202)
    expect(inserted.some(i => i.table === 'repo_group_members' && i.params[0] === 'group-1' && i.params[1] === 'run-2')).toBe(true)
  })

  it('lists group audits', async () => {
    const { db } = makeMockD1({
      repoGroups: [{ group_id: 'group-1', tenant_id: 'tenant-1', name: 'group-1', created_at: 1 }],
      repoGroupMembers: [
        { group_id: 'group-1', audit_run_id: 'run-1', role: 'service' },
        { group_id: 'group-1', audit_run_id: 'run-2', role: 'consumer' },
      ],
      auditSessions: [
        { id: 'run-1', tenant_id: 'tenant-1', repo_url: 'https://github.com/a/1', repo_branch: 'main', status: 'complete', readiness_score: 80 },
        { id: 'run-2', tenant_id: 'tenant-1', repo_url: 'https://github.com/a/2', repo_branch: 'main', status: 'running', readiness_score: 50 },
      ],
    })
    const env = makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/groups/group-1', {
      headers: await authHeaders('tenant-1'),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    const body = await response.json() as { group: { group_id: string }; audits: { audit_run_id: string; role: string }[] }

    expect(response.status).toBe(200)
    expect(body.group.group_id).toBe('group-1')
    expect(body.audits).toHaveLength(2)
    expect(body.audits.some(a => a.audit_run_id === 'run-2' && a.role === 'consumer')).toBe(true)
  })

  it('creates dependency mapping', async () => {
    const { db, inserted } = makeMockD1({
      repoGroups: [{ group_id: 'group-1', tenant_id: 'tenant-1', name: 'group-1', created_at: 1 }],
    })
    const env = makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/dependencies', {
      method: 'POST',
      headers: { ...(await authHeaders('tenant-1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_id: 'group-1',
        dependency_path: 'src/auth.ts',
        consumer_run_id: 'run-2',
        provider_run_id: 'run-1',
      }),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(200)
    expect(inserted.some(i => i.table === 'repo_dependencies' && i.params[2] === 'src/auth.ts' && i.params[3] === 'run-2' && i.params[4] === 'run-1')).toBe(true)
  })
})

describe('cross-repo propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates a verification task in consumer run when provider finding is resolved', async () => {
    const providerFinding = sampleFinding({ finding_id: 'finding-provider', audit_run_id: 'run-1', file: 'src/auth.ts' })
    const consumerFinding = sampleFinding({ finding_id: 'finding-consumer', audit_run_id: 'run-2', file: 'src/auth.ts' })
    const { db, inserted } = makeMockD1({
      auditSessions: [
        { id: 'run-1', tenant_id: 'tenant-1', repo_url: 'https://github.com/acme/widgets', repo_branch: 'main' },
      ],
      findings: [providerFinding, consumerFinding],
      repoDependencies: [
        { id: 'dep-1', tenant_id: 'tenant-1', group_id: 'group-1', dependency_path: 'src/auth.ts', consumer_run_id: 'run-2', provider_run_id: 'run-1' },
      ],
    })
    mockGithubDiff({ files: [{ filename: 'src/auth.ts', patch: '- const token = req.headers.authorization\n+ const token = validate(req.headers.authorization)' }] })

    const events: unknown[] = []
    await verifyTask(sampleTask({ finding_ids: JSON.stringify(['finding-provider']) }), makeEnv({ DB: db }), false, (event) => events.push(event))

    const propagated = inserted.find(i => i.table === 'tasks')
    expect(propagated).toBeDefined()
    expect(propagated?.params[2]).toBe('run-2')
    expect(propagated?.params[4]).toBe(JSON.stringify(['finding-consumer']))
    expect((events[0] as { type: string }).type).toBe('task_created')
  })
})
