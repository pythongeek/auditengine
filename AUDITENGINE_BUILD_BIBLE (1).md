# AuditEngine — Complete AI-Assisted Build Bible
> Version: 1.0 | Stack: Cloudflare Workers + D1 + R2 + Durable Objects + Browser Run  
> Target: MVP (Phases A–E) | AI Coding Tool: Claude Code / Cursor

---

## HONEST CONSTRAINTS BEFORE YOU START

Read these once. They apply to every session.

1. The spec in `docs/` is law. If you or the AI agent are unsure about a behavior, the spec wins. Do not improvise.
2. Every session ends with an update to `BUILD_STATE.md`. No exceptions. If the file is not updated, the next session will be blind.
3. The AI agent has no memory between sessions. `BUILD_STATE.md` is its only memory. Keep it accurate.
4. Do not start a new session until the previous session's success criteria are fully met and the file is committed.
5. Vibe coding works here because the specs are deterministic. The moment you let the agent interpret instead of implement, you get hallucination debt that compounds across sessions.

---

## MASTER ANTI-HALLUCINATION RULES
> Paste this block at the start of EVERY session prompt, before the task.

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. Do not write a single line until you have read it.
2. Read src/types/index.ts before implementing any function. Do not invent types.
3. Read the SPEC section referenced in this prompt before writing any logic.
4. Do not invent API endpoints, model names, table names, or field names.
   Use ONLY what exists in the spec or in files you have already read this session.
5. If you are unsure whether a Cloudflare API exists or what its signature is,
   write: // TODO: VERIFY CLOUDFLARE API — DO NOT GUESS and leave it incomplete.
   Do not guess. A wrong Cloudflare API will compile and silently fail at runtime.
6. Do not touch files outside the scope of this session's task list.
7. After completing, update BUILD_STATE.md accurately.
   Do not mark anything DONE unless it is actually written and correct.
8. If you encounter a conflict between this prompt and the spec, stop and say:
   SPEC CONFLICT DETECTED: [describe it]. Wait for human resolution.
```

---

## PROJECT STRUCTURE (canonical — do not deviate)

```
auditengine/
├── BUILD_STATE.md            ← AI agent memory — read first every session
├── SESSION_LOG.md            ← One-line entry per session (what was done)
├── wrangler.toml             ← Cloudflare config
├── package.json
├── tsconfig.json
├── SYSTEM_SPEC.md            ← Target project description (human fills this per audit run)
├── docs/
│   ├── AuditEngine_Agent_Documentation.docx   ← Source RFC
│   └── Implementation_Specs_Reference.md      ← Key spec sections (created in S00)
├── src/
│   ├── types/
│   │   └── index.ts          ← ALL interfaces — single source of truth
│   ├── lib/
│   │   ├── llm-gateway.ts    ← All LLM calls go through here
│   │   ├── model-router.ts   ← 13 routing rules
│   │   └── gate.ts           ← Verification gate (deterministic, no LLM)
│   ├── db/
│   │   └── schema.sql        ← D1 schema + triggers
│   ├── constitutions/
│   │   ├── universal.md      ← Shared rules for all agents
│   │   ├── security.md
│   │   ├── api.md
│   │   ├── frontend.md
│   │   ├── database.md
│   │   ├── architecture.md
│   │   ├── testing.md
│   │   ├── performance.md
│   │   ├── devops.md
│   │   ├── documentation.md
│   │   └── visual-qa.md
│   ├── agents/
│   │   └── base-agent.ts     ← Shared tick() loop + message builders
│   ├── workers/
│   │   ├── ingestion.ts      ← File walk + R2 chunking
│   │   ├── coordinator.ts    ← Coordinator Durable Object
│   │   ├── priority-resolver.ts   ← Cloudflare Workflow
│   │   ├── verification.ts   ← Verification Agent
│   │   ├── salvation.ts      ← Salvation Protocol
│   │   └── visual-qa.ts      ← Visual QA Agent (Browser Run)
│   ├── dashboard/
│   │   ├── dashboard-do.ts   ← Dashboard WebSocket Durable Object
│   │   └── index.html        ← Dashboard frontend
│   └── index.ts              ← Worker entry point
├── test/
│   ├── gate.test.ts
│   ├── model-router.test.ts
│   └── helpers.ts
└── scripts/
    ├── deploy.sh
    └── setup-secrets.sh
```

---

## BUILD_STATE.md — TEMPLATE (copy this exactly for initial file)

```markdown
# AuditEngine BUILD_STATE
Last updated: [YYYY-MM-DD]
Session number: 0
Session worker: [tool you used — Claude Code / Cursor / etc.]

## STATUS KEY
✅ DONE     — File exists, written to spec, committed
🔄 ACTIVE   — Being built RIGHT NOW
⏳ PENDING  — Not started
❌ BLOCKED  — Waiting on another item
⚠️ PARTIAL  — Started but not complete — describe what is missing

---

## PHASE A — FOUNDATION

| File | Status | Notes |
|------|--------|-------|
| wrangler.toml | ⏳ | |
| package.json | ⏳ | |
| tsconfig.json | ⏳ | |
| src/types/index.ts | ⏳ | |
| src/db/schema.sql | ⏳ | |
| src/lib/llm-gateway.ts | ⏳ | |
| src/lib/model-router.ts | ⏳ | |
| src/lib/gate.ts | ⏳ | |
| src/constitutions/universal.md | ⏳ | |
| src/constitutions/security.md | ⏳ | |
| src/constitutions/api.md | ⏳ | |
| src/constitutions/frontend.md | ⏳ | |
| src/constitutions/database.md | ⏳ | |
| src/constitutions/architecture.md | ⏳ | |
| src/constitutions/testing.md | ⏳ | |
| src/constitutions/performance.md | ⏳ | |
| src/constitutions/devops.md | ⏳ | |
| src/constitutions/documentation.md | ⏳ | |
| src/constitutions/visual-qa.md | ⏳ | |
| SYSTEM_SPEC.md | ⏳ | Human fills this per audit target |

## PHASE B — AGENT CORE

| File | Status | Notes |
|------|--------|-------|
| src/agents/base-agent.ts (state machine) | ⏳ | |
| src/agents/base-agent.ts (message builders) | ⏳ | |
| src/workers/ingestion.ts | ⏳ | |

## PHASE C — ORCHESTRATION

| File | Status | Notes |
|------|--------|-------|
| src/workers/coordinator.ts | ⏳ | |
| src/workers/priority-resolver.ts | ⏳ | |
| src/workers/verification.ts | ⏳ | |
| src/workers/salvation.ts | ⏳ | |

## PHASE D — VISUAL QA

| File | Status | Notes |
|------|--------|-------|
| src/workers/visual-qa.ts | ⏳ | |

## PHASE E — DASHBOARD

| File | Status | Notes |
|------|--------|-------|
| src/dashboard/dashboard-do.ts | ⏳ | |
| src/dashboard/index.html | ⏳ | |

## INTEGRATION + DEPLOYMENT

| File | Status | Notes |
|------|--------|-------|
| src/index.ts (entry point) | ⏳ | |
| D1 database created in Cloudflare | ⏳ | D1 ID: [paste here] |
| R2 bucket created in Cloudflare | ⏳ | Bucket name: auditengine-r2 |
| Secrets set in wrangler | ⏳ | KIMI_API_KEY, MINIMAX_API_KEY, GITHUB_TOKEN |
| wrangler deploy successful | ⏳ | |

## TESTS

| File | Status | Notes |
|------|--------|-------|
| test/gate.test.ts | ⏳ | |
| test/model-router.test.ts | ⏳ | |

---

## KNOWN ISSUES / BLOCKERS
(add entries here when something is broken or unclear)

## ENVIRONMENT VARIABLES CONFIRMED
- KIMI_API_KEY: [ SET / NOT SET ]
- MINIMAX_API_KEY: [ SET / NOT SET ]
- GITHUB_TOKEN: [ SET / NOT SET ]
- D1_DATABASE_ID: [ paste value ]
- R2_BUCKET_NAME: auditengine-r2

## SESSION LOG
| # | Date | What was done | Files changed |
|---|------|---------------|---------------|
| 0 | | Scaffold | |
```

---

## SESSION INDEX

| # | Name | Phase | Delivers |
|---|------|-------|---------|
| S00 | Project Scaffold | Setup | wrangler.toml, package.json, tsconfig.json, folder structure, BUILD_STATE.md |
| S01 | Types + D1 Schema | A | src/types/index.ts, src/db/schema.sql |
| S02 | LLM Gateway + Model Router | A | src/lib/llm-gateway.ts, src/lib/model-router.ts |
| S03 | Verification Gate | A | src/lib/gate.ts |
| S04 | Constitution Files | A | src/constitutions/*.md (11 files) |
| S05 | Agent Base: State Machine | B | src/agents/base-agent.ts (tick + state types) |
| S06 | Agent Base: Message Builders | B | src/agents/base-agent.ts (all build* functions) |
| S07 | Ingestion Worker | B | src/workers/ingestion.ts |
| S08 | Coordinator DO | C | src/workers/coordinator.ts |
| S09 | Priority Resolver | C | src/workers/priority-resolver.ts |
| S10 | Verification Agent | C | src/workers/verification.ts |
| S11 | Salvation Protocol | C | src/workers/salvation.ts |
| S12 | Visual QA Agent | D | src/workers/visual-qa.ts |
| S13 | Dashboard DO + Frontend | E | src/dashboard/dashboard-do.ts, src/dashboard/index.html |
| S14 | Entry Point + Deploy | Integration | src/index.ts, wrangler.toml final, deploy |
| S15 | Tests | QA | test/gate.test.ts, test/model-router.test.ts |

---

---

# SESSION S00 — Project Scaffold
**Goal:** Create the folder structure, config files, and build tracking state. Zero TypeScript logic this session.

---

## COPY-PASTE PROMPT FOR S00

```
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
```

---

---

# SESSION S01 — Types + D1 Schema
**Goal:** Define every TypeScript interface and the complete D1 database schema. These are the shared contracts that all future sessions depend on. Do not skip any field.

---

## COPY-PASTE PROMPT FOR S01

```
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
SPEC REFERENCE: docs/AuditEngine_Agent_Documentation.docx (D1 schema section) and
                docs/Implementation_Specs_Reference.md SPEC-01 (AgentPersistentState)

