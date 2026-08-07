---
name: auditengine-s07
description: Run AuditEngine build session S07 from the build bible
type: flow
whenToUse: When the user wants to execute S07 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S06 must all be ✅.
2. Read src/types/index.ts before writing any code.
3. Do not invent R2 or D1 API methods — use only: R2.put(), R2.get(), R2.list(),
   D1.prepare().bind().run(), D1.prepare().bind().all(), D1.prepare().bind().first()
4. If unsure about a Cloudflare API signature: // TODO: VERIFY CLOUDFLARE API — DO NOT GUESS
5. Do not touch files outside this session.
6. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-12 Phase B checklist (ingestion.ts requirements)

---

TASK — src/workers/ingestion.ts

This is a Cloudflare Worker (not a Durable Object). It receives a POST request
with a git repo URL and audit_run_id, then processes the repo.

Since Workers cannot clone git repos directly, the ingestion flow is:
1. Receive POST { audit_run_id, files: Array<{ path: string, content: string }> }
   (The caller pre-processes the repo and sends file contents)
2. For each file: chunk it and write to R2
3. Write manifest to D1
4. Create run_budget row in D1
5. Return { audit_run_id, file_count, total_chunks }

IMPLEMENT THESE FUNCTIONS:

1. chunkFile(content: string, chunkSize = 500): string[]
   Split file content into chunks of at most chunkSize lines.
   Each chunk is a string. Preserve line boundaries (split on \n, rejoin).

2. tagDomain(filePath: string): string
   Return the domain string for a file path. Rules:
   - path starts with "test/" or "__tests__/" or ends with ".test.ts" → "test"
   - path starts with "src/app/" or "src/pages/" or "components/" → "frontend"
   - path matches **/schema.sql or **/migrations/ or contains "prisma" → "database"
   - path starts with "src/workers/" or "src/api/" or "src/routes/" → "backend"
   - path starts with "src/config/" or contains "dockerfile" or "docker-compose" → "config"
   - path starts with "docs/" or ends with ".md" or ends with ".mdx" → "docs"
   - everything else → "all"

3. writeChunksToR2(auditRunId: string, filePath: string, chunks: string[], r2: R2Bucket): Promise<number>
   Key pattern: chunks/{auditRunId}/{filePath}/{chunkIndex}
   Write each chunk. Return total chunks written.

4. writeManifest(auditRunId: string, files: ManifestEntry[], db: D1Database): Promise<void>
   INSERT INTO repo_manifest (audit_run_id, file_path, domain, chunk_count, byte_size)
   Use batch insert: db.batch([...statements])

5. createRunBudget(auditRunId: string, budgetUsd: number, db: D1Database): Promise<void>
   INSERT INTO run_budget (audit_run_id, budget_usd) VALUES (?, ?)
   Use INSERT OR IGNORE to prevent duplicate run rows

6. export default fetch handler:
   - Accept POST only
   - Parse JSON body
   - Validate required fields: audit_run_id, files array
   - Process each file: chunkFile() → writeChunksToR2() → collect manifest entry
   - writeManifest()
   - createRunBudget() with default 5.0 USD budget
   - Return JSON response

interface ManifestEntry {
  filePath:   string
  domain:     string
  chunkCount: number
  byteSize:   number
}

---

DO NOT:
- Try to clone git repos (Workers have no git or filesystem access)
- Use fs module
- Use node:path (use string operations instead, compatible with Workers runtime)

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ tagDomain("src/app/page.tsx") returns "frontend"
□ tagDomain("test/auth.test.ts") returns "test"
□ tagDomain("prisma/schema.prisma") returns "database"
□ chunkFile with 1000-line content returns array of 2 chunks

SESSION END:
1. BUILD_STATE.md: ingestion.ts ✅
2. SESSION_LOG.md
3. git commit -m "S07: ingestion worker"
