import { describe, it, expect, vi } from 'vitest'
import { handleAuditStart } from '../src/lib/router'
import { makeMockEnvStrings } from './helpers'
import type { Env } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

function makeInMemoryD1(): D1Database {
  const tables: Record<string, Record<string, unknown>[]> = {
    audit_sessions: [],
  }
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: async () => {
          const lower = sql.toLowerCase()
          if (lower.includes('insert or ignore into audit_sessions')) {
            const id = params[0] as string
            if (!tables.audit_sessions.some(s => s.id === id)) {
              tables.audit_sessions.push({
                id,
                tenant_id: params[1],
                status: 'pending',
                total_files: 0,
                repo_url: params[2],
                repo_branch: params[3],
                last_commit_sha: params[4],
                created_at: Math.floor(Date.now() / 1000),
              })
            }
          } else if (lower.includes('update audit_sessions')) {
            const id = params[params.length - 1] as string
            const row = tables.audit_sessions.find(s => s.id === id)
            if (row) row.status = params[0]
          }
          return { changes: 1, meta: {} }
        },
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
  ;(db as any).tables = tables
  return db
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  const workflows = {
    PRIORITY_RESOLVER_WORKFLOW: { create: vi.fn() } as unknown as Workflow,
    SALVATION_WORKFLOW: { create: vi.fn() } as unknown as Workflow,
    CONTINUOUS_AUDIT_WORKFLOW: { create: vi.fn() } as unknown as Workflow,
    AUDIT_START_WORKFLOW: { create: vi.fn() } as unknown as Workflow,
  }
  return {
    ...makeMockEnvStrings(),
    ...workflows,
    DB: makeInMemoryD1(),
    R2: {} as R2Bucket,
    ...overrides,
  } as Env
}

describe('handleAuditStart pre-creates audit session', () => {
  it('creates an audit_sessions row in pending before dispatching the workflow', async () => {
    const env = makeEnv()
    const request = new Request('https://localhost/audit/start', {
      method: 'POST',
      body: JSON.stringify({
        audit_run_id: 'run-precreate',
        repo_url: 'https://github.com/owner/repo',
        branch: 'develop',
        commit_sha: 'abc123',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await handleAuditStart(request, env, 'tenant-1')
    expect(response.status).toBe(202)

    const dbTables = (env.DB as unknown as { tables: { audit_sessions: Record<string, unknown>[] } }).tables
    expect(dbTables.audit_sessions).toHaveLength(1)
    const session = dbTables.audit_sessions[0]
    expect(session.id).toBe('run-precreate')
    expect(session.status).toBe('pending')
    expect(session.repo_url).toBe('https://github.com/owner/repo')
    expect(session.repo_branch).toBe('develop')
    expect(session.last_commit_sha).toBe('abc123')

    expect((env.AUDIT_START_WORKFLOW as unknown as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledOnce()
  })

  it('passes the GitHub token override through to the workflow payload', async () => {
    const env = makeEnv()
    const request = new Request('https://localhost/audit/start', {
      method: 'POST',
      body: JSON.stringify({
        audit_run_id: 'run-token',
        repo_url: 'https://github.com/owner/repo',
        github_token_override: 'ghp_override',
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    await handleAuditStart(request, env, 'tenant-1')
    const createFn = (env.AUDIT_START_WORKFLOW as unknown as { create: ReturnType<typeof vi.fn> }).create
    const payload = createFn.mock.calls[0][0].params
    expect(payload.github_token_override).toBe('ghp_override')
  })
})
