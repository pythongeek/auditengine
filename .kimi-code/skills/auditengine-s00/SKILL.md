---
name: auditengine-s00
description: Run AuditEngine build session S00 from the build bible
type: flow
whenToUse: When the user wants to execute S00 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. Do not write a single line until you have read it.
2. Read src/types/index.ts before implementing any function. Do not invent types.
3. Read the SPEC section referenced in this prompt before writing any logic.
4. Do not invent API endpoints, model names, table names, or field names.
   Use ONLY what exists in the spec or in files you have already read this session.
5. If you are unsure whether a Cloudflare API exists or what its signature is,
   write: // TODO: VERIFY CLOUDFLARE API — DO NOT GUESS and leave it incomplete.
6. Do not touch files outside the scope of this session's task list.
7. After completing, update BUILD_STATE.md accurately.
8. If you encounter a spec conflict, stop and say: SPEC CONFLICT DETECTED: [describe it].

---

PROJECT: AuditEngine — Multi-agent codebase audit platform
STACK: Cloudflare Workers (TypeScript) + Durable Objects + D1 (SQLite) + R2 + Browser Run
SPEC LOCATION: docs/ folder in this project

THIS SESSION GOAL: Scaffold only. No logic. No TypeScript types yet.

TASK LIST (do exactly these, in this order, nothing else):

1. Create all directories:
   src/types/ src/lib/ src/db/ src/constitutions/ src/agents/ src/workers/ src/dashboard/ test/ scripts/ docs/

2. Create package.json with these exact dependencies:
   - "wrangler": "^3.0.0"
   - "@cloudflare/workers-types": "^4.0.0"
   - "typescript": "^5.0.0"
   - "vitest": "^1.0.0"
   devDependencies only — no runtime npm packages (Workers runtime has no node_modules)

3. Create tsconfig.json:
   - target: "ES2022"
   - module: "ES2022"
   - moduleResolution: "Bundler"
   - types: ["@cloudflare/workers-types"]
   - strict: true
   - noImplicitAny: true

4. Create wrangler.toml with this exact shape (leave placeholders where IDs are needed):
   name = "auditengine"
   main = "src/index.ts"
   compatibility_date = "2026-01-01"
   compatibility_flags = ["nodejs_compat"]

   [[d1_databases]]
   binding = "DB"
   database_name = "auditengine-d1"
   database_id = "PASTE_D1_ID_HERE"

   [[r2_buckets]]
   binding = "R2"
   bucket_name = "auditengine-r2"

   [durable_objects]
   bindings = [
     { name = "AGENT_DO", class_name = "AgentDurableObject" },
     { name = "COORDINATOR_DO", class_name = "CoordinatorDurableObject" },
     { name = "DASHBOARD_DO", class_name = "DashboardDurableObject" }
   ]

   [[migrations]]
   tag = "v1"
   new_classes = ["AgentDurableObject", "CoordinatorDurableObject", "DashboardDurableObject"]

   [vars]
   STAGING_URL = "https://PASTE_STAGING_URL_HERE"
   ADMIN_EMAIL = "admin@example.com"

5. Create src/index.ts as a stub only:
   export default { fetch: () => new Response("AuditEngine booting") }

6. Create SYSTEM_SPEC.md as a template with these exact section headers:
   # PROJECT SPECIFICATION
   ## Project Name
   ## Tech Stack
   ## Authentication Method
   ## Database ORM
   ## File Structure Summary
   ## Key Business Rules
   ## Admin vs User Roles
   ## Staging URL

7. Create SESSION_LOG.md with the header row only.

8. Create BUILD_STATE.md using the exact template from the project build documentation.
   Set all statuses to ⏳ except wrangler.toml, package.json, tsconfig.json which are ✅ DONE.

9. Create scripts/setup-secrets.sh:
   #!/bin/bash
   echo "Setting AuditEngine secrets in Cloudflare..."
   wrangler secret put KIMI_API_KEY
   wrangler secret put MINIMAX_API_KEY
   wrangler secret put GITHUB_TOKEN
   wrangler secret put ADMIN_PASSWORD
   echo "Done."

10. Run: npm install
    Confirm it succeeds. If it fails, fix package.json and retry.

DO NOT:
- Create any TypeScript logic
- Create schema.sql yet
- Create any constitution files yet
- Write any agent code

SUCCESS CRITERIA (verify each before marking done):
□ All directories exist
□ npm install completes without errors
□ npx tsc --noEmit does NOT error on src/index.ts stub
□ BUILD_STATE.md exists with all items set to ⏳ except the 3 config files
□ SESSION_LOG.md has the header row

SESSION END PROTOCOL:
1. Update BUILD_STATE.md: mark wrangler.toml, package.json, tsconfig.json, src/index.ts(stub), SESSION_LOG.md, BUILD_STATE.md as ✅ DONE
2. Add row to SESSION_LOG.md: S00 | [today's date] | Project scaffold | [list files created]
3. Commit: git add -A && git commit -m "S00: project scaffold"
