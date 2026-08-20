import type { Env } from '../types/index'
import { uploadChunk } from '../lib/r2-storage'
import { extractZipFiles, type RepoFile } from '../lib/zip'
import { getRepoFiles } from '../lib/git-router'
import { detectLanguage } from '../lib/lang'

interface ManifestEntry {
  filePath:      string
  domain:        string
  chunkCount:    number
  lineCount:     number
  byteSize:      number
  contentHash:   string
  language:      string
  lastModified:  number
  r2Key:         string
}

export function chunkFile(content: string, chunkSize = 500): string[] {
  const lines = content.split('\n')
  const chunks: string[] = []

  for (let i = 0; i < lines.length; i += chunkSize) {
    const slice = lines.slice(i, i + chunkSize)
    chunks.push(slice.join('\n'))
  }

  return chunks.length === 0 ? [''] : chunks
}

export function tagDomain(filePath: string): string {
  const lower = filePath.toLowerCase()

  if (lower.startsWith('test/') || lower.startsWith('__tests__/') || lower.startsWith('tests/')
    || lower.includes('/test/') || lower.includes('/tests/') || lower.includes('/__tests__/')
    || /\.(test|spec)\.[a-z0-9]+$/.test(lower)) {
    return 'test'
  }

  if (lower.startsWith('src/app/') || lower.startsWith('src/pages/') || lower.includes('/components/') || lower.startsWith('components/')) {
    return 'frontend'
  }

  if (lower.endsWith('/schema.sql') || lower.endsWith('.sql') || lower.includes('/migrations/') || lower.includes('prisma')) {
    return 'database'
  }

  if (lower.startsWith('src/workers/') || lower.startsWith('src/api/') || lower.startsWith('src/routes/')) {
    return 'backend'
  }

  if (lower.startsWith('src/config/') || lower.includes('dockerfile') || lower.includes('docker-compose')
    || /\.(ya?ml|toml|ini|cfg|conf)$/.test(lower) || lower.endsWith('/.env') || lower.endsWith('.env.example')) {
    return 'config'
  }

  if (lower.startsWith('docs/') || lower.endsWith('.md') || lower.endsWith('.mdx')) {
    return 'docs'
  }

  if (lower.endsWith('.sol')) return 'smart-contract'

  // Extension-based fallback so non-JS/TS repos still reach the specialists:
  // typical server-side languages map to the backend domain unless the path
  // clearly belongs to the frontend.
  const frontendExts = /\.(tsx|jsx|vue|svelte|css|scss|sass|less|html?)$/
  const backendExts = /\.(py|go|java|rb|php|cs|rs|kt|scala|ex|exs)$/
  if (frontendExts.test(lower)) return 'frontend'
  if (backendExts.test(lower) && !lower.includes('/public/') && !lower.includes('/static/')) {
    return 'backend'
  }

  return 'all'
}

