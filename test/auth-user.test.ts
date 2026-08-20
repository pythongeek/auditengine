import { describe, it, expect } from 'vitest'
import {
  hashPassword,
  verifyPassword,
  createUserSession,
  verifyUserSession,
  revokeUserSession,
  authenticate,
} from '../src/lib/auth'
import { handleLogin, handleRegister, handleTenantCreate } from '../src/lib/router'
import { makeMockEnvStrings } from './helpers'
import type { Env } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

function makeInMemoryD1(): D1Database {
  const tables: Record<string, Record<string, unknown>[]> = {
    tenants: [],
    users: [],
    user_sessions: [],
  }

  const db = {
    prepare: (sql: string) => {
      const lower = sql.toLowerCase()
      return {
        bind: (...params: unknown[]) => ({
          run: async () => {
            if (lower.includes('insert into tenants')) {
              tables.tenants.push({
                id: params[0],
                name: params[1],
                plan: params[2],
                created_at: Date.now(),
                updated_at: Date.now(),
              })
            } else if (lower.includes('insert into users')) {
              tables.users.push({
                id: params[0],
                tenant_id: params[1],
                email: params[2],
                password_hash: params[3],
                role: params[4],
                created_at: params[5],
                updated_at: params[6],
              })
            } else if (lower.includes('insert into user_sessions')) {
              tables.user_sessions.push({
                id: params[0],
                user_id: params[1],
                tenant_id: params[2],
                token_hash: params[3],
                expires_at: params[4],
                created_at: params[5],
              })
            } else if (lower.includes('update user_sessions') && lower.includes('revoked_at')) {
              const tokenHash = params[0] as string
              const row = tables.user_sessions.find(r => r.token_hash === tokenHash && r.revoked_at === undefined)
              if (row) row.revoked_at = Math.floor(Date.now() / 1000)
            }
            return { changes: 1, meta: {} }
          },
          first: async () => {
            if (lower.includes('from tenants where id = ?')) {
              return tables.tenants.find(t => t.id === params[0]) ?? null
            }
            if (lower.includes('from users') && lower.includes('where u.tenant_id = ? and u.email = ?')) {
              const tenantId = params[0]
              const email = params[1]
              const user = tables.users.find(u => u.tenant_id === tenantId && u.email === email)
              if (!user) return null
              return {
                id: user.id,
                tenant_id: user.tenant_id,
                email: user.email,
                password_hash: user.password_hash,
                role: user.role,
                plan: 'free',
              }
            }
            if (lower.includes('from users where tenant_id = ? and email = ?')) {
              return tables.users.find(u => u.tenant_id === params[0] && u.email === params[1]) ?? null
            }
            if (lower.includes('from user_sessions') && lower.includes('token_hash = ?')) {
              return tables.user_sessions.find(
                s => s.token_hash === params[0] && s.revoked_at === undefined && (s.expires_at as number) > Math.floor(Date.now() / 1000)
              ) ?? null
            }
            return null
          },
          all: async () => ({ results: [] }),
        }),
      }
    },
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database

  return db
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...makeMockEnvStrings({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'adminpass' }),
    ...overrides,
    DB: makeInMemoryD1(),
    R2: {} as R2Bucket,
  } as Env
}

describe('auth-user password hashing', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(hash).toContain(':')
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true)
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('any', 'notahash')).toBe(false)
  })
})

describe('auth-user session lifecycle', () => {
  it('creates and verifies a user session', async () => {
    const env = makeEnv()
    const userId = 'user-001'
    const tenantId = 'tenant-001'
    await env.DB.prepare('INSERT INTO tenants (id, name, plan) VALUES (?, ?, ?)').bind(tenantId, tenantId, 'free').run()

    const token = await createUserSession(userId, tenantId, env.DB)
    expect(token.length).toBeGreaterThan(0)

    const request = new Request('https://localhost/', {
      headers: { Authorization: 'Bearer ' + token },
    })
    const auth = await verifyUserSession(request, env)
    expect(auth.tenantId).toBe(tenantId)
    expect(auth.userId).toBe(userId)
  })

  it('revokes a user session', async () => {
    const env = makeEnv()
    const tenantId = 'tenant-001'
    await env.DB.prepare('INSERT INTO tenants (id, name, plan) VALUES (?, ?, ?)').bind(tenantId, tenantId, 'free').run()

    const token = await createUserSession('user-001', tenantId, env.DB)
    const request = new Request('https://localhost/?token=' + token)

    await revokeUserSession(request, env)
    await expect(verifyUserSession(request, env)).rejects.toThrow('Invalid or expired session token')
  })
})

describe('auth-user login/register handlers', () => {
  it('registers a user and logs them in', async () => {
    const env = makeEnv()
    const tenantRes = await handleTenantCreate(env, {
      name: 'Test Tenant',
      admin_email: 'admin@test.com',
      admin_password: 'secret123',
    })
    expect(tenantRes.status).toBe(201)
    const tenantData = await tenantRes.json() as { tenant: { id: string } }
    const tenantId = tenantData.tenant.id

    const loginRes = await handleLogin(env, {
      tenant_id: tenantId,
      email: 'admin@test.com',
      password: 'secret123',
    })
    expect(loginRes.status).toBe(200)
    const loginData = await loginRes.json() as { token: string; user: { role: string } }
    expect(loginData.token).toBeDefined()
    expect(loginData.user.role).toBe('admin')
  })

  it('rejects login with wrong password', async () => {
    const env = makeEnv()
    const tenantRes = await handleTenantCreate(env, {
      name: 'Test Tenant',
      admin_email: 'admin@test.com',
      admin_password: 'secret123',
    })
    const tenantData = await tenantRes.json() as { tenant: { id: string } }
    const tenantId = tenantData.tenant.id

    const loginRes = await handleLogin(env, {
      tenant_id: tenantId,
      email: 'admin@test.com',
      password: 'wrong',
    })
    expect(loginRes.status).toBe(401)
  })

  it('allows admin to register additional users', async () => {
    const env = makeEnv()
    const tenantRes = await handleTenantCreate(env, { name: 'Test Tenant' })
    const tenantData = await tenantRes.json() as { tenant: { id: string } }
    const tenantId = tenantData.tenant.id

    const registerRes = await handleRegister(env, {
      tenant_id: tenantId,
      email: 'member@test.com',
      password: 'memberpass',
      role: 'member',
    })
    expect(registerRes.status).toBe(201)

    const loginRes = await handleLogin(env, {
      tenant_id: tenantId,
      email: 'member@test.com',
      password: 'memberpass',
    })
    expect(loginRes.status).toBe(200)
  })
})

describe('auth-user authenticate fallback', () => {
  it('accepts a user session token when no JWT is present', async () => {
    const env = makeEnv()
    const tenantId = 'tenant-001'
    await env.DB.prepare('INSERT INTO tenants (id, name, plan) VALUES (?, ?, ?)').bind(tenantId, tenantId, 'free').run()

    const token = await createUserSession('user-001', tenantId, env.DB)
    const request = new Request('https://localhost/', {
      headers: { Authorization: 'Bearer ' + token },
    })
    const auth = await authenticate(request, env)
    expect(auth.tenantId).toBe(tenantId)
  })
})
