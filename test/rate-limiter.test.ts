import { describe, it, expect } from 'vitest'
import {
  checkRateLimitCounters,
  checkRateLimit,
  checkAgentRateLimit,
  READ_LIMIT_PER_MINUTE,
  WRITE_LIMIT_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
} from '../src/lib/rate-limit'

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

function makeStatefulRateLimiterDO(): { namespace: DurableObjectNamespace; requests: Array<Record<string, unknown>> } {
  const requests: Array<Record<string, unknown>> = []
  return {
    requests,
    namespace: {
      idFromName: () => ({ toString: () => 'rate-limiter-id' }),
      get: () => ({
        fetch: async (request: Request) => {
          const body = await request.json() as Record<string, unknown>
          requests.push(body)
          return new Response(JSON.stringify({ allowed: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        },
      }),
    } as unknown as DurableObjectNamespace,
  }
}

describe('rate-limit', () => {
  describe('checkRateLimitCounters', () => {
    it('allows GET requests up to the read limit', () => {
      let counters = { readWindow: 0, readCount: 0, writeWindow: 0, writeCount: 0, llmAgentWindow: 0, llmAgentCount: 0 }
      const windowStart = 1_000_000

      for (let i = 0; i < READ_LIMIT_PER_MINUTE; i++) {
        const result = checkRateLimitCounters(counters, 'read', READ_LIMIT_PER_MINUTE, windowStart)
        expect(result.response.allowed).toBe(true)
        counters = result.counters
      }

      const over = checkRateLimitCounters(counters, 'read', READ_LIMIT_PER_MINUTE, windowStart)
      expect(over.response.allowed).toBe(false)
    })

    it('allows POST requests up to the write limit', () => {
      let counters = { readWindow: 0, readCount: 0, writeWindow: 0, writeCount: 0, llmAgentWindow: 0, llmAgentCount: 0 }
      const windowStart = 2_000_000

      for (let i = 0; i < WRITE_LIMIT_PER_MINUTE; i++) {
        const result = checkRateLimitCounters(counters, 'write', WRITE_LIMIT_PER_MINUTE, windowStart)
        expect(result.response.allowed).toBe(true)
        counters = result.counters
      }

      const over = checkRateLimitCounters(counters, 'write', WRITE_LIMIT_PER_MINUTE, windowStart)
      expect(over.response.allowed).toBe(false)
    })

    it('allows LLM agent calls up to the configured limit', () => {
      let counters = { readWindow: 0, readCount: 0, writeWindow: 0, writeCount: 0, llmAgentWindow: 0, llmAgentCount: 0 }
      const windowStart = 3_000_000
      const limit = 10

      for (let i = 0; i < limit; i++) {
        const result = checkRateLimitCounters(counters, 'llm-agent', limit, windowStart)
        expect(result.response.allowed).toBe(true)
        counters = result.counters
      }

      const over = checkRateLimitCounters(counters, 'llm-agent', limit, windowStart)
      expect(over.response.allowed).toBe(false)
    })

    it('resets counters when the window changes', () => {
      let counters = { readWindow: 0, readCount: 0, writeWindow: 0, writeCount: 0, llmAgentWindow: 0, llmAgentCount: 0 }
      const first = checkRateLimitCounters(counters, 'read', READ_LIMIT_PER_MINUTE, 4_000_000)
      expect(first.response.allowed).toBe(true)

      const next = checkRateLimitCounters(first.counters, 'read', READ_LIMIT_PER_MINUTE, 4_000_000 + RATE_LIMIT_WINDOW_MS)
      expect(next.response.count).toBe(1)
      expect(next.response.allowed).toBe(true)
    })
  })

  describe('checkRateLimit', () => {
    it('returns false when the DO rejects the request', async () => {
      const doNamespace = makeMockRateLimiterDO(false)
      const request = new Request('https://example.com/api', { method: 'POST' })
      const allowed = await checkRateLimit(request, 'tenant-1', doNamespace)
      expect(allowed).toBe(false)
    })

    it('returns true when the DO allows the request', async () => {
      const doNamespace = makeMockRateLimiterDO(true)
      const request = new Request('https://example.com/api', { method: 'GET' })
      const allowed = await checkRateLimit(request, 'tenant-1', doNamespace)
      expect(allowed).toBe(true)
    })

    it('sends write bucket and limit for POST requests', async () => {
      const { namespace, requests } = makeStatefulRateLimiterDO()
      const request = new Request('https://example.com/api', { method: 'POST' })
      await checkRateLimit(request, 'tenant-1', namespace)
      expect(requests.length).toBe(1)
      expect(requests[0]?.bucket).toBe('write')
      expect(requests[0]?.limit).toBe(WRITE_LIMIT_PER_MINUTE)
    })

    it('bypasses rate limit for priority requests', async () => {
      const { namespace, requests } = makeStatefulRateLimiterDO()
      const request = new Request('https://example.com/api', {
        method: 'POST',
        headers: { 'X-Priority': 'salvation' },
      })
      await checkRateLimit(request, 'tenant-1', namespace)
      expect(requests[0]?.priority).toBe(true)
    })
  })

  describe('checkAgentRateLimit', () => {
    it('sends llm-agent bucket with configurable limit', async () => {
      const { namespace, requests } = makeStatefulRateLimiterDO()
      await checkAgentRateLimit('tenant-1', 'run-001', 'agent-1', namespace, 10, false)
      expect(requests.length).toBe(1)
      expect(requests[0]?.bucket).toBe('llm-agent')
      expect(requests[0]?.limit).toBe(10)
    })

    it('bypasses limit for priority agent calls', async () => {
      const { namespace, requests } = makeStatefulRateLimiterDO()
      await checkAgentRateLimit('tenant-1', 'run-001', 'agent-1', namespace, 10, true)
      expect(requests[0]?.priority).toBe(true)
    })
  })
})