THIS SESSION GOAL: Create src/types/index.ts (all interfaces) and src/db/schema.sql (all tables).

---

TASK 1 — src/types/index.ts

Write ALL of the following interfaces and types. Do not add fields not listed here.
Do not omit any field listed here. This file is the contract for every other file.

```typescript
// ── Provider + Model ──────────────────────────────────────────────────────
export type Provider = "kimi" | "minimax"
export type Model = "kimi-k3" | "kimi-k2.6" | "minimax-m3"
export type AgentType =
  | "security" | "api" | "frontend" | "database" | "architecture"
  | "testing" | "performance" | "devops" | "documentation" | "visual_qa"

export type AgentState =
  | "boot" | "claiming" | "reading" | "cross_reading" | "analyzing"
  | "gate_checking" | "writing" | "looping" | "done" | "paused" | "salvation"

export type Severity = "critical" | "high" | "medium" | "low" | "info"

// ── Agent ─────────────────────────────────────────────────────────────────
export interface AgentPersistentState {
  agentId:             string
  agentType:           AgentType
  auditRunId:          string
  state:               AgentState
  fileQueue:           string[]
  queueCursor:         number
  currentFile:         string | null
  currentFileContent:  string | null
  gateFailCount:       number
  currentFindingId:    string | null
  constitutionText:    string
  specText:            string
  lastModelOutput:     string | null
  gateRejectionReason: string | null
  gateRejectionHistory: string[]
  crossAgentContext:   CrossAgentFinding[]
  validatedFindings:   ValidatedFinding[]
}

// ── Findings ──────────────────────────────────────────────────────────────
export interface Finding {
  finding_id:      string
  audit_run_id:    string
  agent_id:        string
  agent_type:      AgentType
  severity:        Severity
  category:        string
  file:            string
  line_range:      [number, number] | null
  evidence_quote:  string
  description:     string
  impact:          string | null
  verified_by:     string[]
  source:          "agent" | "visual_qa" | "regression"
  status:          "open" | "in_progress" | "in_review" | "resolved" | "wont_fix"
  recurrence_count: number
  ts:              number
  verified_at:     number | null
  screenshot_id:   string | null
}

export interface ValidatedFinding extends Finding {}

export interface CrossAgentFinding {
  finding_id:  string
  severity:    Severity
  category:    string
  file:        string
  description: string
  agent_id:    string
}

export interface ScoredFinding extends Finding {
  priorityScore: number
  multipliers:   string[]
}

// ── Gate ──────────────────────────────────────────────────────────────────
export interface GateResult {
  passed:           boolean
  findings:         ValidatedFinding[]
  reason:           string | null
  rejected_phrases: string[]
}

export interface GateContext {
  agentId:            string
  agentType:          AgentType
  auditRunId:         string
  currentFile:        string
  currentFileContent: string
  claimLog:           Set<string>
}

// ── LLM Gateway ───────────────────────────────────────────────────────────
export type TaskType =
  | "deep_audit" | "simple_analysis" | "cross_read_summary"
  | "salvation_research" | "visual_qa_script" | "verification"
  | "trace_analysis" | "conflict_resolution"

export interface LLMCallParams {
  agentId:    string
  agentType:  AgentType
  taskType:   TaskType
  messages:   Message[]
  auditRunId: string
  db:         D1Database
  broadcast:  (event: DashboardEvent) => void
}

export interface Message {
  role:    "system" | "user" | "assistant"
  content: string
}

export interface RawUsage {
  prompt_tokens:     number
  completion_tokens: number
  cached_tokens?:    number
}

export interface NormalizedResponse {
  text:  string
  usage: RawUsage
}

// ── Tasks ─────────────────────────────────────────────────────────────────
export interface Task {
  task_id:           string
  audit_run_id:      string
  title:             string
  finding_ids:       string   // JSON array serialized
  priority_score:    number
  multipliers:       string   // JSON array serialized
  status:            "backlog" | "in_progress" | "in_review" | "done"
  assigned_agent:    string | null
  commit_sha:        string | null
  created_at:        number
  updated_at:        number
  conflict_flag:     0 | 1
  conflict_reason:   string | null
  lock_expires_at:   number | null
}

export interface ConflictGroup {
  file:        string
  finding_ids: string[]
  reason:      string
  resolution:  "needs_human_decision"
}

// ── Salvation ─────────────────────────────────────────────────────────────
export interface SalvationResearchSource {
  source_type:       "owasp" | "nvd" | "github_issue" | "stackoverflow" | "framework_docs"
  url:               string
  relevant_finding:  string
  proposed_solution: string
}

export interface SalvationReport {
  salvation_id:          string
  finding_id:            string
  attempts: Array<{
    attempt_number: number
    what_was_tried: string
    why_it_failed:  string
  }>
  research_sources:      SalvationResearchSource[]
  human_recommendation:  string
  estimated_effort:      "S" | "M" | "L" | "XL"
  blocking_task_ids:     string[]
  broadcast_message:     string
}

// ── Visual QA ─────────────────────────────────────────────────────────────
export interface RouteInfo {
  path:          string
  source_file:   string
  is_admin:      boolean
  requires_auth: boolean
}

export type QAAction = "navigate" | "click" | "fill" | "submit" | "wait" | "assert"
export type AssertType = "http_status" | "dom_visible" | "dom_text" | "network_request" | "no_console_error"

export interface QAStep {
  step_number:     number
  action:          QAAction
  selector:        string | null
  value:           string | null
  url:             string | null
  assert_type:     AssertType | null
  assert_expected: string | null
  screenshot:      boolean
}

export interface StepResult {
  passed:        boolean
  failure_type:  string | null
  actual:        string | null
  description:   string
  impact:        string
  screenshot_id: string | null
}

// ── Dashboard ─────────────────────────────────────────────────────────────
export type DashboardEventType =
  | "agent_spawned" | "agent_state_change" | "finding_created"
  | "gate_rejected" | "gate_passed" | "salvation_activated"
  | "salvation_complete" | "task_created" | "task_status_change"
  | "budget_alert" | "token_usage" | "audit_complete"

export interface DashboardEvent {
  type:          DashboardEventType
  audit_run_id:  string
  agent_id?:     string
  payload:       Record<string, unknown>
  ts:            number
}

// ── Coordinator ───────────────────────────────────────────────────────────
export type AuditPhase =
  | "boot" | "phase-1" | "phase-2" | "phase-3"
  | "phase-4" | "complete" | "failed"

export interface AgentRegistryRow {
  agent_id:   string
  agent_type: AgentType
  status:     "boot" | "running" | "done" | "failed" | "paused"
  phase:      number
  spawned_at: number
  done_at:    number | null
}

// ── Verification ──────────────────────────────────────────────────────────
export interface FindingVerifyResult {
  finding_id: string
  resolved:   boolean
  reason:     string
}

export interface VerifyResult {
  result:           "resolved" | "failed_verification" | "needs_revision" | "failed"
  finding_results?: FindingVerifyResult[]
  reason?:          string
}

// ── Env (Cloudflare bindings) ─────────────────────────────────────────────
export interface Env {
  DB:              D1Database
  R2:              R2Bucket
  AGENT_DO:        DurableObjectNamespace
  COORDINATOR_DO:  DurableObjectNamespace
  DASHBOARD_DO:    DurableObjectNamespace
  KIMI_API_KEY:    string
  MINIMAX_API_KEY: string
  GITHUB_TOKEN:    string
  STAGING_URL:     string
  ADMIN_EMAIL:     string
  ADMIN_PASSWORD:  string
}
```

---

TASK 2 — src/db/schema.sql

Write this exact schema. Do not rename any column. Do not add tables not listed.

