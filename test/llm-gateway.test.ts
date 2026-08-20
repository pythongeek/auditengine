import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildEndpoint, getApiKey, hasAnyProviderKey, llmCall } from '../src/lib/llm-gateway'
import { storeProviderApiKey } from '../src/lib/settings'
import type { Env } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    AI_GATEWAY_URL: overrides.AI_GATEWAY_URL,
    ENCRYPTION_KEY: 'test-encryption-key-32bytes-long!',
    KIMI_API_KEY: '',
    MINIMAX_API_KEY: '',
    RATE_LIMIT_DO: {
      idFromName: () => ({ toString: () => 'rate-limit-id' }),
      get: () => ({
        fetch: async () => new Response(JSON.stringify({ allowed: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      }),
    } as unknown as DurableObjectNamespace,
    ...overrides,
  } as Env
}

function makeMockD1(): D1Database {
  const rows = new Map<string, { value: string }>()
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: () => {
          const lower = sql.toLowerCase()
          if (lower.includes('from app_settings')) {
            const row = rows.get(args[0] as string)
            return Promise.resolve(row ?? null)
          }
          if (lower.includes('from audit_sessions')) {
            return Promise.resolve({ tenant_id: 'tenant-1' })
          }
          if (lower.includes('from tenants')) {
            return Promise.resolve({ plan: 'free' })
          }
          if (lower.includes('from agent_config')) {
            return Promise.resolve(null)
          }
          if (lower.includes('from run_budget')) {
            return Promise.resolve({ paused: 0 })
          }
          return Promise.resolve(null)
        },
        all: () => {
          const lower = sql.toLowerCase()
          if (lower.includes('from token_usage')) {
            return Promise.resolve({ results: [] })
          }
          if (lower.includes('from app_settings')) {
            return Promise.resolve({ results: Array.from(rows.entries()).map(([key, value]) => ({ key, ...value })) })
          }
          return Promise.resolve({ results: [] })
        },
        run: () => {
          const lower = sql.toLowerCase()
          if (lower.includes('insert or replace into app_settings')) {
            rows.set(args[0] as string, { value: args[1] as string })
          }
          if (lower.includes('insert into token_usage')) {
            return Promise.resolve({ changes: 1, meta: {} })
          }
          return Promise.resolve({ changes: 1, meta: {} })
        },
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
}

describe('llm-gateway buildEndpoint', () => {
  it('uses direct provider endpoints when AI_GATEWAY_URL is absent', () => {
    const env = makeEnv()
    expect(buildEndpoint('kimi-k3', env)).toBe('https://api.moonshot.cn/v1/chat/completions')
    expect(buildEndpoint('kimi-k2.6', env)).toBe('https://api.moonshot.cn/v1/chat/completions')
    expect(buildEndpoint('minimax-m3', env)).toBe('https://api.minimax.chat/v1/text/chatcompletion_pro')
  })

  it('routes through the AI Gateway when configured', () => {
    const env = makeEnv({ AI_GATEWAY_URL: 'https://gateway.ai.cloudflare.com/v1/acme/prod' })
    expect(buildEndpoint('kimi-k3', env)).toBe('https://gateway.ai.cloudflare.com/v1/acme/prod/kimi/v1/chat/completions')
    expect(buildEndpoint('minimax-m3', env)).toBe('https://gateway.ai.cloudflare.com/v1/acme/prod/minimax/v1/text/chatcompletion_pro')
  })

  it('strips a trailing slash from the gateway URL', () => {
    const env = makeEnv({ AI_GATEWAY_URL: 'https://gateway.ai.cloudflare.com/v1/acme/prod/' })
    expect(buildEndpoint('kimi-k2.6', env)).toBe('https://gateway.ai.cloudflare.com/v1/acme/prod/kimi/v1/chat/completions')
  })
})

describe('llm-gateway getApiKey', () => {
  it('returns the env key when present', async () => {
    const db = makeMockD1()
    const env = makeEnv({ KIMI_API_KEY: 'env-kimi-key' })
    expect(await getApiKey('kimi', env, db)).toBe('env-kimi-key')
  })

  it('falls back to an encrypted key stored in app_settings', async () => {
    const db = makeMockD1()
    const env = makeEnv({ KIMI_API_KEY: '' })
    await storeProviderApiKey(db, 'minimax', env.ENCRYPTION_KEY, 'stored-minimax-key')

    expect(await getApiKey('minimax', env, db)).toBe('stored-minimax-key')
  })

  it('returns null when no key is configured', async () => {
    const db = makeMockD1()
    const env = makeEnv({ KIMI_API_KEY: '' })
    expect(await getApiKey('kimi', env, db)).toBeNull()
  })
})

describe('llm-gateway hasAnyProviderKey', () => {
  it('returns true when at least one provider key is configured', async () => {
    const db = makeMockD1()
    const env = makeEnv({ KIMI_API_KEY: 'env-kimi-key' })
    expect(await hasAnyProviderKey(env, db)).toBe(true)
  })

  it('returns false when no provider keys are configured', async () => {
    const db = makeMockD1()
    const env = makeEnv({ KIMI_API_KEY: '', MINIMAX_API_KEY: '' })
    expect(await hasAnyProviderKey(env, db)).toBe(false)
  })
})

describe('llm-gateway llmCall provider fallback', () => {
  it('falls back to minimax when the routed provider (kimi) has no key', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toContain('minimax')
      return new Response(JSON.stringify({
        choices: [{ messages: [{ text: 'fallback response' }] }],
        usage: { total_tokens: 10 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))

    const db = makeMockD1()
    const env = makeEnv({ KIMI_API_KEY: '', MINIMAX_API_KEY: 'env-minimax-key' })
    await storeProviderApiKey(db, 'minimax', env.ENCRYPTION_KEY, 'stored-minimax-key')

    const response = await llmCall({
      agentId: 'agent-1',
      agentType: 'security',
      taskType: 'deep_audit',
      messages: [{ role: 'user', content: 'analyze this' }],
      auditRunId: 'run-001',
      db,
      broadcast: () => {},
    }, env)

    expect(response.text).toBe('fallback response')
  })

  it('falls back to kimi when the routed provider (minimax) has no key', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toContain('moonshot')
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'kimi fallback' } }],
        usage: { prompt_tokens: 5, completion_tokens: 5 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))

    const db = makeMockD1()
    const env = makeEnv({ KIMI_API_KEY: 'env-kimi-key', MINIMAX_API_KEY: '' })

    const response = await llmCall({
      agentId: 'agent-1',
      agentType: 'documentation',
      taskType: 'log_summary',
      messages: [{ role: 'user', content: 'summarize' }],
      auditRunId: 'run-001',
      db,
      broadcast: () => {},
    }, env)

    expect(response.text).toBe('kimi fallback')
  })

  it('throws a clear error when neither provider key is configured', async () => {
    const db = makeMockD1()
    const env = makeEnv({ KIMI_API_KEY: '', MINIMAX_API_KEY: '' })

    await expect(llmCall({
      agentId: 'agent-1',
      agentType: 'security',
      taskType: 'deep_audit',
      messages: [{ role: 'user', content: 'analyze this' }],
      auditRunId: 'run-001',
      db,
      broadcast: () => {},
    }, env)).rejects.toThrow(/no api key configured/i)
  })
})
