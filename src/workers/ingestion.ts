interface ManifestEntry {
  filePath:   string
  domain:     string
  chunkCount: number
  byteSize:   number
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

  if (lower.startsWith('test/') || lower.startsWith('__tests__/') || lower.endsWith('.test.ts')) {
    return 'test'
  }

  if (lower.startsWith('src/app/') || lower.startsWith('src/pages/') || lower.includes('/components/') || lower.startsWith('components/')) {
    return 'frontend'
  }

  if (lower.endsWith('/schema.sql') || lower.includes('/migrations/') || lower.includes('prisma')) {
    return 'database'
  }

  if (lower.startsWith('src/workers/') || lower.startsWith('src/api/') || lower.startsWith('src/routes/')) {
    return 'backend'
  }

  if (lower.startsWith('src/config/') || lower.includes('dockerfile') || lower.includes('docker-compose')) {
    return 'config'
  }

  if (lower.startsWith('docs/') || lower.endsWith('.md') || lower.endsWith('.mdx')) {
    return 'docs'
  }

  return 'all'
}

export async function writeChunksToR2(
  auditRunId: string,
  filePath: string,
  chunks: string[],
  r2: R2Bucket
): Promise<number> {
  for (let i = 0; i < chunks.length; i++) {
    const key = `chunks/${auditRunId}/${filePath}/${i}`
    await r2.put(key, chunks[i])
  }
  return chunks.length
}

export async function writeManifest(
  auditRunId: string,
  files: ManifestEntry[],
  db: D1Database
): Promise<void> {
  const statements = files.map(file =>
    db
      .prepare(`
        INSERT INTO repo_manifest (audit_run_id, file_path, domain, chunk_count, byte_size)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(auditRunId, file.filePath, file.domain, file.chunkCount, file.byteSize)
  )

  if (statements.length > 0) {
    await db.batch(statements)
  }
}

export async function createRunBudget(
  auditRunId: string,
  budgetUsd: number,
  db: D1Database
): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO run_budget (audit_run_id, budget_usd) VALUES (?, ?)')
    .bind(auditRunId, budgetUsd)
    .run()
}

export interface IngestionRequestBody {
  audit_run_id: string
  files: Array<{ path: string; content: string }>
}

export interface IngestionResponseBody {
  audit_run_id: string
  file_count: number
  total_chunks: number
}

export default {
  async fetch(request: Request, env: { DB: D1Database; R2: R2Bucket }): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    let body: IngestionRequestBody
    try {
      body = await request.json() as IngestionRequestBody
    } catch {
      return new Response('Invalid JSON', { status: 400 })
    }

    if (!body.audit_run_id || typeof body.audit_run_id !== 'string') {
      return new Response('Missing audit_run_id', { status: 400 })
    }

    if (!Array.isArray(body.files)) {
      return new Response('Missing files array', { status: 400 })
    }

    const manifestEntries: ManifestEntry[] = []
    let totalChunks = 0

    for (const file of body.files) {
      if (!file.path || typeof file.content !== 'string') {
        continue
      }

      const chunks = chunkFile(file.content)
      const chunkCount = await writeChunksToR2(body.audit_run_id, file.path, chunks, env.R2)
      const domain = tagDomain(file.path)

      manifestEntries.push({
        filePath: file.path,
        domain,
        chunkCount,
        byteSize: new TextEncoder().encode(file.content).length,
      })

      totalChunks += chunkCount
    }

    await writeManifest(body.audit_run_id, manifestEntries, env.DB)
    await createRunBudget(body.audit_run_id, 5.0, env.DB)

    const response: IngestionResponseBody = {
      audit_run_id: body.audit_run_id,
      file_count: manifestEntries.length,
      total_chunks: totalChunks,
    }

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
}
