import type { AppSetting } from '../types/index'
import { encryptToken, decryptToken } from './token-crypto'

const SENSITIVE_KEYS = new Set(['kimi_api_key', 'minimax_api_key', 'github_token', 'gitlab_token', 'bitbucket_token'])

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .bind(key)
    .first<AppSetting>()
  return row?.value ?? null
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, unixepoch())')
    .bind(key, value)
    .run()
}

export async function getProviderApiKey(
  db: D1Database,
  provider: 'kimi' | 'minimax',
  encryptionKey: string,
  envValue: string
): Promise<string | null> {
  if (envValue) return envValue

  const encrypted = await getSetting(db, `${provider}_api_key`)
  if (!encrypted) return null

  return decryptToken(encrypted, encryptionKey)
}

export function maskKey(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '•'.repeat(value.length)
  return '•'.repeat(value.length - 4) + value.slice(-4)
}

export async function listMaskedSettings(db: D1Database): Promise<AppSetting[]> {
  const rows = await db
    .prepare('SELECT key, value, updated_at FROM app_settings ORDER BY key')
    .all<AppSetting>()

  return (rows.results ?? []).map(row => ({
    ...row,
    value: SENSITIVE_KEYS.has(row.key) ? maskKey(row.value) : row.value,
  }))
}

export async function storeProviderApiKey(
  db: D1Database,
  provider: 'kimi' | 'minimax',
  encryptionKey: string,
  plaintext: string
): Promise<void> {
  if (!plaintext) {
    await db
      .prepare('DELETE FROM app_settings WHERE key = ?')
      .bind(`${provider}_api_key`)
      .run()
    return
  }

  const encrypted = await encryptToken(plaintext, encryptionKey)
  if (!encrypted) throw new Error(`Failed to encrypt ${provider} API key`)
  await setSetting(db, `${provider}_api_key`, encrypted)
}

export async function getGitProviderToken(
  db: D1Database,
  provider: 'github' | 'gitlab' | 'bitbucket',
  encryptionKey: string,
  envValue: string
): Promise<string | null> {
  if (envValue) return envValue

  const encrypted = await getSetting(db, `${provider}_token`)
  if (!encrypted) return null

  return decryptToken(encrypted, encryptionKey)
}

export async function storeGitProviderToken(
  db: D1Database,
  provider: 'github' | 'gitlab' | 'bitbucket',
  encryptionKey: string,
  plaintext: string
): Promise<void> {
  if (!plaintext) {
    await db
      .prepare('DELETE FROM app_settings WHERE key = ?')
      .bind(`${provider}_token`)
      .run()
    return
  }

  const encrypted = await encryptToken(plaintext, encryptionKey)
  if (!encrypted) throw new Error(`Failed to encrypt ${provider} token`)
  await setSetting(db, `${provider}_token`, encrypted)
}
