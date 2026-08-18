import { describe, it, expect, vi } from 'vitest'
import worker from '../src/index'
import { createToken, isAdmin } from '../src/lib/auth'
import { makeMockAgentNamespaces, makeMockWorkflows, makeMockEnvStrings } from './helpers'
import type { Env, Tenant, AuditSession, Finding } from '../src/types/index'

vi.mock('../src/workers/verification', () => ({
  verifyTask: vi.fn(async () => ({ result: 'resolved', finding_results: [] })),
  recalcProductionScore: vi.fn(async () => {}),
  escalateSeverity: vi.fn(async () => {}),
}))

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

const TENANT_A: Tenant = { id: 'tenant-1', name: 'tenant-1', plan: 'free', github_token: null, gitlab_token: null, bitbucket_token: null, created_at: '2026-08-15', updated_at: '2026-08-15' }
const TENANT_B: Tenant = { id: 'tenant-2', name: 'tenant-2', plan: 'pro', github_token: null, gitlab_token: null, bitbucket_token: null, created_at: '2026-08-15', updated_at: '2026-08-15' }
const AUDIT_A: AuditSession = {
  id: 'run-1',
  tenant_id: 'tenant-1',
  repo_url: 'https://github.com/org/repo',
  repo_branch: 'main',
  status: 'complete',
  readiness_score: 82,
  total_files: 12,
  files_analyzed: 12,
  findings_count: 3,
  last_commit_sha: 'abc',
  started_at: 1,
  completed_at: 2,
  created_at: 0,
}

const FINDINGS_A: Finding[] = [
  { finding_id: 'F-1', tenant_id: 'tenant-1', audit_run_id: 'run-1', agent_id: 'A-1', agent_type: 'security', severity: 'critical', category: 'auth', file: 'src/auth.ts', line_range: [1, 2], evidence_quote: 'missing auth', description: 'Missing auth', impact: 'high', verified_by: [], source: 'agent', status: 'open', recurrence_count: 0, is_regression: false, ts: 1, verified_at: null, screenshot_id: null },
  { finding_id: 'F-2', tenant_id: 'tenant-1', audit_run_id: 'run-1', agent_id: 'A-2', agent_type: 'api', severity: 'high', category: 'validation', file: 'src/api.ts', line_range: null, evidence_quote: 'no validation', description: 'No validation', impact: null, verified_by: [], source: 'agent', status: 'resolved', recurrence_count: 0, is_regression: false, ts: 2, verified_at: null, screenshot_id: null },
  { finding_id: 'F-3', tenant_id: 'tenant-1', audit_run_id: 'run-1', agent_id: 'A-3', agent_type: 'security', severity: 'critical', category: 'auth', file: 'src/auth.ts', line_range: null, evidence_quote: 'hardcoded', description: 'Hardcoded secret', impact: 'high', verified_by: [], source: 'agent', status: 'open', recurrence_count: 0, is_regression: false, ts: 3, verified_at: null, screenshot_id: null },
]

function makeMockD1(tenants: Tenant[] = [TENANT_A, TENANT_B], auditSessions: AuditSession[] = [AUDIT_A], findings: Finding[] = FINDINGS_A) {
  const db = {
    prepare: (sql: string) => {
      const bound = {
        run: () => Promise.resolve({ changes: 1, meta: {} }),
        first: () => {
          const lower = sql.toLowerCase()
          if (lower.includes('audit_sessions') && lower.includes('tenant_id') && params.length > 0) {
            return Promise.resolve(auditSessions.find(s => s.id === params[0]) ?? null)
          }
          if (lower.includes('from tenants') && lower.includes('id')) {
            return Promise.resolve(tenants.find(t => t.id === params[0]) ?? null)
          }
          if (lower.includes('from audit_sessions') && lower.includes('id')) {
            return Promise.resolve(auditSessions.find(s => s.id === params[0]) ?? null)
          }
          return Promise.resolve(null)
        },
        all: () => {
          const lower = sql.toLowerCase()
          if (lower.includes('from tenants')) return Promise.resolve({ results: tenants })
          if (lower.includes('from audit_sessions') && lower.includes('tenant_id')) return Promise.resolve({ results: auditSessions.filter(s => s.tenant_id === params[0]) })
          if (lower.includes('from audit_sessions') && lower.includes('id')) return Promise.resolve({ results: auditSessions.filter(s => s.id === params[0]) })
          if (lower.includes('from findings')) {
            const subset = findings.filter(f => f.audit_run_id === params[0])
            if (lower.includes('group by status')) {
              const counts = new Map<string, number>()
              for (const f of subset) counts.set(f.status, (counts.get(f.status) ?? 0) + 1)
              return Promise.resolve({ results: Array.from(counts.entries()).map(([status, count]) => ({ status, count })) })
            }
            if (lower.includes('group by severity')) {
              const counts = new Map<string, number>()
              for (const f of subset) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1)
              return Promise.resolve({ results: Array.from(counts.entries()).map(([severity, count]) => ({ severity, count })) })
            }
            return Promise.resolve({ results: subset })
          }
          return Promise.resolve({ results: [] })
        },
      }
      let params: unknown[] = []
      return {
        bind: (...p: unknown[]) => {
          params = p
          return bound
        },
        all: bound.all,
        first: bound.first,
        run: bound.run,
      }
    },
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
  return db
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
    DB: makeMockD1(),
    R2: {} as R2Bucket,
    ...makeMockAgentNamespaces(),
    COORDINATOR_DO: {} as DurableObjectNamespace,
    DASHBOARD_DO: {} as DurableObjectNamespace,
    RATE_LIMIT_DO: makeMockRateLimiterDO(true),
    ...makeMockWorkflows(),
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    ...makeMockEnvStrings({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'admin-pass' }),
    ...overrides,
  } as Env
}

