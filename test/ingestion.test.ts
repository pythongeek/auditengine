import { describe, it, expect } from 'vitest'
import { zip } from 'fflate'
import ingestionWorker from '../src/workers/ingestion'
import { detectLanguage } from '../src/lib/lang'
import { chunkFile, tagDomain } from '../src/workers/ingestion'
import { makeMockAgentNamespaces, makeMockWorkflows } from './helpers'
import type { Env } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

function makeMockD1() {
  const batches: unknown[][] = []
  const runs: { sql: string; params: unknown[] }[] = []

  const db = {
    prepare: (sql: string) => ({
      sql,
      bind: (...params: unknown[]) => ({
        sql,
        params,
        run: () => {
          runs.push({ sql, params })
          return Promise.resolve({ changes: 1, meta: {} })
        },
        first: () => Promise.resolve(null),
        all: () => Promise.resolve({ results: [] }),
      }),
    }),
    batch: (statements: Array<{ sql: string }>) => {
      batches.push(statements)
      for (const stmt of statements) {
        runs.push({ sql: stmt.sql, params: [] })
      }
      return Promise.resolve([])
    },
    runs,
    batches,
  } as unknown as D1Database

  return { db, batches, runs }
}

function makeMockR2() {
  const objects = new Map<string, string>()
  const r2 = {
    objects,
    put: (key: string, body: string | ReadableStream | ArrayBuffer | ArrayBufferView) => {
      objects.set(key, typeof body === 'string' ? body : '')
      return Promise.resolve({
        key,
        size: 0,
        etag: '',
        httpEtag: '',
        version: '',
        uploaded: new Date(),
        httpMetadata: {},
        customMetadata: {},
        writeHttpMetadata: () => new Headers(),
      } as unknown as R2Object)
    },
    get: (key: string) => {
      const content = objects.get(key)
      if (!content) return Promise.resolve(null)
      return Promise.resolve({
        key,
        text: () => Promise.resolve(content),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(content).buffer),
      } as unknown as R2ObjectBody)
    },
    list: () => Promise.resolve({ objects: [], truncated: false, cursor: '' } as unknown as R2Objects),
    delete: () => Promise.resolve(),
  } as unknown as R2Bucket

  return { r2, objects }
}

function makeMockDashboardDO() {
  return {
    idFromName: () => ({ toString: () => 'dashboard-id' }),
    get: () => ({
      fetch: () => Promise.resolve(new Response('Broadcasted', { status: 200 })),
    }),
  } as unknown as DurableObjectNamespace
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  const { db } = makeMockD1()
  const { r2 } = makeMockR2()
  return {
    DB: db,
    R2: r2,
    ...makeMockAgentNamespaces(),
    COORDINATOR_DO: {} as DurableObjectNamespace,
    DASHBOARD_DO: makeMockDashboardDO(),
    RATE_LIMIT_DO: {} as DurableObjectNamespace,
    ...makeMockWorkflows(),
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    KIMI_API_KEY: '',
    MINIMAX_API_KEY: '',
    GITHUB_TOKEN: '',
    JWT_SECRET: '',
    STAGING_URL: '',
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD: '',
    ...overrides,
  }
}

describe('ingestion helpers', () => {
  it('chunks a file into 500-line segments', () => {
    const content = Array.from({ length: 1200 }, (_, i) => `line ${i + 1}`).join('\n')
    const chunks = chunkFile(content)
    expect(chunks.length).toBe(3)
    expect(chunks[0].split('\n').length).toBe(500)
  })

  it('tags frontend files', () => {
    expect(tagDomain('src/components/Button.tsx')).toBe('frontend')
    expect(tagDomain('src/app/page.tsx')).toBe('frontend')
  })

  it('tags test files', () => {
    expect(tagDomain('src/auth.test.ts')).toBe('test')
    expect(tagDomain('test/helpers.ts')).toBe('test')
  })

  it('detects language from extension', () => {
    expect(detectLanguage('src/index.ts')).toBe('typescript')
    expect(detectLanguage('src/App.tsx')).toBe('tsx')
    expect(detectLanguage('src/styles.css')).toBe('css')
    expect(detectLanguage('README.md')).toBe('markdown')
  })
})

