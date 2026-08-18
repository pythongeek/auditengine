const ALGO = { name: 'AES-GCM', length: 256 } as const
const IV_LEN = 12
const TAG_LEN = 16

async function importKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(input: string): ArrayBuffer | null {
  try {
    const binary = atob(input)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  } catch {
    return null
  }
}

export async function encryptToken(plaintext: string, key: string): Promise<string | null> {
  if (!key || key.length < 8) return null
  try {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await importKey(key),
      new TextEncoder().encode(plaintext)
    )
    const combined = new Uint8Array(iv.length + ciphertext.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(ciphertext), iv.length)
    return arrayBufferToBase64(combined.buffer)
  } catch {
    return null
  }
}

export async function decryptToken(ciphertext: string, key: string): Promise<string | null> {
  if (!key || key.length < 8 || !ciphertext) return null
  const buffer = base64ToArrayBuffer(ciphertext)
  if (!buffer || buffer.byteLength < IV_LEN + TAG_LEN) return null
  const bytes = new Uint8Array(buffer)
  const iv = bytes.slice(0, IV_LEN)
  const data = bytes.slice(IV_LEN)
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      await importKey(key),
      data
    )
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}

export type ProviderName = 'github' | 'gitlab' | 'bitbucket'

export async function getTenantProviderToken(
  db: D1Database,
  tenantId: string,
  provider: ProviderName,
  encryptionKey: string
): Promise<string | null> {
  const column = `${provider}_token` as 'github_token' | 'gitlab_token' | 'bitbucket_token'
  const row = await db
    .prepare(`SELECT ${column} FROM tenants WHERE id = ?`)
    .bind(tenantId)
    .first<{ [K in typeof column]: string | null }>()
  const encrypted = row?.[column]
  if (!encrypted) return null
  return decryptToken(encrypted, encryptionKey)
}
