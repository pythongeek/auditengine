import { describe, it, expect } from 'vitest'
import { buildEndpoint, getApiKey } from '../src/lib/llm-gateway'
import { storeProviderApiKey } from '../src/lib/settings'
import type { Env } from '../src/types/index'

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    AI_GATEWAY_URL: overrides.AI_GATEWAY_URL,
    ENCRYPTION_KEY: 'test-encryption-key-32bytes-long!',
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
          return Promise.resolve(null)
        },
        run: () => {
          const lower = sql.toLowerCase()
          if (lower.includes('insert or replace into app_settings')) {
            rows.set(args[0] as string, { value: args[1] as string })
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
