import type { Env, AuthContext } from '../types/index'

function base64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes
  let binary = ''
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64urlDecode(input: string): Uint8Array {
  const normalized = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padLen = (4 - (normalized.length % 4)) % 4
  const padded = normalized + '='.repeat(padLen)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function createToken(
  tenantId: string,
  secret: string,
  plan = 'free',
  expiresInSeconds = 3600
): Promise<string> {
  const header = base64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const now = Math.floor(Date.now() / 1000)
  const payload = base64urlEncode(
    new TextEncoder().encode(
      JSON.stringify({ sub: tenantId, plan, iat: now, exp: now + expiresInSeconds })
    )
  )
  const signingInput = `${header}.${payload}`
  const key = await importHmacKey(secret)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput)
  )
  return `${signingInput}.${base64urlEncode(signature)}`
}

export async function verifyToken(token: string, secret: string): Promise<{ sub: string; plan: string }> {
  const [headerB64, payloadB64, signatureB64] = token.split('.')
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error('Invalid token format')
  }

  const signingInput = `${headerB64}.${payloadB64}`
  const key = await importHmacKey(secret)
  const signature = base64urlDecode(signatureB64)
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature.buffer as ArrayBuffer,
    new TextEncoder().encode(signingInput).buffer as ArrayBuffer
  )
  if (!valid) {
    throw new Error('Invalid token signature')
  }

  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64))) as {
    sub?: string
    plan?: string
    exp?: number
  }
  if (!payload.sub) {
    throw new Error('Missing tenant claim')
  }
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired')
  }

  return { sub: payload.sub, plan: payload.plan ?? 'free' }
}

export async function authenticate(request: Request, env: Env): Promise<AuthContext> {
  const url = new URL(request.url)
  let token: string | null = null

  const authHeader = request.headers.get('Authorization')
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim()
  }

  if (!token) {
    token = url.searchParams.get('token')
  }

  if (!token) {
    throw new Error('Missing Authorization token')
  }

  // Tenant JWTs are three-segment HS256 tokens. Session tokens are base64url
  // random strings without dots. Try JWT first, then session token.
  if (token.split('.').length === 3) {
    const { sub, plan } = await verifyToken(token, env.JWT_SECRET)
    return { tenantId: sub, plan: plan ?? 'free' }
  }

  return verifyUserSession(request, env)
}

export async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.toLowerCase().startsWith('basic ')) {
    return false
  }
  const encoded = authHeader.slice(6).trim()
  let decoded: string
  try {
    decoded = atob(encoded)
  } catch {
    return false
  }
  const [email, password] = decoded.split(':')
  return email === env.ADMIN_EMAIL && password === env.ADMIN_PASSWORD
}

export async function ensureTenant(tenantId: string, db: D1Database): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO tenants (id, name, plan) VALUES (?, ?, ?)')
    .bind(tenantId, tenantId, 'free')
    .run()
}

const PBKDF2_ITERATIONS = 100_000
const SESSION_TOKEN_BYTES = 32

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as unknown as ArrayBuffer
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  )
  return `${base64urlEncode(new Uint8Array(salt))}:${base64urlEncode(new Uint8Array(derived))}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltB64, hashB64] = storedHash.split(':')
  if (!saltB64 || !hashB64) return false
  let salt: Uint8Array
  try {
    salt = base64urlDecode(saltB64)
  } catch {
    return false
  }
  const saltBuf = salt as unknown as ArrayBuffer
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBuf, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  )
  return base64urlEncode(new Uint8Array(derived)) === hashB64
}

export async function createUserSession(
  userId: string,
  tenantId: string,
  db: D1Database,
  expiresInSeconds = 7 * 24 * 3600
): Promise<string> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES))
  const token = base64urlEncode(tokenBytes)
  const tokenHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token).buffer as ArrayBuffer)
  const tokenHash = base64urlEncode(new Uint8Array(tokenHashBuffer))
  const sessionId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + expiresInSeconds

  await db
    .prepare(`
      INSERT INTO user_sessions (id, user_id, tenant_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(sessionId, userId, tenantId, tokenHash, expiresAt, now)
    .run()

  return token
}

export async function verifyUserSession(request: Request, env: Env): Promise<AuthContext> {
  const url = new URL(request.url)
  let token: string | null = null

  const authHeader = request.headers.get('Authorization')
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim()
  }
  if (!token) {
    token = url.searchParams.get('token')
  }
  if (!token) {
    throw new Error('Missing session token')
  }

  const tokenHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token).buffer as ArrayBuffer)
  const tokenHash = base64urlEncode(new Uint8Array(tokenHashBuffer))

  const row = await env.DB
    .prepare(`
      SELECT us.user_id, us.tenant_id, t.plan
      FROM user_sessions us
      JOIN tenants t ON t.id = us.tenant_id
      WHERE us.token_hash = ?
        AND us.revoked_at IS NULL
        AND us.expires_at > unixepoch()
    `)
    .bind(tokenHash)
    .first<{ user_id: string; tenant_id: string; plan: string }>()

  if (!row) {
    throw new Error('Invalid or expired session token')
  }

  return { tenantId: row.tenant_id, plan: row.plan ?? 'free', userId: row.user_id }
}

export async function revokeUserSession(request: Request, env: Env): Promise<void> {
  const url = new URL(request.url)
  let token: string | null = null

  const authHeader = request.headers.get('Authorization')
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim()
  }
  if (!token) {
    token = url.searchParams.get('token')
  }
  if (!token) return

  const tokenHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token).buffer as ArrayBuffer)
  const tokenHash = base64urlEncode(new Uint8Array(tokenHashBuffer))

  await env.DB
    .prepare('UPDATE user_sessions SET revoked_at = unixepoch() WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(tokenHash)
    .run()
}

function base64urlEncodeString(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64urlDecodeString(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (normalized.length % 4)) % 4
  return atob(normalized + '='.repeat(padLen))
}

export async function createOAuthState(
  tenantId: string,
  provider: string,
  secret: string
): Promise<string> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const payload = JSON.stringify({ tenantId, provider, nonce, exp: Math.floor(Date.now() / 1000) + 600 })
  const signingInput = base64urlEncodeString(payload)
  const key = await importHmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${base64urlEncode(sig)}`
}

export async function verifyOAuthState(
  state: string,
  provider: string,
  secret: string
): Promise<{ tenantId: string } | null> {
  const [payloadB64, sigB64] = state.split('.')
  if (!payloadB64 || !sigB64) return null
  const key = await importHmacKey(secret)
  const sig = base64urlDecode(sigB64)
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sig.buffer as ArrayBuffer,
    new TextEncoder().encode(payloadB64).buffer as ArrayBuffer
  )
  if (!valid) return null
  try {
    const payload = JSON.parse(base64urlDecodeString(payloadB64)) as {
      tenantId?: string
      provider?: string
      exp?: number
    }
    if (payload.provider !== provider) return null
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
    if (!payload.tenantId) return null
    return { tenantId: payload.tenantId }
  } catch {
    return null
  }
}
