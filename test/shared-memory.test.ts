import { describe, it, expect } from 'vitest'
import { SharedMemoryDurableObject } from '../src/workers/shared-memory'
import { makeMockAgentNamespaces, makeMockWorkflows, makeMockEnvStrings } from './helpers'
import type { Env } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

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
  const { db } = makeMockD1()
  return {
    DB: db,
    R2: {} as R2Bucket,
    ...makeMockAgentNamespaces(),
    COORDINATOR_DO: {} as DurableObjectNamespace,
    DASHBOARD_DO: {} as DurableObjectNamespace,
    RATE_LIMIT_DO: {} as DurableObjectNamespace,
    ...makeMockWorkflows(),
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    ...makeMockEnvStrings(),
    ...overrides,
  }
}

async function makeDO(env: Env): Promise<SharedMemoryDurableObject> {
  // The DurableObject base class requires a state and env object. We pass
  // minimal stubs because SharedMemoryDO only uses env.DB and fetch routing.
  const state = {} as DurableObjectState
  return new SharedMemoryDurableObject(state, env)
}

describe('SharedMemoryDurableObject', () => {
  it('writes a knowledge ledger entry', async () => {
    const env = makeEnv()
    const do_ = await makeDO(env)

    const response = await do_.fetch(new Request('https://shared-memory/write', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: 'tenant-1',
        audit_run_id: 'run-001',
        agent_id: 'agent-001',
        agent_type: 'security',
        file_path: 'src/auth.ts',
        finding_id: 'F-001',
        knowledge_type: 'finding',
        content: JSON.stringify({ severity: 'high', category: 'auth_bypass', description: 'x' }),
      }),
      headers: { 'Content-Type': 'application/json' },
    }))

    expect(response.ok).toBe(true)
    const data = await response.json() as { ok: boolean; id: string }
    expect(data.ok).toBe(true)
    expect(data.id).toBeDefined()
  })

  it('rejects non-POST requests', async () => {
    const env = makeEnv()
    const do_ = await makeDO(env)
    const response = await do_.fetch(new Request('https://shared-memory/write'))
    expect(response.status).toBe(405)
  })

  it('returns 404 for unknown paths', async () => {
    const env = makeEnv()
    const do_ = await makeDO(env)
    const response = await do_.fetch(new Request('https://shared-memory/unknown', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(response.status).toBe(404)
  })
})