```sql
-- AuditEngine D1 Schema v1.0
-- Run with: wrangler d1 execute auditengine-d1 --file=src/db/schema.sql

PRAGMA journal_mode=WAL;

-- File ownership claims (atomic — UNIQUE prevents duplicate analysis)
CREATE TABLE IF NOT EXISTS claims (
  claim_id     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  audit_run_id TEXT NOT NULL,
  agent_id     TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  claimed_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(audit_run_id, file_path)
);

-- Repo file manifest (written by ingestion worker)
CREATE TABLE IF NOT EXISTS repo_manifest (
  manifest_id  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  audit_run_id TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  domain       TEXT NOT NULL,
  chunk_count  INTEGER NOT NULL DEFAULT 1,
  byte_size    INTEGER NOT NULL DEFAULT 0,
  indexed_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_manifest_run_domain ON repo_manifest(audit_run_id, domain);

-- Findings (written by agents, read by priority resolver + verification)
CREATE TABLE IF NOT EXISTS findings (
  finding_id       TEXT PRIMARY KEY,
  audit_run_id     TEXT NOT NULL,
  agent_id         TEXT NOT NULL,
  agent_type       TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low','info')),
  category         TEXT NOT NULL,
  file             TEXT NOT NULL,
  line_range_start INTEGER,
  line_range_end   INTEGER,
  evidence_quote   TEXT NOT NULL,
  description      TEXT NOT NULL,
  impact           TEXT,
  verified_by      TEXT NOT NULL,  -- JSON array
  source           TEXT NOT NULL DEFAULT 'agent',
  status           TEXT NOT NULL DEFAULT 'open',
  recurrence_count INTEGER NOT NULL DEFAULT 0,
  ts               INTEGER NOT NULL DEFAULT (unixepoch()),
  verified_at      INTEGER,
  screenshot_id    TEXT
);
CREATE INDEX IF NOT EXISTS idx_findings_run     ON findings(audit_run_id);
CREATE INDEX IF NOT EXISTS idx_findings_file    ON findings(audit_run_id, file);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(audit_run_id, severity);

-- Prioritized tasks (written by Priority Resolver Workflow)
CREATE TABLE IF NOT EXISTS tasks (
  task_id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  audit_run_id     TEXT NOT NULL,
  title            TEXT NOT NULL,
  finding_ids      TEXT NOT NULL,  -- JSON array
  priority_score   REAL NOT NULL DEFAULT 0,
  multipliers      TEXT NOT NULL DEFAULT '[]',  -- JSON array
  status           TEXT NOT NULL DEFAULT 'backlog',
  assigned_agent   TEXT,
  commit_sha       TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  conflict_flag    INTEGER NOT NULL DEFAULT 0,
  conflict_reason  TEXT,
  lock_expires_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_run_status ON tasks(audit_run_id, status);

-- Agent registry (written by coordinator, read by coordinator + dashboard)
CREATE TABLE IF NOT EXISTS agent_registry (
  agent_id    TEXT PRIMARY KEY,
  agent_type  TEXT NOT NULL,
  audit_run_id TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'boot',
  phase       INTEGER NOT NULL DEFAULT 1,
  spawned_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  done_at     INTEGER,
  queue_cursor INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_registry_run ON agent_registry(audit_run_id, status);

-- Budget + run state (one row per audit run)
CREATE TABLE IF NOT EXISTS run_budget (
  audit_run_id     TEXT PRIMARY KEY,
  budget_usd       REAL NOT NULL DEFAULT 5.0,
  spent_usd        REAL NOT NULL DEFAULT 0.0,
  paused           INTEGER NOT NULL DEFAULT 0,  -- 1 = halt all agents
  phase            TEXT NOT NULL DEFAULT 'boot',
  production_score INTEGER NOT NULL DEFAULT 0,
  alert_50_sent    INTEGER NOT NULL DEFAULT 0,
  alert_80_sent    INTEGER NOT NULL DEFAULT 0,
  alert_95_sent    INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Token usage log (one row per LLM call)
CREATE TABLE IF NOT EXISTS token_usage (
  usage_id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  audit_run_id      TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  model             TEXT NOT NULL,
  task_type         TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  cached_tokens     INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL NOT NULL,
  ts                INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Salvation reports (written by salvation protocol)
CREATE TABLE IF NOT EXISTS salvation_reports (
  salvation_id         TEXT PRIMARY KEY,
  audit_run_id         TEXT NOT NULL,
  agent_id             TEXT NOT NULL,
  finding_id           TEXT,
  attempts_json        TEXT NOT NULL,
  research_sources     TEXT NOT NULL,
  human_recommendation TEXT NOT NULL,
  estimated_effort     TEXT NOT NULL,
  blocking_task_ids    TEXT NOT NULL DEFAULT '[]',
  broadcast_message    TEXT NOT NULL,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Agent errors (every error writes here — no silent failures)
CREATE TABLE IF NOT EXISTS agent_errors (
  error_id     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  audit_run_id TEXT NOT NULL,
  agent_id     TEXT NOT NULL,
  error_type   TEXT NOT NULL,
  error_msg    TEXT NOT NULL,
  file_path    TEXT,
  ts           INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── TRIGGERS: Budget enforcement ──────────────────────────────────────────

-- After every token_usage insert: add to spent_usd and check thresholds
CREATE TRIGGER IF NOT EXISTS trg_token_usage_after_insert
AFTER INSERT ON token_usage
BEGIN
  UPDATE run_budget
  SET spent_usd  = spent_usd + NEW.cost_usd,
      updated_at = unixepoch()
  WHERE audit_run_id = NEW.audit_run_id;

  -- Pause if over budget
  UPDATE run_budget
  SET paused = 1
  WHERE audit_run_id = NEW.audit_run_id
    AND spent_usd >= budget_usd
    AND paused = 0;

  -- Alert at 50%
  UPDATE run_budget
  SET alert_50_sent = 1
  WHERE audit_run_id = NEW.audit_run_id
    AND alert_50_sent = 0
    AND spent_usd >= budget_usd * 0.50;

  -- Alert at 80%
  UPDATE run_budget
  SET alert_80_sent = 1
  WHERE audit_run_id = NEW.audit_run_id
    AND alert_80_sent = 0
    AND spent_usd >= budget_usd * 0.80;

  -- Alert at 95%
  UPDATE run_budget
  SET alert_95_sent = 1
  WHERE audit_run_id = NEW.audit_run_id
    AND alert_95_sent = 0
    AND spent_usd >= budget_usd * 0.95;
END;
```

---

DO NOT:
- Write any TypeScript logic in types/index.ts (interfaces only, no functions)
- Add extra tables to schema.sql that are not listed above
- Change column names
- Add runtime dependencies

SUCCESS CRITERIA:
□ src/types/index.ts exports all interfaces listed above — npx tsc --noEmit passes
□ src/db/schema.sql contains all 8 tables + the trigger
□ Schema creates successfully: wrangler d1 execute auditengine-d1 --local --file=src/db/schema.sql

SESSION END:
1. Update BUILD_STATE.md: src/types/index.ts ✅, src/db/schema.sql ✅
2. Add S01 row to SESSION_LOG.md
3. git add -A && git commit -m "S01: types + D1 schema"
```

---

---

# SESSION S02 — LLM Gateway + Model Router
**Goal:** Build the only file that is allowed to call external LLM APIs. If this is wrong, every other session is wrong.

---

## COPY-PASTE PROMPT FOR S02

```
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
SPEC REFERENCE: Implementation_Specs_Reference.md — SPEC-07 (LLM Gateway)

READ FIRST (mandatory before writing):
- src/types/index.ts
- BUILD_STATE.md (confirm S01 is ✅ DONE before proceeding)

IF S01 IS NOT ✅ DONE: stop and say "S01 must complete first."

---

TASK 1 — src/lib/llm-gateway.ts

Implement these functions in this exact order. Import types from '../types/index.ts'.

```typescript
import type { Env, LLMCallParams, NormalizedResponse, RawUsage,
              Provider, Model, DashboardEvent } from '../types/index'

// 1. Provider endpoints — exact values, do not modify URLs
const ENDPOINTS: Record<string, string> = {
  "kimi-k3":    "https://api.moonshot.cn/v1/chat/completions",
  "kimi-k2.6":  "https://api.moonshot.cn/v1/chat/completions",
  "minimax-m3": "https://api.minimax.chat/v1/text/chatcompletion_pro",
}

// 2. Pricing per 1,000,000 tokens in USD (verified August 2026)
const PRICING: Record<string, { fresh: number; cached: number; output: number }> = {
  "kimi-k3":    { fresh: 3.00,  cached: 0.30, output: 15.00 },
  "kimi-k2.6":  { fresh: 0.95,  cached: 0.19, output:  4.00 },
  "minimax-m3": { fresh: 0.30,  cached: 0.06, output:  1.20 },
}

// 3. Custom error classes
class RateLimitError extends Error { constructor(msg: string) { super(msg); this.name = 'RateLimitError' } }
class BudgetExhaustedError extends Error { constructor(msg: string) { super(msg); this.name = 'BudgetExhaustedError' } }

// 4. calcCostUsd — exact formula from spec
function calcCostUsd(model: string, usage: RawUsage): number

// 5. normalizeResponse — Kimi and MiniMax return different shapes
// Kimi: { choices: [{ message: { content } }], usage: { prompt_tokens, completion_tokens, prompt_tokens_details?: { cached_tokens } } }
// MiniMax: { choices: [{ messages: [{ text }] }], usage: { total_tokens } }
// MiniMax does NOT split prompt/completion — estimate 75% prompt / 25% completion
function normalizeResponse(provider: Provider, raw: unknown): NormalizedResponse

// 6. fetchWithRetry — exponential backoff for 429
// maxRetries = 4, initial delay = 1000ms, cap = 32000ms
// Respect Retry-After header if present
async function fetchWithRetry(url: string, init: RequestInit, maxRetries?: number): Promise<Response>

// 7. getApiKey — reads from env secrets, never hardcoded
function getApiKey(provider: Provider, env: Env): string

// 8. routeToModel — delegates to model-router.ts (import from './model-router')
// Returns { model, provider, maxTokens }

// 9. llmCall — the main exported function
// Steps:
//   a. Check budget (SELECT paused FROM run_budget WHERE audit_run_id = ?)
//      If paused = 1: throw BudgetExhaustedError
//   b. Route to model via routeToModel()
//   c. Build fetch request body (handle Kimi vs MiniMax request format difference)
//   d. Call fetchWithRetry()
//   e. Parse and normalizeResponse()
//   f. calcCostUsd()
//   g. Write to token_usage table in D1
//   h. Broadcast token_usage DashboardEvent
//   i. Return NormalizedResponse
export async function llmCall(params: LLMCallParams, env: Env): Promise<NormalizedResponse>
```

IMPORTANT for Kimi vs MiniMax request body format:
- Kimi uses standard OpenAI format: { model, messages, max_tokens }
- MiniMax uses: { model, messages, tokens_to_generate }
  AND MiniMax messages use "text" field not "content" for user messages.
  Normalize before sending.

---

TASK 2 — src/lib/model-router.ts

