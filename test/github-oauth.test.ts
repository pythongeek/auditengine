import { describe, it, expect, vi, afterEach } from 'vitest'
import worker from '../src/index'
import { createToken, createOAuthState } from '../src/lib/auth'
import { makeMockAgentNamespaces, makeMockWorkflows, makeMockEnvStrings } from './helpers'
import type { Env } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeMockD1() {
  const runs: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: () => {
          runs.push({ sql, params })
          return Promise.resolve({ changes: 1, meta: {} })
        },
        first: () => Promise.resolve(null),
        all: () => Promise.resolve({ results: [] }),
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
  return { db, runs }
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: makeMockD1().db,
    R2: {} as R2Bucket,
    ...makeMockAgentNamespaces(),
    COORDINATOR_DO: {} as DurableObjectNamespace,
    DASHBOARD_DO: {} as DurableObjectNamespace,
    RATE_LIMIT_DO: {} as DurableObjectNamespace,
    ...makeMockWorkflows(),
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    ...makeMockEnvStrings({
      JWT_SECRET: 'test-secret',
      ENCRYPTION_KEY: 'encryption-key-32-chars-long',
      GITHUB_CLIENT_ID: 'gh-client-id',
      GITHUB_CLIENT_SECRET: 'gh-client-secret',
    }),
    ...overrides,
  } as Env
}

describe('GitHub OAuth', () => {
  it('redirects to GitHub authorize URL with tenant state', async () => {
    const env = makeEnv()
    const token = await createToken('tenant-1', env.JWT_SECRET)
    const request = new Request('https://localhost/auth/github?tenant_id=tenant-1', {
      headers: { Authorization: `Bearer ${token}` },
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(302)
    const location = response.headers.get('Location')
    expect(location).toContain('https://github.com/login/oauth/authorize')
    expect(location).toContain(env.GITHUB_CLIENT_ID)
    expect(location).toContain('state=')
  })

  it('requires tenant_id on the redirect endpoint', async () => {
    const env = makeEnv()
    const request = new Request('https://localhost/auth/github')

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(400)
  })

  it('exchanges code, encrypts token, and stores it on the tenant row', async () => {
    const { db, runs } = makeMockD1()
    const env = makeEnv({ DB: db })
    const state = await createOAuthState('tenant-1', 'github', env.JWT_SECRET)

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === 'https://github.com/login/oauth/access_token') {
        return new Response(JSON.stringify({ access_token: 'gh-oauth-token-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('Not found', { status: 404 })
    }))

    const request = new Request(`https://localhost/auth/github/callback?code=abc123&state=${encodeURIComponent(state)}`)
    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(200)
    const body = await response.json() as { success: boolean; provider: string; tenant_id: string }
    expect(body.success).toBe(true)
    expect(body.provider).toBe('github')
    expect(body.tenant_id).toBe('tenant-1')

    const update = runs.find(r => r.sql.toLowerCase().includes('update tenants') && r.sql.includes('github_token'))
    expect(update).toBeDefined()
    expect(update?.params[1]).toBe('tenant-1')
    expect(typeof update?.params[0]).toBe('string')
    expect(update?.params[0]).not.toBe('gh-oauth-token-123')
  })

  it('rejects an invalid OAuth state', async () => {
    const env = makeEnv()
    const request = new Request('https://localhost/auth/github/callback?code=abc123&state=invalid-state')

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(401)
  })
})
