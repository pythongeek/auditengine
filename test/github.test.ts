import { describe, it, expect, vi, afterEach } from 'vitest'
import * as github from '../src/lib/github'
import { zip } from 'fflate'
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
      GITHUB_TOKEN: 'fallback-github-token',
    }),
    ...overrides,
  } as Env
}

async function makeZipBuffer(files: Record<string, string>): Promise<ArrayBuffer> {
  const entries: Record<string, Uint8Array> = {}
  for (const [path, content] of Object.entries(files)) {
    entries[path] = new TextEncoder().encode(content)
  }
  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, {}, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
  return zipped.buffer as ArrayBuffer
}

describe('GitHub provider', () => {
  it('parses plain and tree repo URLs', () => {
    expect(github.parseRepoUrl('https://github.com/acme/widgets')).toEqual({ owner: 'acme', repo: 'widgets', ref: 'HEAD' })
    expect(github.parseRepoUrl('https://github.com/acme/widgets', 'main')).toEqual({ owner: 'acme', repo: 'widgets', ref: 'main' })
    expect(github.parseRepoUrl('https://github.com/acme/widgets/tree/main')).toEqual({ owner: 'acme', repo: 'widgets', ref: 'main' })
  })

  it('returns null for unsupported URLs', () => {
    expect(github.parseRepoUrl('https://gitlab.com/acme/widgets')).toBeNull()
  })

  it('fetches a tenant-specific token when one is stored', async () => {
    const encrypted = await (await import('../src/lib/token-crypto')).encryptToken('stored-token', 'encryption-key-32-chars-long')
    const { db } = makeMockD1({ github_token: encrypted })
    const env = makeEnv({ DB: db })

    const token = await github.getTokenForTenant(db, 'tenant-1', env)
    expect(token).toBe('stored-token')
  })

  it('falls back to env GITHUB_TOKEN when no tenant token is stored', async () => {
    const { db } = makeMockD1({ github_token: null })
    const env = makeEnv({ DB: db })

    const token = await github.getTokenForTenant(db, 'tenant-1', env)
    expect(token).toBe('fallback-github-token')
  })

  it('fetches repo files from the GitHub API zipball', async () => {
    const zipBuffer = await makeZipBuffer({ 'acme-widgets-abc123/src/index.ts': 'console.log("hello")' })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/zipball/')) {
        return new Response(zipBuffer, { status: 200, headers: { 'Content-Type': 'application/zip' } })
      }
      return new Response('not found', { status: 404 })
    }))

    const files = await github.fetchRepoFiles('https://github.com/acme/widgets', 'main', '')

    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('src/index.ts')
    expect(files[0].content).toBe('console.log("hello")')
  })

  it('retries a transient API zipball failure and succeeds', async () => {
    const zipBuffer = await makeZipBuffer({ 'acme-widgets-abc123/src/index.ts': 'console.log("hello")' })
    let attempts = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (!url.includes('/zipball/')) return new Response('not found', { status: 404 })
      attempts++
      if (attempts < 2) return new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } })
      return new Response(zipBuffer, { status: 200, headers: { 'Content-Type': 'application/zip' } })
    }))

    const files = await github.fetchRepoFiles('https://github.com/acme/widgets', 'main', '')

    expect(attempts).toBe(2)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('src/index.ts')
  })

  it('falls back to the web archive URL when the API zipball fails without a token', async () => {
    const zipBuffer = await makeZipBuffer({ 'acme-widgets-abc123/src/index.ts': 'console.log("web")' })
    let apiCalls = 0
    let webCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/zipball/')) {
        apiCalls++
        return new Response('rate limited', { status: 403 })
      }
      if (url.includes('github.com/acme/widgets/archive/')) {
        webCalls++
        return new Response(zipBuffer, { status: 200, headers: { 'Content-Type': 'application/zip' } })
      }
      return new Response('not found', { status: 404 })
    }))

    const files = await github.fetchRepoFiles('https://github.com/acme/widgets', 'main', '')

    expect(apiCalls).toBeGreaterThan(0)
    expect(webCalls).toBeGreaterThan(0)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('src/index.ts')
    expect(files[0].content).toBe('console.log("web")')
  })

  it('throws a clear rate-limit error when both API and web archive fail without a token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 403 })))

    await expect(github.fetchRepoFiles('https://github.com/acme/widgets', 'main', '')).rejects.toThrow(/rate limit/i)
  })

  it('does not use the web archive fallback when a token is configured', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/zipball/')) return new Response('rate limited', { status: 403 })
      if (url.includes('github.com/acme/widgets/archive/')) return new Response('archive', { status: 200 })
      return new Response('not found', { status: 404 })
    }))

    await expect(github.fetchRepoFiles('https://github.com/acme/widgets', 'main', 'token-123')).rejects.toThrow(/token has access/)
  })

  it('lists repo files using the GitHub tree API', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/git/trees/')) {
        return new Response(JSON.stringify({
          tree: [
            { path: 'src/index.ts', type: 'blob' },
            { path: 'README.md', type: 'blob' },
            { path: 'src', type: 'tree' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('not found', { status: 404 })
    }))

    const files = await github.listRepoFiles('https://github.com/acme/widgets', 'main', '')

    expect(files).toHaveLength(2)
    expect(files.map(f => f.path)).toContain('src/index.ts')
    expect(files.map(f => f.path)).toContain('README.md')
  })

  it('fetches file content from the GitHub API', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/contents/')) {
        return new Response(JSON.stringify({
          content: btoa('file contents'),
          encoding: 'base64',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('not found', { status: 404 })
    }))

    const content = await github.fetchFileContent('acme', 'widgets', 'src/index.ts', 'main', 'token')

    expect(content).toBe('file contents')
  })

  it('returns null when file content fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })))

    const content = await github.fetchFileContent('acme', 'widgets', 'src/index.ts', 'main', '')

    expect(content).toBeNull()
  })

  it('fetches and normalizes a commit diff', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/commits/')) {
        return new Response(JSON.stringify({ files: [{ filename: 'src/new.ts', patch: '+line' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('not found', { status: 404 })
    }))

    const diff = await github.fetchDiff('acme', 'widgets', 'abc123', 'token')

    expect(diff).toEqual({ files: [{ filename: 'src/new.ts', patch: '+line' }] })
  })

  it('returns null when diff fetch exhausts retries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('server error', { status: 500 })))

    const diff = await github.fetchDiff('acme', 'widgets', 'abc123', '')

    expect(diff).toBeNull()
  })
})