The router returns which model to use for each TaskType.
Import TaskType, Model, Provider from '../types/index'.

```typescript
export interface RouteDecision {
  model:     Model
  provider:  Provider
  maxTokens: number
}

// 13 routing rules — implement exactly these mappings:
// deep_audit          → kimi-k3,    100_000 tokens
// simple_analysis     → kimi-k2.6,  32_000 tokens
// cross_read_summary  → kimi-k2.6,  16_000 tokens
// salvation_research  → kimi-k3,    32_000 tokens
// visual_qa_script    → minimax-m3, 8_000 tokens
// verification        → kimi-k2.6,  32_000 tokens
// trace_analysis      → kimi-k3,    64_000 tokens
// conflict_resolution → kimi-k3,    32_000 tokens
// (5 remaining rules: apply kimi-k2.6 at 16_000 as default for any unlisted TaskType)

// Override rule: if a file is > 400 lines AND taskType is deep_audit,
// force maxTokens = 100_000 regardless of other settings.
// "budget override": if run_budget.spent_usd > 80% of budget_usd,
// downgrade kimi-k3 → kimi-k2.6 EXCEPT for salvation_research and trace_analysis.

export function routeToModel(taskType: TaskType, fileLineCount?: number): RouteDecision
export function applyBudgetOverride(decision: RouteDecision, spentPct: number): RouteDecision
```

---

DO NOT:
- Call any model directly from any other file — all calls go through llmCall()
- Hardcode API keys anywhere
- Add model names not listed above
- Modify the pricing table without updating the comment timestamp

SUCCESS CRITERIA:
□ npx tsc --noEmit passes with no errors
□ routeToModel('deep_audit') returns { model: 'kimi-k3', provider: 'kimi', maxTokens: 100000 }
□ routeToModel('visual_qa_script') returns { model: 'minimax-m3', provider: 'minimax', maxTokens: 8000 }
□ applyBudgetOverride() downgrades k3→k2.6 when spentPct >= 0.80
□ applyBudgetOverride() does NOT downgrade salvation_research even at 90% spend
□ llmCall() function exists and is exported

SESSION END:
1. Update BUILD_STATE.md: llm-gateway.ts ✅, model-router.ts ✅
2. Add S02 row to SESSION_LOG.md
3. git add -A && git commit -m "S02: LLM gateway + model router"
```

---

---

# SESSION S03 — Verification Gate
**Goal:** Build the deterministic code gate. This is NOT an LLM call. This is pure TypeScript with no interpretation.

---

## COPY-PASTE PROMPT FOR S03

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. Do not write a single line until you have read it.
2. Read src/types/index.ts before implementing any function. Do not invent types.
3. Read the SPEC section referenced in this prompt before writing any logic.
4. Do not invent API endpoints, model names, table names, or field names.
5. If unsure about a Cloudflare API: write // TODO: VERIFY CLOUDFLARE API — DO NOT GUESS
6. Do not touch files outside the scope of this session.
7. After completing, update BUILD_STATE.md accurately.
8. SPEC CONFLICT: stop and describe.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-04 (Verification Gate) — read from docs/

READ FIRST: src/types/index.ts, BUILD_STATE.md (S01+S02 must be ✅)

---

TASK — src/lib/gate.ts

The gate runs 4 checks IN STRICT ORDER. Stop at first failure.
Import GateResult, GateContext, ValidatedFinding from '../types/index'.

```typescript
// CHECK 1: Banned phrase scan (run BEFORE JSON parse — cheap string search)
// These exact phrases trigger rejection (case-insensitive):
const BANNED_PHRASES = [
  "production ready", "looks good", "should work", "seems correct",
  "appears to", "likely works", "no issues found", "clean code",
  "well structured", "everything looks", "i believe", "i think",
  "in my opinion", "great job", "nicely done", "impressive"
]
// Return: passed=false, reason="Banned phrase(s) detected: "x", "y". Remove and resubmit."
// rejected_phrases: list of phrases found

// CHECK 2: JSON parsability
// Strip accidental markdown fences before parsing:
//   rawOutput.replace(/^```json\s*/m, "").replace(/^```\s*/m, "").trim()
// Must be a JSON array — if object or primitive: fail
// Empty array [] is VALID — return passed=true, findings=[]

// CHECK 3: Schema validation per finding (loop over every finding in array)
// Required fields: finding_id, severity, category, file, evidence_quote, description, verified_by
// Severity must be exactly: critical | high | medium | low | info
// evidence_quote minimum length: 8 characters
// evidence_quote MUST exist in ctx.currentFileContent (exact substring match)
//   This is the core anti-hallucination check — no invented quotes pass
// impact required for critical and high severity (minimum 20 chars)
// file must exactly match ctx.currentFile

// CHECK 4: Duplicate detection (async D1 query)
// SELECT finding_id FROM findings WHERE audit_run_id=? AND file=? AND evidence_quote=?
// If duplicate: do NOT fail — silently skip + increment recurrence_count
// Only non-duplicate findings go into the returned array

export async function runGate(
  rawOutput: string,
  ctx: GateContext,
  db: D1Database
): Promise<GateResult>
```

RULES for this session:
- The function is pure logic + D1 queries. No LLM calls. No fetch() to external APIs.
- Every check must return the exact rejection message structure from the spec.
- Do not add checks not listed. Do not reorder the 4 checks.

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ runGate("production ready", ...) returns passed=false, rejected_phrases=["production ready"]
□ runGate("[]", ...) returns passed=true, findings=[]
□ runGate with evidence_quote not in currentFileContent returns passed=false
□ runGate with valid JSON array + valid finding returns passed=true

SESSION END:
1. BUILD_STATE.md: src/lib/gate.ts ✅
2. SESSION_LOG.md row
3. git add -A && git commit -m "S03: verification gate"
```

---

---

# SESSION S04 — Constitution Files (11 .md files)
**Goal:** Create all agent constitutions. These are pure markdown — no TypeScript. They define how each agent thinks.

---

## COPY-PASTE PROMPT FOR S04

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. Confirm S01-S03 are ✅ before proceeding.
2. These are markdown files — no TypeScript, no JSON, no code.
3. Do not invent categories not listed per agent type below.
4. Do not touch files outside the scope of this session.
5. After completing, update BUILD_STATE.md.

---

PROJECT: AuditEngine
THIS SESSION: Create 11 constitution markdown files in src/constitutions/

Each file must follow this structure:
# [Agent Type] Agent Constitution — AuditEngine v1.0

## IDENTITY
You are the [Type] Specialist Agent for AuditEngine. You analyze [description].

## MANDATE
[What this agent is responsible for finding]

## FINDING CATEGORIES
[List every category this agent can use — these are the only valid category values]

## EVIDENCE STANDARDS
[What counts as acceptable evidence for each finding type]

## SEVERITY RULES
[When to use critical/high/medium/low/info for this agent type]

## BANNED BEHAVIORS
- Never use: production ready, looks good, should work, seems correct, appears to,
  likely works, no issues found, clean code, well structured, everything looks
- Never claim a feature "should work" without tracing the full execution chain
- Never output prose — only JSON arrays
- Never hallucinate code — only quote text that appears in the file

## OUTPUT CONTRACT
Output ONLY a JSON array of findings. No prose. No markdown. No explanation.
If you find nothing, output: []

---

CREATE THESE 11 FILES with appropriate content per agent type:

1. src/constitutions/universal.md
   Shared rules injected into ALL agents. Covers: output format, banned phrases,
   evidence quote requirement, JSON schema, execution trace requirement for
   auth/injection/xss/event_handler/api_contract categories.

2. src/constitutions/security.md
   Categories: auth_bypass, injection, xss, csrf, secret_exposure, insecure_deserialization,
   broken_access_control, path_traversal, open_redirect, missing_rate_limit,
   dependency_cve, missing_security_header, privilege_escalation

3. src/constitutions/api.md
   Categories: broken_api_contract, missing_validation, unhandled_error_response,
   missing_auth_middleware, cors_misconfiguration, api_versioning_absent,
   response_data_leak, missing_rate_limit_api, undocumented_endpoint

4. src/constitutions/frontend.md
   Categories: missing_event_handler, dead_button, unhandled_promise_rejection,
   stale_ui_after_action, missing_loading_state, accessibility_violation,
   xss_dom, missing_error_boundary, console_error_in_production

5. src/constitutions/database.md
   Categories: missing_index, n_plus_one_query, missing_transaction, raw_sql_injection_risk,
   missing_migration, schema_drift, missing_foreign_key_constraint,
   unparameterized_query, cascade_delete_risk

6. src/constitutions/architecture.md
   Categories: circular_dependency, god_object, missing_interface_contract,
   broken_module_boundary, hardcoded_config, missing_environment_validation,
   tight_coupling, missing_abstraction_layer

7. src/constitutions/testing.md
   Categories: no_test_coverage, missing_edge_case, test_relies_on_order,
   missing_mock_for_external, no_assertion, test_covers_wrong_path,
   missing_integration_test, flaky_test_pattern

8. src/constitutions/performance.md
   Categories: missing_cache, unnecessary_re_render, blocking_operation_in_main_thread,
   memory_leak_pattern, large_bundle_no_split, unindexed_sort_column,
   over_fetching, missing_pagination

9. src/constitutions/devops.md
   Categories: missing_health_check, missing_rollback_plan, secret_in_env_file,
   no_container_resource_limit, missing_liveness_probe, deploy_without_migration,
   missing_monitoring_alert, untagged_docker_image

10. src/constitutions/documentation.md
    Categories: missing_jsdoc, undocumented_env_var, missing_readme_section,
    outdated_comment, missing_api_doc, broken_example_in_readme,
    undocumented_error_code, missing_changelog_entry

