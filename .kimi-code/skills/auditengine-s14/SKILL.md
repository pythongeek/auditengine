---
name: auditengine-s14
description: Run AuditEngine build session S14 from the build bible
type: flow
whenToUse: When the user wants to execute S14 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S13 must all be ✅.
2. Read src/types/index.ts and all worker/DO files to understand exports.
3. Only use real wrangler CLI commands. Do not invent wrangler flags.
   Known real commands: wrangler d1 create, wrangler d1 execute, wrangler r2 bucket create,
   wrangler secret put, wrangler deploy, wrangler dev
4. If unsure about a wrangler flag: // TODO: VERIFY WRANGLER FLAG — DO NOT GUESS
5. Do not refactor any logic files.
6. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
THIS SESSION: Wire entry point, finalize config, run setup, deploy.

---

TASK 1 — src/index.ts (entry point)

Wire all Workers and Durable Objects:

```typescript
import { AgentDurableObject } from './agents/base-agent'
import { CoordinatorDurableObject } from './workers/coordinator'
import { DashboardDurableObject } from './dashboard/dashboard-do'
import type { Env } from './types/index'

export { AgentDurableObject, CoordinatorDurableObject, DashboardDurableObject }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Route: POST /ingest → ingestion worker logic (inline or import)
    if (url.pathname === '/ingest' && request.method === 'POST') {
      // Import and call ingestion handler
    }

    // Route: /dashboard → serve dashboard HTML
    if (url.pathname === '/dashboard') {
      // Read index.html from R2 or serve inline
    }

    // Route: /dashboard/ws → WebSocket upgrade to Dashboard DO
    if (url.pathname === '/dashboard/ws') {
      const id = env.DASHBOARD_DO.idFromName('dashboard-' + url.searchParams.get('audit_run_id'))
      const stub = env.DASHBOARD_DO.get(id)
      return stub.fetch(request)
    }

    // Route: /audit/start → create audit run, boot coordinator
    if (url.pathname === '/audit/start' && request.method === 'POST') {
      // Parse body: { audit_run_id, files: [...] }
      // 1. POST to ingestion endpoint
      // 2. Boot coordinator DO
    }

    return new Response('AuditEngine v1.0', { status: 200 })
  }
}
```

TASK 2 — Run these commands in order (shell):

Step 1: Create D1 database
  wrangler d1 create auditengine-d1
  Copy the database_id from output → paste into wrangler.toml [[d1_databases]] database_id

Step 2: Create R2 bucket
  wrangler r2 bucket create auditengine-r2

Step 3: Run schema
  wrangler d1 execute auditengine-d1 --file=src/db/schema.sql

Step 4: Set secrets (will prompt for values)
  wrangler secret put KIMI_API_KEY
  wrangler secret put MINIMAX_API_KEY
  wrangler secret put GITHUB_TOKEN
  wrangler secret put ADMIN_PASSWORD

Step 5: Type check
  npx tsc --noEmit
  Fix any errors before proceeding.

Step 6: Deploy
  wrangler deploy

Step 7: Test deploy
  curl https://[your-worker-url].workers.dev/
  Should return "AuditEngine v1.0"

TASK 3 — Update wrangler.toml browser binding (for Visual QA):
Add:
  [browser]
  binding = "BROWSER"

TASK 4 — Update BUILD_STATE.md environment section with:
  - D1 database ID (real value from Step 1 output)
  - R2 bucket confirmed ✅
  - Secrets status for each key
  - Deploy URL

---

SUCCESS CRITERIA:
□ wrangler d1 execute succeeds (no schema errors)
□ npx tsc --noEmit passes on entire project
□ wrangler deploy succeeds
□ curl to deploy URL returns 200 with "AuditEngine v1.0"
□ BUILD_STATE.md environment section fully filled in

SESSION END:
1. BUILD_STATE.md: all deploy items ✅
2. SESSION_LOG.md
3. git commit -m "S14: entry point + deploy"
