import { describe, it, expect, vi } from 'vitest'
import worker from '../src/index'
import { createToken } from '../src/lib/auth'
import { makeMockAgentNamespaces, makeMockWorkflows } from './helpers'
import type { Env, QueuedWriteRequest } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

function makeMockD1(): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: () => Promise.resolve(null),
        run: () => Promise.resolve({ changes: 1, meta: {} }),
        all: () => Promise.resolve({ results: [] }),
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
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

function makeMockQueue(): { queue: Queue; sent: QueuedWriteRequest[] } {
  const sent: QueuedWriteRequest[] = []
  const queue = {
    send: async (message: QueuedWriteRequest) => {
      sent.push(message)
      return { metadata: { metrics: { backlogCount: sent.length, backlogBytes: 0, oldestMessageTimestamp: Date.now() } } }
    },
    sent,
  } as unknown as Queue
  return { queue, sent }
}

function makeMockMessage(body: QueuedWriteRequest) {
  const ack = vi.fn()
  const retry = vi.fn()
  const message = {
    id: 'msg-1',
    timestamp: new Date(),
    body,
    attempts: 1,
    ack,
    retry,
  } as unknown as Message<QueuedWriteRequest>
  return { message, ack, retry }
}

function makeMockBatch(messages: Message<QueuedWriteRequest>[]) {
  return {
    queue: 'auditengine-write-queue',
    messages,
    ackAll: () => {},
    retryAll: () => {},
  } as unknown as MessageBatch<QueuedWriteRequest>
}

async function makeEnv(overrides: Partial<Env> = {}): Promise<Env> {
  const { queue, sent } = makeMockQueue()
  return {
    DB: makeMockD1(),
    R2: {} as R2Bucket,
    ...makeMockAgentNamespaces(),
    COORDINATOR_DO: {} as DurableObjectNamespace,
    DASHBOARD_DO: {} as DurableObjectNamespace,
    RATE_LIMIT_DO: makeMockRateLimiterDO(false),
    ...makeMockWorkflows(),
    WRITE_QUEUE: queue,
    BROWSER: {} as Fetcher,
    KIMI_API_KEY: '',
    MINIMAX_API_KEY: '',
    GITHUB_TOKEN: '',
    JWT_SECRET: 'test-secret',
    STAGING_URL: '',
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD: '',
    ...overrides,
  }
}

async function authHeader(tenantId: string): Promise<{ Authorization: string }> {
  const token = await createToken(tenantId, 'test-secret')
  return { Authorization: `Bearer ${token}` }
}

describe('write queue', () => {
  it('returns 202 and enqueues a rate-limited PATCH /config request', async () => {
    const env = await makeEnv()
    const headers = await authHeader('tenant-1')
    const request = new Request('https://example.com/api/v1/tenants/tenant-1/config', {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'security', updates: { temperature: 0.2 } }),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(202)
    const body = await response.json() as { queued: boolean; queue_size: number }
    expect(body.queued).toBe(true)
    expect(body.queue_size).toBe(1)

    const sent = (env.WRITE_QUEUE as unknown as { sent: QueuedWriteRequest[] }).sent
    expect(sent.length).toBe(1)
    expect(sent[0].tenantId).toBe('tenant-1')
    expect(sent[0].method).toBe('PATCH')
    expect(sent[0].pathname).toBe('/api/v1/tenants/tenant-1/config')
    expect(sent[0].contentType).toBe('application/json')
    expect(JSON.parse(atob(sent[0].body))).toEqual({ agent_id: 'security', updates: { temperature: 0.2 } })
  })

  it('returns 429 for a rate-limited GET /score request', async () => {
    const env = await makeEnv()
    const headers = await authHeader('tenant-1')
    const request = new Request('https://example.com/api/v1/tenants/tenant-1/score', {
      method: 'GET',
      headers,
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(429)
  })

  it('bypasses the queue for priority requests', async () => {
    const env = await makeEnv({ RATE_LIMIT_DO: makeMockRateLimiterDO(false) })
    const headers = await authHeader('tenant-1')
    const request = new Request('https://example.com/api/v1/tenants/tenant-1/config', {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', 'X-Priority': 'salvation' },
      body: JSON.stringify({ agent_id: 'security', updates: { temperature: 0.2 } }),
    })

    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)

    expect(response.status).toBe(200)
    const sent = (env.WRITE_QUEUE as unknown as { sent: QueuedWriteRequest[] }).sent
    expect(sent.length).toBe(0)
  })

  it('processes an enqueued PATCH /config request', async () => {
    const env = await makeEnv({ RATE_LIMIT_DO: makeMockRateLimiterDO(true) })
    const body: QueuedWriteRequest = {
      tenantId: 'tenant-1',
      method: 'PATCH',
      pathname: '/api/v1/tenants/tenant-1/config',
      body: btoa(JSON.stringify({ agent_id: 'security', updates: { temperature: 0.2 } })),
      contentType: 'application/json',
      priority: false,
      receivedAt: Date.now(),
    }
    const { message, ack, retry } = makeMockMessage(body)
    const batch = makeMockBatch([message])

    await (worker as { queue: (batch: MessageBatch<QueuedWriteRequest>, env: Env) => Promise<void> }).queue(batch, env)

    expect(ack).toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()
  })

  it('acks a message that produces a 4xx response', async () => {
    const env = await makeEnv({ RATE_LIMIT_DO: makeMockRateLimiterDO(true) })
    const body: QueuedWriteRequest = {
      tenantId: 'tenant-1',
      method: 'PATCH',
      pathname: '/api/v1/tenants/tenant-1/config',
      body: btoa(JSON.stringify({ agent_id: 'invalid-agent', updates: {} })),
      contentType: 'application/json',
      priority: false,
      receivedAt: Date.now(),
    }
    const { message, ack, retry } = makeMockMessage(body)
    const batch = makeMockBatch([message])

    await (worker as { queue: (batch: MessageBatch<QueuedWriteRequest>, env: Env) => Promise<void> }).queue(batch, env)

    expect(ack).toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()
  })

  it('retries a message when the handler throws', async () => {
    const env = await makeEnv({
      RATE_LIMIT_DO: makeMockRateLimiterDO(true),
      DB: {
        prepare: () => ({
          bind: () => ({
            first: () => Promise.reject(new Error('DB unavailable')),
            run: () => Promise.reject(new Error('DB unavailable')),
            all: () => Promise.resolve({ results: [] }),
          }),
        }),
        batch: () => Promise.reject(new Error('DB unavailable')),
        dump: () => Promise.resolve(new ArrayBuffer(0)),
        exec: () => Promise.resolve({ count: 0, duration: 0 }),
      } as unknown as D1Database,
    })
    const body: QueuedWriteRequest = {
      tenantId: 'tenant-1',
      method: 'PATCH',
      pathname: '/api/v1/tenants/tenant-1/config',
      body: btoa(JSON.stringify({ agent_id: 'security', updates: { temperature: 0.2 } })),
      contentType: 'application/json',
      priority: false,
      receivedAt: Date.now(),
    }
    const { message, ack, retry } = makeMockMessage(body)
    const batch = makeMockBatch([message])

    await (worker as { queue: (batch: MessageBatch<QueuedWriteRequest>, env: Env) => Promise<void> }).queue(batch, env)

    expect(retry).toHaveBeenCalled()
    expect(ack).not.toHaveBeenCalled()
  })
})