async function getToken(env: Env, tenantId: string): Promise<string> {
  return createToken(tenantId, env.JWT_SECRET)
}

function basicAuthHeader(email: string, password: string): string {
  return 'Basic ' + btoa(email + ':' + password)
}

describe('dashboard admin API', () => {
  it('lists tenants with valid admin basic credentials', async () => {
    const env = await makeEnv()
    const res = await worker.fetch(new Request('https://example.com/api/v1/tenants', {
      headers: { Authorization: basicAuthHeader('admin@example.com', 'admin-pass') },
    }), env)
    expect(res.status).toBe(200)
    const data = await res.json() as { tenants: Tenant[] }
    expect(data.tenants).toHaveLength(2)
    expect(data.tenants.map((t: Tenant) => t.id)).toContain('tenant-1')
  })

  it('rejects tenant list without admin credentials', async () => {
    const env = await makeEnv()
    const token = await getToken(env, 'tenant-1')
    const res = await worker.fetch(new Request('https://example.com/api/v1/tenants', {
      headers: { Authorization: 'Bearer ' + token },
    }), env)
    expect(res.status).toBe(401)
  })

  it('isAdmin helper correctly validates basic auth', async () => {
    const env = await makeEnv()
    const okReq = new Request('https://example.com/api/v1/tenants', {
      headers: { Authorization: basicAuthHeader('admin@example.com', 'admin-pass') },
    })
    const badReq = new Request('https://example.com/api/v1/tenants', {
      headers: { Authorization: basicAuthHeader('admin@example.com', 'wrong') },
    })
    expect(await isAdmin(okReq, env)).toBe(true)
    expect(await isAdmin(badReq, env)).toBe(false)
  })
})

describe('dashboard audit API', () => {
  it('lists audits for an authenticated tenant', async () => {
    const env = await makeEnv()
    const token = await getToken(env, 'tenant-1')
    const res = await worker.fetch(new Request('https://example.com/api/v1/tenants/tenant-1/audits', {
      headers: { Authorization: 'Bearer ' + token },
    }), env)
    expect(res.status).toBe(200)
    const data = await res.json() as { audits: AuditSession[] }
    expect(data.audits).toHaveLength(1)
    expect(data.audits[0].id).toBe('run-1')
  })

  it('forbids listing audits for another tenant', async () => {
    const env = await makeEnv()
    const token = await getToken(env, 'tenant-1')
    const res = await worker.fetch(new Request('https://example.com/api/v1/tenants/tenant-2/audits', {
      headers: { Authorization: 'Bearer ' + token },
    }), env)
    expect(res.status).toBe(403)
  })

  it('returns audit detail with findings counts', async () => {
    const env = await makeEnv()
    const token = await getToken(env, 'tenant-1')
    const res = await worker.fetch(new Request('https://example.com/api/v1/tenants/tenant-1/audits/run-1', {
      headers: { Authorization: 'Bearer ' + token },
    }), env)
    expect(res.status).toBe(200)
    const data = await res.json() as {
      audit: AuditSession
      findings: {
        by_status: { status: string; count: number }[]
        by_severity: { severity: string; count: number }[]
      }
    }
    expect(data.audit.id).toBe('run-1')
    expect(data.audit.readiness_score).toBe(82)
    const statusMap = Object.fromEntries(data.findings.by_status.map((r) => [r.status, r.count]))
    expect(statusMap.open).toBe(2)
    expect(statusMap.resolved).toBe(1)
    const severityMap = Object.fromEntries(data.findings.by_severity.map((r) => [r.severity, r.count]))
    expect(severityMap.critical).toBe(2)
    expect(severityMap.high).toBe(1)
  })

  it('returns 404 for unknown audit detail', async () => {
    const env = await makeEnv()
    const token = await getToken(env, 'tenant-1')
    const res = await worker.fetch(new Request('https://example.com/api/v1/tenants/tenant-1/audits/run-999', {
      headers: { Authorization: 'Bearer ' + token },
    }), env)
    expect(res.status).toBe(404)
  })
})