11. src/constitutions/visual-qa.md
    Categories: visual_qa_failure, dead_button, http_500_on_navigation,
    blank_page_on_error, stale_ui_after_action, privilege_ui_visible,
    console_error_on_page_load, no_network_request_on_submit

---

RULES:
- Each file must include the BANNED BEHAVIORS section with the same banned phrases list
- Each file must include the OUTPUT CONTRACT section
- The Finding Categories section must list the exact category strings that will be used
  in D1 findings.category — these are the canonical values, no variations

SUCCESS CRITERIA:
□ All 11 files exist in src/constitutions/
□ Each file has all 6 required sections
□ No file contains TypeScript or JSON — markdown only
□ Category strings use snake_case throughout

SESSION END:
1. BUILD_STATE.md: all 11 constitution files ✅
2. SESSION_LOG.md row
3. git add -A && git commit -m "S04: constitution files (11 agents)"
```

---

---

# SESSION S05 — Agent Base: State Machine
**Goal:** Build the tick() state machine in base-agent.ts. This is the core agent loop. Every state transition must match the spec exactly.

---

## COPY-PASTE PROMPT FOR S05

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S04 must all be ✅ or stop.
2. Read src/types/index.ts fully before writing any code.
3. Read SPEC-01 (ReAct Agent Loop) from docs/ before writing any code.
4. Do not invent state transitions not in the spec.
5. If unsure about a Cloudflare API: // TODO: VERIFY CLOUDFLARE API — DO NOT GUESS
6. Do not touch files outside this session.
7. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-01 (ReAct Agent Loop) — 11 state transitions

---

TASK — src/agents/base-agent.ts (PART 1: state machine only)

Create this file. Import from '../types/index'. Import llmCall from '../lib/llm-gateway'.
Import runGate from '../lib/gate'. Do NOT write message builder functions yet (those are S06).

DOMAIN MAP — file path domain tagging (needed for boot state):
```typescript
export const DOMAIN_MAP: Record<AgentType, string> = {
  security:      "backend",
  api:           "backend",
  frontend:      "frontend",
  database:      "database",
  architecture:  "all",
  testing:       "test",
  performance:   "all",
  devops:        "config",
  documentation: "docs",
  visual_qa:     "all"
}
```

Implement tick() with these 11 cases. Each case must do EXACTLY what is listed:

CASE "boot":
  - Load constitution from R2: `constitutions/${state.agentType}.md`
  - Load spec from R2: `SYSTEM_SPEC.md`
  - If R2.get() returns null for constitution: log error to agent_errors table, continue with empty string
  - Query repo_manifest for files in this agent's domain
  - Return new state with: constitutionText, specText, fileQueue, queueCursor=0, state="claiming"

CASE "claiming":
  - If queueCursor >= fileQueue.length: return state="done"
  - filePath = fileQueue[queueCursor]
  - INSERT OR IGNORE INTO claims(audit_run_id, agent_id, file_path) VALUES(?,?,?)
  - If changes === 0: another agent claimed it — increment cursor, stay in "claiming"
  - If changes === 1: call persistCursor() BEFORE reading, set state="reading"

CASE "reading":
  - Fetch from R2: `chunks/${state.auditRunId}/${state.currentFile}/0`
  - If null: call logMissingFile(), increment cursor, state="claiming"
  - On success: set currentFileContent, state="cross_reading"

CASE "cross_reading":
  - D1 query: SELECT finding_id, severity, category, file, description, agent_id
    FROM findings WHERE audit_run_id=? AND agent_id!=? AND ts > unixepoch()-3600
    ORDER BY ts DESC LIMIT 50
  - Set crossAgentContext = results, state="analyzing"

CASE "analyzing":
  - Call llmCall() with: agentId, agentType, taskType="deep_audit",
    messages=buildAnalysisMessages(state) [STUB — write as empty array for now],
    auditRunId, db, broadcast
  - Set lastModelOutput=response.text, state="gate_checking"

CASE "gate_checking":
  - Call runGate(state.lastModelOutput, ctx, db)
  - If passed: set validatedFindings=result.findings, state="writing"
  - If not passed:
    - newFailCount = gateFailCount + 1
    - If newFailCount >= 3: state="salvation"
    - Else: add reason to gateRejectionHistory, set gateRejectionReason=result.reason,
      gateFailCount=newFailCount, state="analyzing"

CASE "writing":
  - For each finding in validatedFindings:
    - INSERT INTO findings (all columns) — map from ValidatedFinding to D1 row
    - broadcast({ type:"finding_created", audit_run_id, payload:{ finding } })
  - increment queueCursor, state="looping"

CASE "looping":
  - Call persistCursor()
  - Set currentFile=null, currentFileContent=null, lastModelOutput=null,
    gateRejectionReason=null, gateRejectionHistory=[], gateFailCount=0
  - state="claiming"

CASE "done":
  - UPDATE agent_registry SET status='done', done_at=unixepoch() WHERE agent_id=?
  - broadcast({ type:"agent_state_change", payload:{status:"done"} })
  - Return state unchanged

CASE "paused":
  - UPDATE agent_registry SET status='paused' WHERE agent_id=?
  - Return state unchanged

CASE "salvation":
  - Call runSalvationProtocol(state, env) — write as stub: async function runSalvationProtocol(...) {}
  - Increment queueCursor, state="claiming"

ALWAYS at start of tick() — check budget before switching:
  SELECT paused FROM run_budget WHERE audit_run_id=?
  If paused=1 and current state is not already "paused": return state="paused"

---

HELPER FUNCTIONS to implement in this session:

async function persistCursor(agentId: string, cursor: number, db: D1Database): Promise<void>
  — UPDATE agent_registry SET queue_cursor=? WHERE agent_id=?

async function logMissingFile(filePath: string, agentId: string, db: D1Database): Promise<void>
  — INSERT INTO agent_errors(audit_run_id, agent_id, error_type, error_msg, file_path)

function buildGateContext(state: AgentPersistentState): GateContext
  — construct GateContext from state fields

STUB (implement in S06):
function buildAnalysisMessages(state: AgentPersistentState): Message[]
  — return [] for now, marked with // STUB — implemented in S06

export async function tick(state: AgentPersistentState, env: Env): Promise<AgentPersistentState>

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ tick() handles all 11 states
□ No state transition is missing from the spec
□ buildAnalysisMessages is stubbed and returns []
□ runSalvationProtocol is stubbed

SESSION END:
1. BUILD_STATE.md: base-agent.ts (state machine) ✅
2. SESSION_LOG.md row
3. git commit -m "S05: agent state machine (tick)"
```

---

---

# SESSION S06 — Agent Base: Message Builders
**Goal:** Replace the S05 stubs with the real message construction functions. This is where prompt engineering is encoded.

---

## COPY-PASTE PROMPT FOR S06

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S05 must be ✅.
2. Read src/types/index.ts fully.
3. Read src/agents/base-agent.ts fully before touching it.
4. Read SPEC-02 (Prompt Construction) and SPEC-03 (Execution Trace) from docs/.
5. Do not change the tick() function or any state logic from S05.
6. Do not touch other files.
7. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-02 (Prompt Construction), SPEC-03 (Execution Trace)

---

TASK — Replace stubs in src/agents/base-agent.ts

DO NOT MODIFY ANYTHING EXCEPT:
- Replace the buildAnalysisMessages stub
- Add the new builder functions below

IMPLEMENT THESE 4 FUNCTIONS:

1. buildAnalysisMessages(state: AgentPersistentState): Message[]
   Message slot order is FIXED (changing it breaks Kimi prompt caching):
   Slot 0 — role:"system" — content: state.constitutionText
   Slot 1 — role:"system" — content: "## PROJECT SPECIFICATION\n" + state.specText
   Slot 2 — role:"user"   — content: buildCrossAgentBlock(state.crossAgentContext)
             ONLY added if crossAgentContext.length > 0
   Slot 3 — role:"user"   — content: gate rejection message
             ONLY added if state.gateRejectionReason is not null
             Exact format:
             "## GATE REJECTION — YOUR PREVIOUS OUTPUT WAS REJECTED\n" +
             "Reason: {reason}\n" +
             "You must resubmit your analysis without the rejected content.\n" +
             "Do NOT use banned phrases. Do NOT omit evidence_quote.\n" +
             "Every finding must follow the exact JSON schema below."
   Slot 4 — role:"user"   — content: buildFileAnalysisBlock(state)

2. buildFileAnalysisBlock(state: AgentPersistentState): string
   The exact template (copy from SPEC-02 section 2.2):
   - Header: "## FILE UNDER ANALYSIS\nPath: {file}\nAudit run: {auditRunId}\nYour agent type: {agentType}"
   - File content wrapped in triple backticks
   - Task instructions
   - Required output format (the JSON schema with all 9 fields)
   - Execution trace requirement block
   - Banned phrases list (all 10 phrases)
   All literal text must match spec exactly — AI agents reading constitutions must see identical format.

3. buildCrossAgentBlock(findings: CrossAgentFinding[]): string
   Format per finding:
   "[SEVERITY] category — file\n  description\n"
   Header: "## FINDINGS FROM OTHER AGENTS (read before analyzing)\n..."
   Footer: "END OF CROSS-AGENT CONTEXT"

4. buildTracePrompt(category: string, state: AgentPersistentState): string
   Only inject for these categories (from SPEC-03 trace trigger table):
   auth_bypass, injection, xss, missing_event_handler, broken_api_contract
   For these: return the full trace prompt (DOM → handler → API → middleware → DB → response → UI)
   For all others: return empty string ""

---

DO NOT:
- Change tick() logic
- Change state types
- Rename existing functions

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ buildAnalysisMessages returns messages in slot 0-4 order
□ Slot 2 and Slot 3 are conditional (only present when their data exists)
□ buildTracePrompt returns empty string for "missing_index" category
□ buildTracePrompt returns non-empty string for "auth_bypass" category