describe('ingestion worker', () => {
  it('accepts a JSON files payload and stores chunks with tenant prefix', async () => {
    const env = makeEnv()
    const body = JSON.stringify({
      audit_run_id: 'run-001',
      files: [{ path: 'src/auth.ts', content: 'const token = req.headers.authorization' }],
    })
    const request = new Request('https://example.com/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'tenant-1' },
      body,
    })

    const response = await ingestionWorker.fetch(request, env)
    expect(response.status).toBe(200)
    const json = await response.json() as { file_count: number; total_chunks: number }
    expect(json.file_count).toBe(1)
    expect(json.total_chunks).toBe(1)

    const r2Objects = (env.R2 as unknown as { objects: Map<string, string> }).objects
    const keys = Array.from(r2Objects.keys())
    expect(keys.length).toBe(1)
    expect(keys[0]).toMatch(/^tenant-1\/run-001\/[a-f0-9]+\/0$/)

    const { runs } = env.DB as unknown as { runs: { sql: string; params: unknown[] }[] }
    const sqls = runs.map(r => r.sql)
    expect(sqls.some(s => s.includes('INSERT OR IGNORE INTO files'))).toBe(true)
    expect(sqls.some(s => s.includes('INSERT OR IGNORE INTO audit_sessions'))).toBe(true)
  })

  it('persists repo_url, branch, and commit_sha in audit_sessions', async () => {
    const files: Record<string, Uint8Array> = {
      'repo-main/src/index.ts': new TextEncoder().encode('console.log("hello")'),
    }
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      zip(files, {}, (err, data) => {
        if (err) reject(err)
        else resolve(data.buffer)
      })
    })

    const formData = new FormData()
    formData.append('audit_run_id', 'run-repo-meta')
    formData.append('zip', new Blob([buffer], { type: 'application/zip' }))
    formData.append('repo_url', 'https://github.com/example/repo')
    formData.append('branch', 'develop')
    formData.append('commit_sha', 'abc123def')

    const request = new Request('https://example.com/ingest', {
      method: 'POST',
      headers: { 'X-Tenant-Id': 'tenant-meta' },
      body: formData,
    })

    const env = makeEnv()
    const response = await ingestionWorker.fetch(request, env)
    expect(response.status).toBe(200)

    const { runs } = env.DB as unknown as { runs: { sql: string; params: unknown[] }[] }
    const sessionRun = runs.find(r => r.sql.includes('INSERT OR IGNORE INTO audit_sessions'))
    expect(sessionRun).toBeDefined()
    expect(sessionRun?.params).toContain('https://github.com/example/repo')
    expect(sessionRun?.params).toContain('develop')
    expect(sessionRun?.params).toContain('abc123def')

    const updateRun = runs.find(r => r.sql.includes('UPDATE audit_sessions SET') && r.sql.includes('repo_url'))
    expect(updateRun).toBeDefined()
  })
  it('returns 400 for an empty files array', async () => {
    const env = makeEnv()
    const body = JSON.stringify({ audit_run_id: 'run-001', files: [] })
    const request = new Request('https://example.com/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'tenant-1' },
      body,
    })
    const response = await ingestionWorker.fetch(request, env)
    expect(response.status).toBe(400)
  })

  it('accepts a zip upload', async () => {
    const files: Record<string, Uint8Array> = {
      'repo-main/src/auth.ts': new TextEncoder().encode('const token = req.headers.authorization'),
      'repo-main/src/app/page.tsx': new TextEncoder().encode('export default function Page() {}'),
    }
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      zip(files, {}, (err, data) => {
        if (err) reject(err)
        else resolve(data.buffer)
      })
    })

    const formData = new FormData()
    formData.append('audit_run_id', 'run-zip-001')
    formData.append('zip', new Blob([buffer], { type: 'application/zip' }))

    const request = new Request('https://example.com/ingest', {
      method: 'POST',
      headers: { 'X-Tenant-Id': 'tenant-zip' },
      body: formData,
    })

    const env = makeEnv()
    const response = await ingestionWorker.fetch(request, env)
    expect(response.status).toBe(200)
    const json = await response.json() as { file_count: number }
    expect(json.file_count).toBe(2)

    const r2Objects = (env.R2 as unknown as { objects: Map<string, string> }).objects
    const keys = Array.from(r2Objects.keys())
    expect(keys.length).toBe(2)
    expect(keys.every(k => k.startsWith('tenant-zip/run-zip-001/'))).toBe(true)
  })
})
