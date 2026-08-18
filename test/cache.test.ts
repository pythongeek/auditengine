import { describe, it, expect } from 'vitest'
import { runGate } from '../src/lib/gate'
import { LRUCache } from '../src/lib/cache'
import type { GateContext } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

function makeMocks() {
  const getCalls: string[] = []
  const r2 = {
    get: async (key: string) => {
      getCalls.push(key)
      return { text: async () => 'const token = req.headers.authorization\n' }
    },
  } as unknown as R2Bucket

  const db = {
    prepare: (sql: string) => ({
      bind: () => ({
        first: async () => {
          const lower = sql.toLowerCase()
          if (lower.includes('from files')) return { '1': 1 }
          if (lower.includes('from agent_config')) {
            return {
              evidence_required: 1,
              model_name: 'minimax-m3',
              max_tokens: 8000,
              temperature: 0.1,
              top_p: 1,
              llm_calls_per_minute: 10,
              critical: 0,
            }
          }
          return null
        },
        run: async () => ({ changes: 1, meta: {} }),
        all: async () => ({ results: [] }),
      }),
    }),
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database

  return { r2, db, getCalls }
}

function findingRaw(): string {
  return JSON.stringify([{
    finding_id: 'F-001',
    severity: 'medium',
    category: 'auth_bypass',
    file: 'src/auth.ts',
    line_range: [1, 2],
    evidence_quote: 'const token = req.headers.authorization',
    description: 'Missing token validation',
    impact: 'Unauthorized access',
    verified_by: [],
  }])
}

describe('R2 evidence cache', () => {
  it('caches chunk reads across repeated gate checks on the same file', async () => {
    const { r2, db, getCalls } = makeMocks()
    const chunkCache = new LRUCache<string, string>(50)
    const ctx: GateContext = {
      agentId: 'agent-1',
      agentType: 'security',
      auditRunId: 'run-1',
      tenantId: 'tenant-1',
      currentFile: 'src/auth.ts',
      currentFileContent: 'const token = req.headers.authorization\n',
      r2,
      claimLog: new Set(),
      chunkCache,
    }

    await runGate(findingRaw(), ctx, db)
    const firstCalls = getCalls.length
    expect(firstCalls).toBeGreaterThan(0)

    getCalls.length = 0
    await runGate(findingRaw(), ctx, db)
    expect(getCalls.length).toBe(0)
  })

  it('falls back to R2 when no cache is provided', async () => {
    const { r2, db, getCalls } = makeMocks()
    const ctx: GateContext = {
      agentId: 'agent-1',
      agentType: 'security',
      auditRunId: 'run-1',
      tenantId: 'tenant-1',
      currentFile: 'src/auth.ts',
      currentFileContent: 'const token = req.headers.authorization\n',
      r2,
      claimLog: new Set(),
    }

    await runGate(findingRaw(), ctx, db)
    expect(getCalls.length).toBeGreaterThan(0)
  })
})