SESSION END:
1. BUILD_STATE.md: base-agent.ts (message builders) ✅
2. SESSION_LOG.md
3. git commit -m "S06: agent message builders"
```

---

---

# SESSION S07 — Ingestion Worker
**Goal:** Build the file walker that reads a repo, chunks files into R2, and writes the manifest to D1.

---

## COPY-PASTE PROMPT FOR S07

```
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
```

---

---

# SESSION S08 — Coordinator Durable Object
**Goal:** Build the Coordinator DO that orchestrates phase transitions and spawns agents.

---

## COPY-PASTE PROMPT FOR S08

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S07 must all be ✅.
2. Read src/types/index.ts before writing any code.
3. Read SPEC-09 (Coordinator) from docs/ before writing any logic.
4. Durable Objects use DurableObject base class. The alarm() method is called by the runtime.
   Do not invent DO methods that don't exist.
5. If unsure about a Cloudflare DO API: // TODO: VERIFY CLOUDFLARE API — DO NOT GUESS
6. Do not touch files outside this session.
7. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-09 (Coordinator — Exact Orchestration Logic)

---

TASK — src/workers/coordinator.ts

The Coordinator is a Durable Object. It sets an alarm every 60 seconds and runs
phase transition logic on each alarm tick.

```typescript
import { DurableObject } from 'cloudflare:workers'
import type { Env, AuditPhase, AgentType, AgentRegistryRow } from '../types/index'

export class CoordinatorDurableObject extends DurableObject {
  private auditRunId: string = ""

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  // Called via HTTP POST from ingestion worker when a new audit run starts
  // Body: { audit_run_id: string }
  async fetch(request: Request): Promise<Response>

  // Called every 60 seconds by Cloudflare alarm system
  async alarm(): Promise<void>
}
```

IMPLEMENT alarm() with these exact 7 phase transitions from SPEC-09:

Read current phase from run_budget WHERE audit_run_id = ?

TRANSITION 1: boot → phase-1
  Condition: repo_manifest row exists for this audit_run_id
  Action: spawnAgent("architecture"), spawnAgent("database")
         UPDATE run_budget SET phase='phase-1'

TRANSITION 2: phase-1 → phase-2
  Condition: ALL agents in agent_registry WHERE audit_run_id=? AND phase=1 have status='done'
  Action: spawnAgent() for: security, api, frontend, devops
         spawnVisualQA() — stub for now (implemented in S12)
         UPDATE run_budget SET phase='phase-2'

TRANSITION 3: phase-2 → phase-3
  Condition: ALL phase-2 agents have status='done'
  Action: trigger Priority Resolver Workflow — stub: await runPriorityResolver(auditRunId, env)
         spawnAgent("documentation"), spawnAgent("performance")
         UPDATE run_budget SET phase='phase-3'

TRANSITION 4: phase-3 → phase-4
  Condition: tasks table has at least 1 row for this audit_run_id
  Action: broadcast({ type:"tasks_ready" })
         UPDATE run_budget SET phase='phase-4'

TRANSITION 5: phase-4 monitoring — task picked up
  Condition: any task has status='in_review'
  Action: for each in_review task without a verification agent:
          spawnVerificationAgent(taskId) — stub for now

TRANSITION 6: phase-4 → complete
  Condition: ALL findings with severity IN ('critical','high') have status='resolved'
  Action: recalcProductionScore() — call verification module stub
         broadcast({ type:"audit_complete" })
         UPDATE run_budget SET phase='complete'

TRANSITION 7: budget alert broadcast
  Check run on every alarm tick regardless of phase:
  Read run_budget.alert_50_sent, alert_80_sent, alert_95_sent, spent_usd, budget_usd
  For each flag that changed to 1 since last check:
    broadcast({ type:"budget_alert", payload:{ threshold: 50|80|95, spent_usd, budget_usd } })

IMPLEMENT spawnAgent():
  - INSERT OR IGNORE into agent_registry BEFORE fetching DO stub
  - Get AgentDurableObject stub via env.AGENT_DO.idFromName(agentId)
  - POST to stub: https://agent/boot with { agentId, agentType, auditRunId }
  - Set alarm for next tick: this.ctx.storage.setAlarm(Date.now() + 60_000)

IMPLEMENT broadcast():
  - Get DashboardDurableObject stub via env.DASHBOARD_DO.idFromName("dashboard-" + auditRunId)
  - POST event JSON to the dashboard DO

STUBS (to be replaced in later sessions):
  async function runPriorityResolver(auditRunId: string, env: Env): Promise<void> {}
  async function spawnVerificationAgent(taskId: string, env: Env): Promise<void> {}
  async function spawnVisualQA(auditRunId: string, env: Env): Promise<void> {}

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ CoordinatorDurableObject extends DurableObject
□ alarm() runs all 7 transition checks
□ spawnAgent() inserts to registry BEFORE sending boot request
□ Phase transition checks are in correct order (boot first, complete last)

SESSION END:
1. BUILD_STATE.md: coordinator.ts ✅
2. SESSION_LOG.md
3. git commit -m "S08: coordinator durable object"
```

---

---

# SESSION S09 — Priority Resolver
**Goal:** Build the deterministic priority scoring workflow. No LLM in this file.

---

## COPY-PASTE PROMPT FOR S09

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S08 must all be ✅.
2. Read src/types/index.ts before writing any code.
3. Read SPEC-05 (Priority Resolver) from docs/.
4. This file contains NO LLM calls. Scoring is pure math. No fetch() to model APIs.
5. Do not touch files outside this session.
6. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-05 (Priority Resolver — Deterministic Scoring Algorithm)

---

TASK — src/workers/priority-resolver.ts

This is a Cloudflare Workflow (not a DO, not a regular Worker).
If WorkflowEntrypoint is not available in your @cloudflare/workers-types version,
use: // TODO: VERIFY WorkflowEntrypoint availability — use stub class if needed

```typescript
// Severity base scores — exact values
const SEVERITY_BASE: Record<string, number> = {
  critical: 100,
  high:     75,
  medium:   40,
  low:      15,
  info:     5
}
```

IMPLEMENT scoreFinding(f, allFindings, db) with EXACTLY these 6 multipliers in order:
1. × 1.5 — multiple agents flagged the same file (agentsOnFile.size > 1)
2. × 1.3 — this finding blocks another (same file, this finding is more severe)
3. × 1.2 — file has no_test_coverage finding from testing agent
4. × 0.8 — file is currently locked (task in_progress references this finding_id)
5. × 1.4 — finding.source === "regression"
6. × 1.6 — finding.recurrence_count > 0

Return: { ...finding, priorityScore: Math.round(score * 100) / 100, multipliers: string[] }
The multipliers array is an audit trail: e.g. ["base(100)", "multi_agent(×1.5 — 2 agents on file)"]

IMPLEMENT detectConflicts(findings) — exact rule from spec:
Any Security Agent finding + any Architecture Agent finding on the SAME file = conflict.
Return ConflictGroup[].

IMPLEMENT groupFindingsIntoTasks(scoredFindings) — not in spec detail, use this rule:
Group findings by file. Each file becomes one task.
task.title = "Fix [count] issue(s) in [filename]"
task.finding_ids = JSON.stringify([finding_id, ...])
task.priority_score = highest score among findings in the group
task.multipliers = JSON.stringify(scored multipliers)
task.conflict_flag = 1 if this file appears in any ConflictGroup

IMPLEMENT main workflow function:
async function runPriorityResolver(auditRunId: string, env: Env): Promise<void>
  1. SELECT all findings for this audit_run_id from D1
  2. scoreFinding() for each
  3. Sort by priorityScore DESC
  4. detectConflicts()
  5. groupFindingsIntoTasks()
  6. db.batch(INSERT INTO tasks for each task group)
  7. UPDATE agent_registry SET status='done' for priority_resolver

Export runPriorityResolver for import in coordinator.ts.

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ scoreFinding with critical severity returns base score 100
□ scoreFinding with multi-agent flag returns 100 × 1.5 = 150
□ detectConflicts returns ConflictGroup when security + architecture both flag same file
□ No LLM calls anywhere in this file

