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

  const { sub, plan } = await verifyToken(token, env.JWT_SECRET)
  return { tenantId: sub, plan: plan ?? 'free' }
}

export async function ensureTenant(tenantId: string, db: D1Database): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO tenants (id, name, plan) VALUES (?, ?, ?)')
    .bind(tenantId, tenantId, 'free')
    .run()
}
