import { describe, it, expect, vi } from 'vitest'
import { listMaskedSettings, storeProviderApiKey, getProviderApiKey } from '../src/lib/settings'
import { handleSettingsKeysGet, handleSettingsKeysPost } from '../src/lib/router'
import type { Env } from '../src/types/index'

function makeMockD1(): D1Database {
  const rows = new Map<string, { value: string; updated_at: number }>()
  const logs: unknown[] = []

  return {
    prepare: vi.fn((sql: string) => {
      const lower = sql.toLowerCase()
      const runBound = (args: unknown[]) => {
        if (lower.includes('insert or replace into app_settings')) {
          rows.set(args[0] as string, { value: args[1] as string, updated_at: args[2] as number })
        } else if (lower.includes('delete from app_settings')) {
          rows.delete(args[0] as string)
        } else if (lower.includes('insert into audit_logs')) {
          logs.push(args)
        }
        return Promise.resolve({ changes: 1, meta: {} })
      }
      return {
        bind: vi.fn((...args: unknown[]) => ({
          first: () => {
            if (lower.includes('from app_settings')) {
              const key = args[0] as string
              const row = rows.get(key)
              return Promise.resolve(row ?? null)
            }
            return Promise.resolve(null)
          },
          run: () => runBound(args),
          all: () => runBound(args),
        })),
        all: () => {
          if (lower.includes('from app_settings order by key')) {
            return Promise.resolve({
              results: Array.from(rows.entries()).map(([key, row]) => ({ key, ...row })),
            })
          }
          return Promise.resolve({ results: [] })
        },
      }
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
    getRows: () => rows,
    getLogs: () => logs,
  } as unknown as D1Database
}

function makeEnv(db: D1Database): Env {
  return {
    DB: db,
    ENCRYPTION_KEY: 'test-encryption-key-32bytes-long!',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'admin-password',
  } as Env
}

function adminRequest(method: string, body?: unknown): Request {
  const headers = new Headers({
    Authorization: 'Basic ' + btoa('admin@example.com:admin-password'),
  })
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  return new Request('https://localhost/api/v1/settings/keys', {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('settings module', () => {
  it('encrypts, stores, and decrypts a provider API key', async () => {
    const db = makeMockD1()
    const encryptionKey = 'test-encryption-key-32bytes-long!'

    await storeProviderApiKey(db, 'kimi', encryptionKey, 'sk-kimi-secret')
    const decrypted = await getProviderApiKey(db, 'kimi', encryptionKey, '')

    expect(decrypted).toBe('sk-kimi-secret')
  })

  it('deletes a stored key when given an empty string', async () => {
    const db = makeMockD1()
    const encryptionKey = 'test-encryption-key-32bytes-long!'

    await storeProviderApiKey(db, 'minimax', encryptionKey, 'minimax-secret')
    expect(await getProviderApiKey(db, 'minimax', encryptionKey, '')).toBe('minimax-secret')

    await storeProviderApiKey(db, 'minimax', encryptionKey, '')
    expect(await getProviderApiKey(db, 'minimax', encryptionKey, '')).toBeNull()
  })

  it('masks sensitive values in listMaskedSettings', async () => {
    const db = makeMockD1()
    const encryptionKey = 'test-encryption-key-32bytes-long!'

    await storeProviderApiKey(db, 'kimi', encryptionKey, 'sk-kimi-1234')
    await storeProviderApiKey(db, 'minimax', encryptionKey, 'mini-5678')

    const rows = await listMaskedSettings(db)
    const kimi = rows.find(r => r.key === 'kimi_api_key')
    const minimax = rows.find(r => r.key === 'minimax_api_key')

    expect(kimi?.value).not.toContain('sk-kimi-1234')
    expect(kimi?.value).toContain('•')
    expect(minimax?.value).not.toContain('mini-5678')
    expect(minimax?.value).toContain('•')
  })
})

describe('settings API handlers', () => {
  it('GET /api/v1/settings/keys returns masked keys for admin', async () => {
    const db = makeMockD1()
    const env = makeEnv(db)
    await storeProviderApiKey(db, 'kimi', env.ENCRYPTION_KEY, 'sk-admin-kimi')

    const res = await handleSettingsKeysGet(env, adminRequest('GET'))
    const data = await res.json() as { keys: Array<{ key: string; value: string }> }

    expect(res.status).toBe(200)
    const kimi = data.keys.find(k => k.key === 'kimi_api_key')
    expect(kimi?.value).toContain('•')
    expect(kimi?.value).not.toContain('sk-admin-kimi')
  })

  it('POST /api/v1/settings/keys stores encrypted keys and returns saved status', async () => {
    const db = makeMockD1()
    const env = makeEnv(db)

    const res = await handleSettingsKeysPost(
      env,
      adminRequest('POST', { kimi_api_key: 'sk-new', minimax_api_key: '' }),
      { kimi_api_key: 'sk-new', minimax_api_key: '' }
    )
    const data = await res.json() as { success: boolean; saved: Record<string, boolean> }

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.saved.kimi_api_key).toBe(true)
    expect(data.saved.minimax_api_key).toBe(false)

    const decrypted = await getProviderApiKey(db, 'kimi', env.ENCRYPTION_KEY, '')
    expect(decrypted).toBe('sk-new')
  })

  it('rejects non-admin requests', async () => {
    const db = makeMockD1()
    const env = makeEnv(db)

    const req = new Request('https://localhost/api/v1/settings/keys', {
      method: 'GET',
      headers: { Authorization: 'Basic ' + btoa('wrong:creds') },
    })

    const res = await handleSettingsKeysGet(env, req)
    expect(res.status).toBe(401)
  })
})