SESSION END:
1. BUILD_STATE.md: priority-resolver.ts ✅
2. SESSION_LOG.md
3. git commit -m "S09: priority resolver"
```

---

---

# SESSION S10 — Verification Agent
**Goal:** Build the diff-checking verification agent. This checks whether a fix actually resolved a finding.

---

## COPY-PASTE PROMPT FOR S10

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S09 must all be ✅.
2. Read src/types/index.ts before writing any code.
3. Read SPEC-10 (Verification Agent) from docs/.
4. GitHub API used: GET /repos/{owner}/{repo}/commits/{sha} — this is the real endpoint.
   Do not invent other GitHub endpoints.
5. Do not touch files outside this session.
6. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-10 (Verification Agent — Diff Check Algorithm)

---

TASK — src/workers/verification.ts

IMPLEMENT fetchDiff(commitSha, githubToken):
  URL: https://api.github.com/repos/{owner}/{repo}/commits/{sha}
  Wait — the owner and repo must come from somewhere. Use SYSTEM_SPEC.md fields.
  For now: accept owner and repo as function parameters.
  Headers: Authorization: Bearer {token}, Accept: application/vnd.github.v3+json
  Return the parsed JSON response (commits endpoint returns diff in files[].patch)
  If response.status !== 200: return null

IMPLEMENT verifyTask(task, env) — 6 steps from spec:
  Step 1: fetchDiff(task.commit_sha, env.GITHUB_TOKEN)
  Step 2: Load all findings linked to task.finding_ids (parse JSON array from D1 tasks row)
  Step 3: For each finding:
    - Find its file in diff.files by filename match
    - If file not in diff: resolved=false, reason="File not modified in commit diff"
    - Check if evidence_quote still appears in the AFTER state:
      lines starting with "+" in the patch that include the evidence_quote.trim()
    - resolved = evidence_quote NOT present in after state
  Step 4: Determine taskResult:
    - All resolved → "resolved"
    - None resolved → "failed_verification"
    - Mixed → "needs_revision"
  Step 5: If "resolved": call scheduleRegressionScan() — stub for now
  Step 6: If "failed_verification": escalateSeverity() for each finding
           escalateSeverity: critical stays critical, others go up one level

IMPLEMENT recalcProductionScore(auditRunId, db):
  Formula: (count of critical+high findings with status='resolved' AND verified_at IS NOT NULL)
         / (total count of critical+high findings) × 100
  Clamp to 0–100
  UPDATE run_budget SET production_score=? WHERE audit_run_id=?

IMPLEMENT escalateSeverity(findingId, db):
  Severity ladder: info→low→medium→high→critical
  UPDATE findings SET severity=[next level] WHERE finding_id=?

Export: verifyTask, recalcProductionScore

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ verifyTask() returns "resolved" when evidence_quote not in diff after-state
□ verifyTask() returns "failed_verification" when evidence_quote still in after-state
□ escalateSeverity() moves medium → high

SESSION END:
1. BUILD_STATE.md: verification.ts ✅
2. SESSION_LOG.md
3. git commit -m "S10: verification agent"
```

---

---

# SESSION S11 — Salvation Protocol
**Goal:** Build the salvation fallback. Activates after 3 gate failures on the same finding.

---

## COPY-PASTE PROMPT FOR S11

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S10 must all be ✅.
2. Read src/types/index.ts, src/agents/base-agent.ts before writing.
3. Read SPEC-06 (Salvation Protocol) from docs/.
4. Salvation uses llmCall() — import it. Do not call fetch() directly to any model API.
5. Do not touch files outside this session.
6. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-06 (Salvation Protocol — Full Algorithm)

---

TASK — src/workers/salvation.ts

IMPLEMENT buildSalvationPrompt(state: AgentPersistentState): Message[]
  Returns exactly 3 messages:
  [0] { role:"system", content: state.constitutionText }
  [1] { role:"system", content: state.specText }
  [2] { role:"user",   content: [the salvation prompt template from SPEC-06] }

  The user message must include:
  - "## SALVATION PROTOCOL ACTIVATED"
  - File: {state.currentFile}
  - "Previous gate rejections:" followed by each item in state.gateRejectionHistory
  - The 4 research instructions (known patterns, OWASP, CVEs, remediation path)
  - The exact SalvationReport JSON schema with all fields

IMPLEMENT runSalvationProtocol(state: AgentPersistentState, env: Env): Promise<void>
  1. Call llmCall() with:
     taskType: "salvation_research"
     messages: buildSalvationPrompt(state)
  2. Parse response as SalvationReport JSON
     - Strip markdown fences if present
     - If JSON parse fails: write error to agent_errors + broadcast salvation_activated with error flag
  3. INSERT INTO salvation_reports (all fields from SalvationReport)
  4. broadcast({ type:"salvation_complete", payload:{ salvation_id, finding_id, broadcast_message } })
  5. UPDATE agent_registry SET status='running' — agent continues after salvation

IMPLEMENT parseSalvationReport(text: string): SalvationReport | null
  Strip fences, JSON.parse, validate required fields.
  Return null on any parse failure.

Export: runSalvationProtocol (this replaces the stub in base-agent.ts)

After implementing: update src/agents/base-agent.ts to import and use the real
runSalvationProtocol instead of the empty stub. Only change that one import+call.

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ buildSalvationPrompt returns 3 messages with correct roles
□ parseSalvationReport returns null on invalid JSON
□ runSalvationProtocol writes to salvation_reports table
□ base-agent.ts stub replaced with real import

SESSION END:
1. BUILD_STATE.md: salvation.ts ✅
2. SESSION_LOG.md
3. git commit -m "S11: salvation protocol"
```

---

---

# SESSION S12 — Visual QA Agent
**Goal:** Build the headless browser test agent. Cloudflare Browser Run. No source code reading — only live app testing.

---

## COPY-PASTE PROMPT FOR S12

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S11 must all be ✅.
2. Read src/types/index.ts fully before writing.
3. Read SPEC-08 (Visual QA Agent) from docs/.
4. Cloudflare Browser Run uses puppeteer from 'puppeteer-core'. Import:
   import puppeteer from "@cloudflare/puppeteer"
   This is the only browser automation import allowed.
   Do NOT import playwright, selenium, or any other browser library.
5. Visual QA Agent NEVER reads source files. It only tests the live staging URL.
6. Do not touch files outside this session.
7. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-08 (Visual QA Agent — Browser Test Algorithm)

---

TASK — src/workers/visual-qa.ts

Add to wrangler.toml if not present:
browser = { binding = "BROWSER" }
Add BROWSER: Fetcher to Env interface in src/types/index.ts

IMPLEMENT discoverRoutes(auditRunId, db): Promise<RouteInfo[]>
  4 discovery rules in priority order:
  1. repo_manifest files matching /app\/(.+)\/page\.(tsx|jsx|ts|js)$/ → Next.js app router
  2. repo_manifest files matching /pages\/(.+)\.(tsx|jsx|ts|js)$/ → Next.js pages router
  3. Files named router.ts/router.js/routes.ts/routes.js → mark for manual review (skip for now)
  4. Files containing "express()" or "new Hono()" → skip for now (log as info finding)

  For discovered routes:
  - path = "/" + match group 1 (replace [param] with :param)
  - is_admin = path starts with "/admin"
  - requires_auth = true (default — assume auth unless spec says otherwise)

IMPLEMENT buildQAScriptPrompt(route: RouteInfo, stagingUrl: string): string
  Template from SPEC-08 section 8.2 — exact output format.
  The prompt must include all RULES FOR SCRIPT GENERATION from the spec:
  - First step = navigate
  - Auth fill steps if auth_required
  - Assert after every action
  - Network request assert after every form submit
  - no_console_error assert at end

IMPLEMENT generateQAScript(route: RouteInfo, env: Env): Promise<QAStep[]>
  Call llmCall() with taskType:"visual_qa_script", messages with the script prompt
  Parse response as QAStep[] JSON
  Return empty array on parse failure + log error

IMPLEMENT executeQAScript(steps: QAStep[], stagingUrl: string, browser: Fetcher): Promise<StepResult[]>
  Launch puppeteer browser:
    const b = await puppeteer.launch(browser)
    const page = await b.newPage()
  For each step:
    "navigate" → page.goto(url)
    "click" → page.click(selector)
    "fill" → page.type(selector, value)
    "wait" → page.waitForTimeout(2000)
    "assert" → run the assert_type check:
      "http_status" → check page.url() and response code
      "dom_visible" → page.$$(selector).length > 0
      "dom_text" → check element text content
      "network_request" → page.waitForResponse() with URL pattern match
      "no_console_error" → check collected console errors
    If step.screenshot: await page.screenshot() → store in R2 as screenshots/{auditRunId}/{routePath}/{stepNumber}.png
  Collect StepResult for each step
  Close browser after all steps

IMPLEMENT qaStepToFinding(step, result, route): Finding
  Exact severity map from SPEC-08 section 8.3:
  no_network_request_on_submit → critical
  http_500 → critical
  blank_page_on_error → critical
  privilege_ui_visible → high
  stale_ui_after_action → medium
  console_error → medium
  default → low

IMPLEMENT runVisualQA(auditRunId: string, env: Env): Promise<void>
  1. discoverRoutes()
  2. For each route: generateQAScript() → executeQAScript()
  3. For each failed step: qaStepToFinding() → INSERT INTO findings

Update coordinator.ts: replace spawnVisualQA stub with import of runVisualQA.

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ discoverRoutes parses Next.js app router paths correctly
□ qaStepToFinding maps no_network_request_on_submit to "critical"
□ Browser launched with puppeteer.launch(env.BROWSER)

SESSION END:
1. BUILD_STATE.md: visual-qa.ts ✅
2. SESSION_LOG.md
3. git commit -m "S12: visual QA agent"
```

---

---

# SESSION S13 — Dashboard DO + Frontend
**Goal:** Build the real-time WebSocket dashboard. Agents broadcast events — the dashboard renders them live.

---

## COPY-PASTE PROMPT FOR S13

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S12 must all be ✅.
2. Read src/types/index.ts. Specifically DashboardEvent, DashboardEventType (12 event types).
3. Do not invent WebSocket APIs. Cloudflare DO WebSocket uses:
   this.ctx.acceptWebSocket(request) — returns WebSocket object
   this.ctx.getWebSockets() — returns WebSocket[]
   ws.send(string) — send message
   Do NOT use ws.on('message') — Durable Objects use webSocketMessage() method instead.
4. Do not touch files outside this session.
5. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-12 Phase E checklist

---

TASK 1 — src/dashboard/dashboard-do.ts

```typescript
import { DurableObject } from 'cloudflare:workers'
import type { Env, DashboardEvent } from '../types/index'

export class DashboardDurableObject extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  async fetch(request: Request): Promise<Response>
  // If Upgrade: websocket → accept WebSocket connection
  // If POST with JSON body → treat as broadcast event, distribute to all connected clients
  // Else → return 400

  broadcast(event: DashboardEvent): void
  // this.ctx.getWebSockets().forEach(ws => ws.send(JSON.stringify(event)))

  // Durable Object WebSocket event handlers:
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>
  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void>
  async webSocketError(ws: WebSocket, error: unknown): Promise<void>
}
```

