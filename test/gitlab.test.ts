import { describe, it, expect, vi, afterEach } from 'vitest'
import * as gitlab from '../src/lib/gitlab'
import { makeMockEnvStrings } from './helpers'
import type { Env } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeMockD1(tenantRow: Record<string, unknown> | null = null) {
  const runs: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: () => {
          runs.push({ sql, params })
          return Promise.resolve({ changes: 1, meta: {} })
        },
        first: () => Promise.resolve(tenantRow),
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
    PRIORITY_RESOLVER_WORKFLOW: {} as Workflow,
    SALVATION_WORKFLOW: {} as Workflow,
    CONTINUOUS_AUDIT_WORKFLOW: {} as Workflow,
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    ...makeMockEnvStrings({
      ENCRYPTION_KEY: 'encryption-key-32-chars-long',
      GITLAB_TOKEN: 'fallback-gitlab-token',
    }),
    ...overrides,
  } as Env
}

describe('GitLab provider', () => {
  it('parses plain and tree repo URLs', () => {
    expect(gitlab.parseRepoUrl('https://gitlab.com/acme/widgets')).toEqual({ owner: 'acme', repo: 'widgets', ref: 'HEAD' })
    expect(gitlab.parseRepoUrl('https://gitlab.com/acme/widgets', 'main')).toEqual({ owner: 'acme', repo: 'widgets', ref: 'main' })
    expect(gitlab.parseRepoUrl('https://gitlab.com/acme/widgets/-/tree/release')).toEqual({ owner: 'acme', repo: 'widgets', ref: 'release' })
  })

  it('returns null for unsupported URLs', () => {
    expect(gitlab.parseRepoUrl('https://github.com/acme/widgets')).toBeNull()
  })

  it('fetches a tenant-specific token when one is stored', async () => {
    const encrypted = await (await import('../src/lib/token-crypto')).encryptToken('stored-token', 'encryption-key-32-chars-long')
    const { db } = makeMockD1({ gitlab_token: encrypted })
    const env = makeEnv({ DB: db })

    const token = await gitlab.getTokenForTenant(db, 'tenant-1', env)
    expect(token).toBe('stored-token')
  })

  it('falls back to env GITLAB_TOKEN when no tenant token is stored', async () => {
    const { db } = makeMockD1({ gitlab_token: null })
    const env = makeEnv({ DB: db })

    const token = await gitlab.getTokenForTenant(db, 'tenant-1', env)
    expect(token).toBe('fallback-gitlab-token')
  })

  it('fetches file content from the GitLab API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('file contents', { status: 200 })))
    const env = makeEnv()

    const content = await gitlab.fetchFileContent('acme', 'widgets', 'src/index.ts', 'main', 'token')

    expect(content).toBe('file contents')
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(call).toContain('gitlab.com/api/v4/projects/acme%2Fwidgets/repository/files/src%2Findex.ts/raw')
  })

  it('fetches and normalizes a commit diff', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { old_path: 'src/old.ts', new_path: 'src/new.ts', diff: '--- a/src/old.ts\n+++ b/src/new.ts\n+line' },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const diff = await gitlab.fetchDiff('acme', 'widgets', 'abc123', 'token')
    const files = gitlab.diffToFiles(diff)

    expect(files).toHaveLength(1)
    expect(files[0].filename).toBe('src/new.ts')
    expect(files[0].patch).toContain('+line')
  })
})