export async function sha256ContentHash(content: string): Promise<string> {
  const data = new TextEncoder().encode(content)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function writeManifest(
  tenantId: string,
  auditRunId: string,
  files: ManifestEntry[],
  db: D1Database
): Promise<void> {
  const statements = files.map(file =>
    db
      .prepare(`
        INSERT INTO repo_manifest (
          tenant_id, audit_run_id, file_path, domain, chunk_count, byte_size,
          content_hash, language, last_modified, r2_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        tenantId,
        auditRunId,
        file.filePath,
        file.domain,
        file.chunkCount,
        file.byteSize,
        file.contentHash,
        file.language,
        file.lastModified,
        file.r2Key
      )
  )

  if (statements.length > 0) {
    await db.batch(statements)
  }
}

export async function writeFiles(
  tenantId: string,
  auditRunId: string,
  files: ManifestEntry[],
  db: D1Database
): Promise<void> {
  const statements = files.map(file =>
    db
      .prepare(`
        INSERT OR IGNORE INTO files (
          tenant_id, audit_run_id, path, language, domain_tag, line_count,
          chunk_count, r2_key, last_analyzed_at, content_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `)
      .bind(
        tenantId,
        auditRunId,
        file.filePath,
        file.language,
        file.domain,
        file.lineCount,
        file.chunkCount,
        file.r2Key,
        file.lastModified,
        file.contentHash
      )
  )

  if (statements.length > 0) {
    await db.batch(statements)
  }
}

export async function upsertFiles(
  tenantId: string,
  auditRunId: string,
  files: ManifestEntry[],
  db: D1Database
): Promise<void> {
  const statements = files.map(file =>
    db
      .prepare(`
        INSERT INTO files (
          tenant_id, audit_run_id, path, language, domain_tag, line_count,
          chunk_count, r2_key, last_analyzed_at, content_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), ?, unixepoch())
        ON CONFLICT(tenant_id, audit_run_id, path) DO UPDATE SET
          language = excluded.language,
          domain_tag = excluded.domain_tag,
          line_count = excluded.line_count,
          chunk_count = excluded.chunk_count,
          r2_key = excluded.r2_key,
          last_analyzed_at = unixepoch(),
          content_hash = excluded.content_hash
      `)
      .bind(
        tenantId,
        auditRunId,
        file.filePath,
        file.language,
        file.domain,
        file.lineCount,
        file.chunkCount,
        file.r2Key,
        file.contentHash
      )
  )

  if (statements.length > 0) {
    await db.batch(statements)
  }
}

export async function createRunBudget(
  tenantId: string,
  auditRunId: string,
  budgetUsd: number,
  db: D1Database
): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO run_budget (tenant_id, audit_run_id, budget_usd) VALUES (?, ?, ?)')
    .bind(tenantId, auditRunId, budgetUsd)
    .run()
}

async function ensureAuditSession(
  tenantId: string,
  auditRunId: string,
  totalFiles: number,
  db: D1Database,
  repoUrl?: string,
  branch?: string,
  commitSha?: string
): Promise<void> {
  await db
    .prepare(`
      INSERT OR IGNORE INTO audit_sessions (
        id, tenant_id, status, total_files, repo_url, repo_branch, last_commit_sha, created_at
      ) VALUES (?, ?, 'pending', ?, ?, ?, ?, unixepoch())
    `)
    .bind(auditRunId, tenantId, totalFiles, repoUrl ?? '', branch ?? 'main', commitSha ?? null)
    .run()

  await db
    .prepare('UPDATE audit_sessions SET total_files = ?, repo_url = ?, repo_branch = ?, last_commit_sha = ? WHERE id = ?')
    .bind(totalFiles, repoUrl ?? '', branch ?? 'main', commitSha ?? null, auditRunId)
    .run()
}

async function markSessionFailed(
  tenantId: string,
  auditRunId: string,
  db: D1Database,
  reason: string
): Promise<void> {
  await db
    .prepare(`
      INSERT OR IGNORE INTO audit_sessions (
        id, tenant_id, status, total_files, repo_url, repo_branch, last_commit_sha, created_at
      ) VALUES (?, ?, 'failed', 0, '', 'main', NULL, unixepoch())
    `)
    .bind(auditRunId, tenantId)
    .run()

  await db
    .prepare('UPDATE audit_sessions SET status = \'failed\' WHERE id = ? AND tenant_id = ?')
    .bind(auditRunId, tenantId)
    .run()

  await db
    .prepare(`
      INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(tenantId, auditRunId, null, 'ingestion_failed', JSON.stringify({ reason }))
    .run()
}

async function ensureRepoGroupMembership(
  tenantId: string,
  groupId: string,
  auditRunId: string,
  db: D1Database
): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO repo_groups (group_id, tenant_id, name, created_at) VALUES (?, ?, ?, unixepoch())')
    .bind(groupId, tenantId, groupId)
    .run()

  await db
    .prepare('INSERT OR IGNORE INTO repo_group_members (group_id, audit_run_id, role) VALUES (?, ?, ?)')
    .bind(groupId, auditRunId, 'service')
    .run()
}

export async function processRepoFile(
  tenantId: string,
  auditRunId: string,
  file: RepoFile,
  r2: R2Bucket
): Promise<ManifestEntry> {
  const chunks = chunkFile(file.content)
  const contentHash = await sha256ContentHash(file.content)
  const domain = tagDomain(file.path)
  const language = detectLanguage(file.path)
  const lineCount = file.content.split('\n').length

  // Upload the first chunk and use its key as the manifest r2_key reference.
  const r2Key = await uploadChunk(tenantId, auditRunId, file.path, 0, chunks[0] ?? '', r2)
  for (let i = 1; i < chunks.length; i++) {
    await uploadChunk(tenantId, auditRunId, file.path, i, chunks[i], r2)
  }

  return {
    filePath: file.path,
    domain,
    chunkCount: chunks.length,
    lineCount,
    byteSize: new TextEncoder().encode(file.content).length,
    contentHash,
    language,
    lastModified: file.lastModified,
    r2Key,
  }
}

export interface IngestionResponseBody {
  audit_run_id: string
  file_count: number
  total_chunks: number
}

function getTenantId(request: Request): string {
  return request.headers.get('X-Tenant-Id') ?? ''
}

interface ParsedRepoFiles {
  auditRunId: string
  files: RepoFile[]
  repoUrl?: string
  branch?: string
  commitSha?: string
  repoGroupId?: string
  selectedPaths?: string[]
  githubTokenOverride?: string
}

async function parseRepoFiles(request: Request, env: Env, tenantId: string): Promise<ParsedRepoFiles | Response> {
  const contentType = request.headers.get('Content-Type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const auditRunId = formData.get('audit_run_id') as string | null
    if (!auditRunId) {
      return new Response('Missing audit_run_id', { status: 400 })
    }
    const zipFile = formData.get('zip')
    if (!zipFile || typeof zipFile === 'string') {
      return new Response('Missing zip file', { status: 400 })
    }
    const buffer = await zipFile.arrayBuffer()
    const files = await extractZipFiles(buffer)
    const repoUrl = formData.get('repo_url') as string | null
    const branch = formData.get('branch') as string | null
    const commitSha = formData.get('commit_sha') as string | null
    const repoGroupId = formData.get('repo_group_id') as string | null
    return { auditRunId, files, repoUrl: repoUrl ?? undefined, branch: branch ?? undefined, commitSha: commitSha ?? undefined, repoGroupId: repoGroupId ?? undefined }
  }

  // JSON body: either { repo_url, branch? } or { audit_run_id, files: [...] }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const b = body as Record<string, unknown>

  if (b.repo_url && typeof b.repo_url === 'string') {
    const branch = typeof b.branch === 'string' ? b.branch : undefined
    const commitSha = typeof b.commit_sha === 'string' ? b.commit_sha : undefined
    const repoGroupId = typeof b.repo_group_id === 'string' ? b.repo_group_id : undefined
    const selectedPaths = Array.isArray(b.selected_paths) && b.selected_paths.every((p: unknown) => typeof p === 'string')
      ? (b.selected_paths as string[])
      : undefined
    const auditRunId = typeof b.audit_run_id === 'string' ? b.audit_run_id : `github-${Date.now()}`
    const tokenOverride = typeof b.github_token_override === 'string' ? b.github_token_override : undefined
    try {
      let files = await getRepoFiles(b.repo_url, branch, tenantId, env, tokenOverride)
      if (selectedPaths && selectedPaths.length > 0) {
        const selectedSet = new Set(selectedPaths)
        files = files.filter(f => selectedSet.has(f.path))
      }
      return { auditRunId, files, repoUrl: b.repo_url, branch, commitSha, repoGroupId, selectedPaths, githubTokenOverride: tokenOverride }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch repository files'
      await markSessionFailed(tenantId, auditRunId, env.DB, msg)
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  if (!b.audit_run_id || typeof b.audit_run_id !== 'string') {
    return new Response('Missing audit_run_id', { status: 400 })
  }

  if (!Array.isArray(b.files)) {
    return new Response('Missing files array', { status: 400 })
  }

  const files: RepoFile[] = b.files
    .filter((f: unknown): f is { path: string; content: string } => {
      return !!f && typeof f === 'object' && 'path' in (f as object) && 'content' in (f as object)
    })
    .map((f: { path: string; content: string }) => ({
      path: f.path,
      content: f.content,
      lastModified: Date.now(),
    }))

  const repoUrl = typeof b.repo_url === 'string' ? b.repo_url : undefined
  const branch = typeof b.branch === 'string' ? b.branch : undefined
  const commitSha = typeof b.commit_sha === 'string' ? b.commit_sha : undefined
  const repoGroupId = typeof b.repo_group_id === 'string' ? b.repo_group_id : undefined

  return { auditRunId: b.audit_run_id, files, repoUrl, branch, commitSha, repoGroupId }
}

async function broadcastRepoReady(
  tenantId: string,
  auditRunId: string,
  fileCount: number,
  dashboardDO: DurableObjectNamespace
): Promise<void> {
  const id = dashboardDO.idFromName('dashboard-' + auditRunId)
  const stub = dashboardDO.get(id)
  await stub.fetch(new Request('https://dashboard/broadcast', {
    method: 'POST',
    body: JSON.stringify({
      type: 'repo_ready',
      audit_run_id: auditRunId,
      payload: { tenant_id: tenantId, file_count: fileCount },
      ts: Date.now(),
    }),
    headers: { 'Content-Type': 'application/json' },
  })).catch(() => {
    // broadcast failures are non-fatal
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const tenantId = getTenantId(request)

    const parsed = await parseRepoFiles(request, env, tenantId)
    if (parsed instanceof Response) {
      return parsed
    }

    const { auditRunId, files, repoUrl, branch, commitSha, repoGroupId } = parsed

    if (files.length === 0) {
      return new Response('No valid files to ingest', { status: 400 })
    }

    const manifestEntries: ManifestEntry[] = []
    let totalChunks = 0

    for (const file of files) {
      const entry = await processRepoFile(tenantId, auditRunId, file, env.R2)
      manifestEntries.push(entry)
      totalChunks += entry.chunkCount
    }

    await writeManifest(tenantId, auditRunId, manifestEntries, env.DB)
    await writeFiles(tenantId, auditRunId, manifestEntries, env.DB)
    await createRunBudget(tenantId, auditRunId, 5.0, env.DB)
    await ensureAuditSession(tenantId, auditRunId, manifestEntries.length, env.DB, repoUrl, branch, commitSha)
    if (repoGroupId) {
      await ensureRepoGroupMembership(tenantId, repoGroupId, auditRunId, env.DB)
    }
    await broadcastRepoReady(tenantId, auditRunId, manifestEntries.length, env.DASHBOARD_DO)

    const response: IngestionResponseBody = {
      audit_run_id: auditRunId,
      file_count: manifestEntries.length,
      total_chunks: totalChunks,
    }

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
}
