import { describe, it, expect } from 'vitest'
import { createToken, verifyToken, authenticate, ensureTenant } from '../src/lib/auth'
import { makeMockAgentNamespaces, makeMockWorkflows, makeMockEnvStrings } from './helpers'
import type { Env } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

const mockEnv: Env = {
  DB: {
    prepare: () => ({
      bind: () => ({ run: () => Promise.resolve({ changes: 1, meta: {} }) }),
    }),
  } as unknown as D1Database,
  R2: {} as R2Bucket,
  ...makeMockAgentNamespaces(),
  COORDINATOR_DO: {} as DurableObjectNamespace,
  DASHBOARD_DO: {} as DurableObjectNamespace,
  RATE_LIMIT_DO: {} as DurableObjectNamespace,
  ...makeMockWorkflows(),
  WRITE_QUEUE: {} as Queue,
  BROWSER: {} as Fetcher,
  ...makeMockEnvStrings(),
}

describe('auth', () => {
  it('creates and verifies a token', async () => {
    const token = await createToken('tenant-abc', mockEnv.JWT_SECRET)
    const claims = await verifyToken(token, mockEnv.JWT_SECRET)
    expect(claims.sub).toBe('tenant-abc')
    expect(claims.plan).toBe('free')
  })

  it('rejects an invalid signature', async () => {
    const token = await createToken('tenant-abc', mockEnv.JWT_SECRET)
    await expect(verifyToken(token, 'wrong-secret')).rejects.toThrow('Invalid token signature')
  })

  it('authenticates a Bearer token', async () => {
    const token = await createToken('tenant-xyz', mockEnv.JWT_SECRET)
    const request = new Request('https://example.com/ingest', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const ctx = await authenticate(request, mockEnv)
    expect(ctx.tenantId).toBe('tenant-xyz')
    expect(ctx.plan).toBe('free')
  })

  it('authenticates a token from a query parameter', async () => {
    const token = await createToken('tenant-qp', mockEnv.JWT_SECRET)
    const request = new Request(`https://example.com/dashboard/ws?token=${token}&audit_run_id=run-1`)
    const ctx = await authenticate(request, mockEnv)
    expect(ctx.tenantId).toBe('tenant-qp')
  })

  it('throws when the token is missing', async () => {
    const request = new Request('https://example.com/ingest')
    await expect(authenticate(request, mockEnv)).rejects.toThrow('Missing Authorization token')
  })

  it('ensureTenant inserts the tenant row', async () => {
    const calls: unknown[][] = []
    const db = {
      prepare: () => ({
        bind: (...args: unknown[]) => {
          calls.push(args)
          return { run: () => Promise.resolve({ changes: 1, meta: {} }) }
        },
      }),
    } as unknown as D1Database

    await ensureTenant('tenant-1', db)
    expect(calls[0]).toEqual(['tenant-1', 'tenant-1', 'free'])
  })
})