TASK 2 — src/dashboard/index.html

Single HTML file with inline CSS and JS. No external dependencies.
Must handle all 12 DashboardEventType values:
  agent_spawned, agent_state_change, finding_created, gate_rejected, gate_passed,
  salvation_activated, salvation_complete, task_created, task_status_change,
  budget_alert, token_usage, audit_complete

Build these panels:
  PANEL 1: Agent Status Grid
    - One card per agent type (10 agents)
    - Show: current state, files processed, findings count
    - Updates on: agent_spawned, agent_state_change

  PANEL 2: Findings Feed (live scroll)
    - Shows last 50 findings as they arrive
    - Color-coded by severity: critical=red, high=orange, medium=yellow, low=blue, info=gray
    - Updates on: finding_created

  PANEL 3: Task Board (Kanban — 4 columns)
    - Backlog | In Progress | In Review | Done
    - Cards show: priority score, finding count, conflict flag (red badge if conflict)
    - Updates on: task_created, task_status_change

  PANEL 4: Budget Tracker
    - Progress bar: spent / total USD
    - Color: green → yellow at 50% → orange at 80% → red at 95%
    - Token usage table: model | calls | tokens | cost
    - Updates on: token_usage, budget_alert

  PANEL 5: Salvation Reports (collapsible)
    - Shows each salvation: file, attempts, research sources, human recommendation
    - Updates on: salvation_activated, salvation_complete

WebSocket connection logic:
  const ws = new WebSocket(location.href.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws')
  ws.onmessage = (e) => { const event = JSON.parse(e.data); handleEvent(event) }
  Reconnect on close: setTimeout(() => reconnect(), 3000)

UI rules:
  - No frameworks, no build step — plain HTML/CSS/JS only
  - Dark theme (background #111, text #e5e5e5)
  - Must work in browser without any bundling
  - Critical findings: red border flash animation on finding_created
  - budget_alert at 95%: full-screen overlay warning

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes for dashboard-do.ts
□ DashboardDurableObject extends DurableObject
□ broadcast() calls this.ctx.getWebSockets().forEach(ws => ws.send(...))
□ webSocketMessage() handler exists
□ index.html handles all 12 event types
□ index.html connects via WebSocket on page load

SESSION END:
1. BUILD_STATE.md: dashboard-do.ts ✅, index.html ✅
2. SESSION_LOG.md
3. git commit -m "S13: dashboard DO + frontend"
```

---

---

# SESSION S14 — Entry Point + Wrangler Final + Deploy
**Goal:** Wire everything into src/index.ts, finalize wrangler.toml, create the D1 and R2 resources, and deploy.

---

## COPY-PASTE PROMPT FOR S14

```
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
```

---

---

# SESSION S15 — Tests
**Goal:** Write and pass gate tests and model router tests. These are the minimum acceptance tests for MVP.

---

## COPY-PASTE PROMPT FOR S15

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S14 must all be ✅.
2. Read src/lib/gate.ts and src/lib/model-router.ts before writing tests.
3. Use vitest only (already in package.json). Do not add jest or mocha.
4. Do not modify gate.ts or model-router.ts to make tests pass. Fix the tests if logic is correct.
   Only fix the source file if you find a genuine logic error in it.
5. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
TEST FRAMEWORK: vitest

---

TASK 1 — test/helpers.ts

Create mock D1Database for gate tests:
```typescript
export function mockD1(findingExists = false): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: () => Promise.resolve(findingExists ? { finding_id: 'F-0001' } : null),
        run: () => Promise.resolve({ changes: 1, meta: {} }),
        all: () => Promise.resolve({ results: [] })
      })
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 })
  } as unknown as D1Database
}

export function makeGateContext(overrides: Partial<GateContext> = {}): GateContext {
  return {
    agentId: 'agent-001',
    agentType: 'security',
    auditRunId: 'run-001',
    currentFile: 'src/auth.ts',
    currentFileContent: 'const token = req.headers.authorization',
    claimLog: new Set(),
    ...overrides
  }
}
```

TASK 2 — test/gate.test.ts

Write these exact test cases:

1. "rejects banned phrase 'production ready'"
   - Input: "production ready code here"
   - Expected: passed=false, rejected_phrases includes "production ready"

2. "passes empty JSON array"
   - Input: "[]"
   - Expected: passed=true, findings=[]

3. "rejects non-array JSON"
   - Input: '{"finding": "x"}'
   - Expected: passed=false, reason includes "not a JSON array"

4. "rejects finding with missing evidence_quote"
   - Input: valid JSON array but evidence_quote is ""
   - Expected: passed=false

5. "rejects evidence_quote not in file content"
   - Input: valid JSON with evidence_quote = "this text is not in the file"
   - ctx.currentFileContent does NOT contain that text
   - Expected: passed=false, reason includes "not found in file content"

6. "passes valid finding with evidence in file"
   - ctx.currentFileContent = "const token = req.headers.authorization"
   - evidence_quote = "req.headers.authorization"
   - All required fields present, severity = "high", impact provided
   - Expected: passed=true, findings.length = 1

7. "requires impact for critical severity"
   - Valid finding but severity="critical" and impact=""
   - Expected: passed=false

8. "strips markdown fences before parsing"
   - Input: "```json\n[]\n```"
   - Expected: passed=true

TASK 3 — test/model-router.test.ts

1. "routes deep_audit to kimi-k3"
   - routeToModel('deep_audit') → { model:'kimi-k3', provider:'kimi', maxTokens:100000 }

2. "routes visual_qa_script to minimax-m3"
   - routeToModel('visual_qa_script') → { model:'minimax-m3', provider:'minimax', maxTokens:8000 }

3. "applyBudgetOverride downgrades at 80%"
   - Input: { model:'kimi-k3', provider:'kimi', maxTokens:100000 }, spentPct=0.82
   - Expected: model='kimi-k2.6'

4. "applyBudgetOverride does NOT downgrade salvation_research"
   - routeToModel('salvation_research') → kimi-k3
   - applyBudgetOverride at 90% → still kimi-k3

5. "applyBudgetOverride does not trigger below 80%"
   - spentPct=0.75 → no downgrade

Run: npx vitest run
All 13 tests must pass before marking done.

---

SUCCESS CRITERIA:
□ npx vitest run exits with 0 failures
□ All 13 test cases pass
□ No tests skipped

SESSION END:
1. BUILD_STATE.md: test/gate.test.ts ✅, test/model-router.test.ts ✅
2. SESSION_LOG.md
3. git commit -m "S15: gate + router tests — all passing"
```

---

---

## ONGOING SESSION RULES (apply to any unplanned session)

If you need to debug, refactor, or extend beyond the 15 planned sessions, use this base prompt:

```
ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST.
2. Read src/types/index.ts before touching any typed code.
3. Read the file you are modifying FULLY before editing it.
4. Do not change interfaces in types/index.ts without documenting the change.
5. Every change to a completed file must be noted in BUILD_STATE.md under KNOWN ISSUES.
6. If unsure about any Cloudflare API: // TODO: VERIFY CLOUDFLARE API — DO NOT GUESS
7. Update BUILD_STATE.md after this session.

PROJECT: AuditEngine
CURRENT PHASE: [paste current BUILD_STATE.md phase summary]
THIS SESSION GOAL: [one sentence — what specifically you are fixing or adding]

READ FIRST:
- BUILD_STATE.md
- [the specific file you're changing]

TASK: [describe exact change]

DO NOT TOUCH: [list files that must not change]

SUCCESS CRITERIA:
□ [exactly what done means — must be testable]
□ npx tsc --noEmit passes
□ BUILD_STATE.md updated
```

---

## WHAT TO DO WHEN THE AI AGENT GOES OFF-SCRIPT

Signs the agent is hallucinating:
- It creates a file not in the task list
- It changes the D1 column names
- It invents a Cloudflare Workers API that you can't verify
- It adds model names not in the spec (e.g. "claude-3-opus", "gpt-4")
- It changes interfaces in types/index.ts without being asked
- It writes "production ready" or "looks good" in a comment

**What to do:**
1. Stop the agent
2. Run: `git diff HEAD` to see what changed
3. Run: `git checkout -- .` to revert everything since last commit
4. Re-read the session prompt and be more explicit about what NOT to do
5. Add the specific hallucination to the DO NOT list and restart

**Never:**
- Let a session end without committing
- Let the agent update BUILD_STATE.md to ✅ before you verify the success criteria
- Run `git add -A && git commit` without reading the diff first

---

## HONEST MVP DEFINITION

AuditEngine MVP is done when:
1. Ingestion worker accepts a file list and writes to R2 + D1 ✅
2. Architecture + Database agents complete a full audit run ✅ (2 agents only for MVP)
3. Findings appear in D1 with evidence_quote that exists in source ✅
4. Gate passes on valid output and fails on banned phrases ✅
5. Priority Resolver writes tasks to D1 ✅
6. Dashboard shows live agent state and findings ✅
7. One full test on a real repo completes end-to-end without crashing ✅

**NOT required for MVP:**
- Visual QA Agent (needs live staging URL)
- Verification Agent (needs GitHub token + real commit SHA)
- Salvation Protocol (needs gate failures to trigger — test separately)
- All 10 agent types running simultaneously (start with 2, add more after MVP)

**Cost estimate for a typical audit run (5,000 lines of code):**
- Architecture agent: ~200k tokens → ~$0.60 on kimi-k3
- Database agent: ~100k tokens → ~$0.30 on kimi-k3
- Total for 2-agent MVP run: ~$1–2 per audit
- Full 10-agent run on a large codebase: $8–15

---

*Last updated: August 2026 | AuditEngine Build Bible v1.0*
