import { describe, it, expect } from 'vitest'
import worker from '../src/index'
import { createToken } from '../src/lib/auth'
import { makeMockAgentNamespaces, makeMockWorkflows, makeMockEnvStrings } from './helpers'
import type { Env, Repository } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

function makeMockD1(repositories: Repository[] = []) {
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
          if (lower.includes('from tenants') && lower.includes('id')) {
            return Promise.resolve({ id: 'tenant-1', name: 'tenant-1', plan: 'free' })
          }
          if (lower.includes('from repositories') && lower.includes('id')) {
            return Promise.resolve(repositories.find(r => r.id === params[0]) ?? null)
          }
          return Promise.resolve(null)
        },
        all: () => {
          runs.push({ sql, params })
          const lower = sql.toLowerCase()
          if (lower.includes('from repositories')) return Promise.resolve({ results: repositories })
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

async function authHeaders(tenantId: string): Promise<HeadersInit> {
  const token = await createToken(tenantId, 'test-secret')
  return { Authorization: `Bearer ${token}` }
}

const sampleRepo = (overrides: Partial<Repository> = {}): Repository => ({
  id: 'repo-1',
  tenant_id: 'tenant-1',
  provider: 'github',
  owner: 'owner',
  repo: 'repo',
  url: 'https://github.com/owner/repo',
  default_branch: 'main',
  is_active: 1,
  created_at: 1,
  updated_at: 1,
  ...overrides,
})

describe('repository bookmarks REST API', () => {
  it('lists repositories for a tenant', async () => {
    const { db } = makeMockD1([sampleRepo()])
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/repositories', {
      headers: await authHeaders('tenant-1'),
    })

    const response = await worker.fetch(request, env)
    const body = await response.json() as { repositories: Repository[] }

    expect(response.status).toBe(200)
    expect(body.repositories).toHaveLength(1)
    expect(body.repositories[0].url).toBe('https://github.com/owner/repo')
  })

  it('creates a repository bookmark', async () => {
    const { db, runs } = makeMockD1([])
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/repositories', {
      method: 'POST',
      headers: { ...(await authHeaders('tenant-1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://github.com/owner/repo', default_branch: 'develop' }),
    })

    const response = await worker.fetch(request, env)
    const body = await response.json() as { repository: Repository }

    expect(response.status).toBe(201)
    expect(body.repository.url).toBe('https://github.com/owner/repo')
    expect(body.repository.default_branch).toBe('develop')
    expect(body.repository.provider).toBe('github')

    const insertRun = runs.find(r => r.sql.toLowerCase().includes('insert into repositories'))
    expect(insertRun).toBeDefined()
  })

  it('updates a repository default branch', async () => {
    const { db, runs } = makeMockD1([sampleRepo()])
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/repositories/repo-1', {
      method: 'PATCH',
      headers: { ...(await authHeaders('tenant-1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_branch: 'staging' }),
    })

    const response = await worker.fetch(request, env)
    const body = await response.json() as { repository: Repository }

    expect(response.status).toBe(200)
    expect(body.repository.default_branch).toBe('staging')

    const updateRun = runs.find(r => r.sql.toLowerCase().includes('update repositories'))
    expect(updateRun).toBeDefined()
  })

  it('deletes a repository bookmark', async () => {
    const { db, runs } = makeMockD1([sampleRepo()])
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/repositories/repo-1', {
      method: 'DELETE',
      headers: await authHeaders('tenant-1'),
    })

    const response = await worker.fetch(request, env)
    const body = await response.json() as { deleted: boolean }

    expect(response.status).toBe(200)
    expect(body.deleted).toBe(true)

    const deleteRun = runs.find(r => r.sql.toLowerCase().includes('delete from repositories'))
    expect(deleteRun).toBeDefined()
  })

  it('rejects cross-tenant repository access', async () => {
    const { db } = makeMockD1([sampleRepo()])
    const env = await makeEnv({ DB: db })
    const request = new Request('https://localhost/api/v1/tenants/tenant-1/repositories', {
      headers: await authHeaders('tenant-2'),
    })

    const response = await worker.fetch(request, env)
    expect(response.status).toBe(403)
  })
})
