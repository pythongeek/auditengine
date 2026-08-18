# AuditEngine BUILD_STATE
Last updated: 2026-08-18
Session number: 56
Tool: Kimi Code

## STATUS KEY
✅ DONE     — File exists, written to spec, type check passes, committed
🔄 ACTIVE   — Being built RIGHT NOW this session
⚠️ PARTIAL  — Started but incomplete — see Notes column for what is missing
⏳ PENDING  — Not started
❌ BLOCKED  — Waiting on another item listed in KNOWN ISSUES

---

## PHASE A — FOUNDATION

| File | Status | Notes |
|------|--------|-------|
| wrangler.toml | ✅ | S00 |
| package.json | ✅ | S00 |
| tsconfig.json | ✅ | S00 — added lib: ["es2022"] to avoid @cloudflare/workers-types / lib.dom conflict |
| src/index.ts (stub) | ✅ | S00 |
| SYSTEM_SPEC.md (template) | ✅ | S00 — human fills per audit target |
| SESSION_LOG.md | ✅ | S00 |
| src/types/index.ts | ✅ | S01 |
| src/db/schema.sql | ✅ | S01 — PRAGMA journal_mode=WAL commented out because local D1 execution returns SQLITE_AUTH; restore when applying to remote D1 |
| src/lib/llm-gateway.ts | ✅ | S02 — added taskType to RouteDecision to make budget override exceptions implementable |
| src/lib/model-router.ts | ✅ | S02 |
| src/lib/gate.ts | ✅ | S03 |
| src/constitutions/universal.md | ✅ | S04 |
| src/constitutions/security.md | ✅ | S04 |
| src/constitutions/api.md | ✅ | S04 |
| src/constitutions/frontend.md | ✅ | S04 |
| src/constitutions/database.md | ✅ | S04 |
| src/constitutions/architecture.md | ✅ | S04 |
| src/constitutions/testing.md | ✅ | S04 |
| src/constitutions/performance.md | ✅ | S04 |
| src/constitutions/devops.md | ✅ | S04 |
| src/constitutions/documentation.md | ✅ | S04 |
| src/constitutions/visual-qa.md | ✅ | S04 |

## PHASE B — AGENT CORE

| File | Status | Notes |
|------|--------|-------|
| src/agents/base-agent.ts — tick() state machine | ✅ | S05 — added broadcast parameter to tick so llmCall can emit token_usage events; logMissingFile uses empty audit_run_id because the helper lacks that context
| src/agents/base-agent.ts — message builders | ✅ | S06 |
| src/workers/ingestion.ts | ✅ | S07 |

## PHASE C — ORCHESTRATION

| File | Status | Notes |
|------|--------|-------|
| src/workers/coordinator.ts | ✅ | S08 — also added AgentDurableObject class to src/agents/base-agent.ts so S14 entry-point import resolves |
| src/workers/priority-resolver.ts | ✅ | S09 |
| src/workers/verification.ts | ✅ | S10 |
| src/workers/salvation.ts | ✅ | S11 |

## PHASE D — VISUAL QA

| File | Status | Notes |
|------|--------|-------|
| src/workers/visual-qa.ts | ✅ | S12 — route discovery, script generation via LLM, Puppeteer execution, finding persistence |

## PHASE E — DASHBOARD

| File | Status | Notes |
|------|--------|-------|
| src/dashboard/dashboard-do.ts | ✅ | S13 — WebSocket DO with acceptWebSocket / broadcast / handlers |
| src/dashboard/index.html | ✅ | S13 — live dashboard with nav, audit_run_id query param |
| src/dashboard/home.html | ✅ | S16 — landing page with navigation |
| src/dashboard/audit-new.html | ✅ | S16 — audit start form with file upload/paste |
| src/dashboard/dashboard-html.ts | ✅ | Generated module for DASHBOARD_HTML |
| src/dashboard/home-html.ts | ✅ | Generated module for HOME_HTML |
| src/dashboard/audit-new-html.ts | ✅ | S16 + S55 — audit start form with repo URL, branch, loadable file tree, and selected-path audits |

## PHASE F — MULTI-TENANCY FOUNDATION

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S18 — added Tenant, AuthContext, JWT_SECRET, optional tenant_id columns |
| src/db/schema.sql | ✅ | S18 — added tenants table, tenant_id columns/indexes to all tables |
| src/lib/auth.ts | ✅ | S18 — JWT create/verify, authenticate, ensureTenant |
| src/index.ts | ✅ | S18 — Bearer + ?token auth, protected /ingest /audit/start /dashboard /dashboard/ws |
| src/workers/ingestion.ts | ✅ | S18 — reads X-Tenant-Id, writes tenant_id to manifest + budget, halts on empty manifest |
| wrangler.toml | ✅ | S18 — added JWT_SECRET var |
| test/auth.test.ts | ✅ | S18 — 6 auth cases |

## PHASE G — REAL INGESTION PIPELINE

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S19 — added tenantId to AgentPersistentState, repo_ready DashboardEventType |
| src/lib/r2-storage.ts | ✅ | S19 — PRD-style chunk keys, uploadChunk/getChunk/listChunks/deleteChunk |
| src/lib/zip.ts | ✅ | S19 — fflate-based zip extraction for Workers runtime |
| src/lib/github.ts | ✅ | S19 — GitHub zipball fetch with repo URL parsing |
| src/lib/lang.ts | ✅ | S19 — language detection from file extension |
| src/workers/ingestion.ts | ✅ | S19 — multipart zip, GitHub URL, JSON files, content_hash, language, last_modified, repo.ready event |
| src/agents/base-agent.ts | ✅ | S19 — reads chunks via new R2 key format; accepts tenantId in boot body |
| src/workers/coordinator.ts | ✅ | S19 — passes tenant_id when spawning agents |
| src/index.ts | ✅ | S19 — audit/start body includes tenant_id |
| package.json | ✅ | S19 — added fflate dependency |
| test/ingestion.test.ts | ✅ | S19 — 7 ingestion cases |

## PHASE H — SCHEMA ALIGNMENT + MIGRATION

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S20 — added AuditSession, FileRecord, AgentConfig, AuditLog interfaces |
| src/db/schema.sql | ✅ | S20 — added audit_sessions, files, agent_config, audit_logs tables + indexes |
| src/db/migrate.ts | ✅ | S20 — idempotent migration runner with migrateRepoManifestToFiles helper |
| src/workers/coordinator.ts | ✅ | S20 — writes audit_sessions row on start, updates status/score on lifecycle transitions |
| src/agents/base-agent.ts | ✅ | S20 — writes audit_logs for state changes, errors, gate rejections, findings |
| src/workers/ingestion.ts | ✅ | S20 — mirrors repo_manifest rows into files table, ensures audit_sessions.total_files |
| test/ingestion.test.ts | ✅ | S20 — asserts files + audit_sessions SQL is emitted |

## PHASE I — VERIFICATION GATE HARDENING (RFC §4.6.3)

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S21 — added r2 and tenantId to GateContext |
| src/lib/gate.ts | ✅ | S21 — four-gate model: Schema, Evidence, Severity, Cross-Reference; R2 evidence verification; RFC thresholds; S23 — fuzzy Levenshtein ≤ 3 matching, EVIDENCE_NOT_FOUND code, evidence_verified tags; S24 — redacts evidence_quote before D1 persistence |
| src/agents/base-agent.ts | ✅ | S21 — passes env.R2 and tenantId to gate; updated prompt with RFC thresholds and no-extra-fields rule |
| test/helpers.ts | ✅ | S21 — makeMockR2 helper; mockD1 fileExists toggle; GateContext defaults |
| test/gate.test.ts | ✅ | S21 — 16 gate cases covering all four gates |

## PHASE J — BEHAVIORAL TUNING / RFC §4.6.4

| File | Status | Notes |
|------|--------|-------|
| src/lib/agent-config.ts | ✅ | S22 — defaults + D1 CRUD loader for per-tenant per-agent configs |
| src/lib/model-router.ts | ✅ | S22 — routeToModel accepts AgentConfig override for model_name / max_tokens; fixed shared-map mutation bug |
| src/lib/llm-gateway.ts | ✅ | S22 — llmCall loads config by (tenant_id, agentType), passes temperature/top_p/max_tokens; S24 — redacts messages before sending to LLM provider; S25 — checks session token budget before every LLM call |
| src/lib/gate.ts | ✅ | S22 — skips evidence verification when evidence_required === false; S24 — redacts evidence_quote before D1 persistence |
| src/workers/coordinator.ts | ✅ | S22 — seeds default configs for all 10 agent types on audit session creation |
| src/index.ts | ✅ | S22 — protected tenant config endpoints: GET/PATCH /api/v1/tenants/:id/config, GET /api/v1/tenants/:id/score |
| test/agent-config.test.ts | ✅ | S22 — 4 config CRUD cases |
| test/model-router.test.ts | ✅ | S22 — 8 router cases incl. agent_config override and invalid model rejection |

## PHASE K — RISK MITIGATION / GAP-006 SECRETS REDACTION

| File | Status | Notes |
|------|--------|-------|
| src/lib/secrets.ts | ✅ | S24 — pattern detector for private keys, AWS keys, assignment secrets, passwords, connection strings; redactForLLM and redactForStorage helpers |
| src/lib/llm-gateway.ts | ✅ | S24 — Stage 1 pre-LLM redaction on all message content |
| src/lib/gate.ts | ✅ | S24 — Stage 2 post-analysis redaction of evidence_quote before D1 insertion |
| test/secrets.test.ts | ✅ | S24 — 10 detector/redaction cases with realistic example secrets |
| test/gate.test.ts | ✅ | S23/S24 — 21 gate cases incl. fuzzy match, EVIDENCE_NOT_FOUND, and redacted evidence_quote |

## PHASE L — TOKEN BUDGET ENFORCEMENT / GAP-005 + P3-D06

| File | Status | Notes |
|------|--------|-------|
| src/lib/token-budget.ts | ✅ | S25 — plan-based budgets (100K free / 1M paid), cumulative usage lookup, pre-call budget check |
| src/lib/llm-gateway.ts | ✅ | S25 — calls checkTokenBudget before each LLM request; throws BudgetExhaustedError when over budget |
| test/token-budget.test.ts | ✅ | S25 — 9 cases covering plan budgets, usage lookup, and allow/reject decisions |

## PHASE M — RATE LIMITING / GAP-007 + P1-D05 + P3-D07

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S26 — added RATE_LIMIT_DO to Env bindings; added llm_calls_per_minute to AgentConfig |
| src/db/schema.sql | ✅ | S26 — added llm_calls_per_minute column to agent_config table |
| wrangler.toml | ✅ | S26 — added RATE_LIMIT_DO binding and v2 migration for RateLimiterDurableObject |
| src/workers/rate-limiter.ts | ✅ | S26 — per-tenant Durable Object with read (200/min), write (20/min), and llm-agent (configurable) tiered counters; priority bypass |
| src/lib/rate-limit.ts | ✅ | S26 — checkRateLimit gateway helper, checkAgentRateLimit for LLM calls, pure counter logic, X-Priority salvation bypass |
| src/lib/agent-config.ts | ✅ | S26 — DEFAULT_AGENT_CONFIG includes llm_calls_per_minute=10; set/ensure config persist the column |
| src/lib/llm-gateway.ts | ✅ | S26 — calls checkAgentRateLimit before each LLM request; salvation_research task type bypasses the per-agent limit |
| src/index.ts | ✅ | S26 — applies read/write rate limits to all protected API endpoints; X-Priority: salvation bypasses limits |
| test/rate-limiter.test.ts | ✅ | S26 — 10 cases for read/write/llm-agent buckets, priority bypass, and DO stub integration |
| test/agent-config.test.ts | ✅ | S26 — updated mock D1 to handle llm_calls_per_minute |
| test/auth.test.ts | ✅ | S26 — updated mockEnv with RATE_LIMIT_DO |
| test/ingestion.test.ts | ✅ | S26 — updated makeEnv with RATE_LIMIT_DO |

## PHASE N — ASYNC WRITE QUEUE / GAP-007 COMPLETION

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S27 — added `QueuedWriteRequest` and `WRITE_QUEUE` to `Env` |
| wrangler.toml | ✅ | S27 — added `auditengine-write-queue` producer + consumer binding |
| src/lib/router.ts | ✅ | S27 — refactored all route handlers from `src/index.ts` for reuse by fetch and queue handlers |
| src/index.ts | ✅ | S27 — `fetch` handler enqueues rate-limited non-priority writes (202 Accepted); `queue` handler drains messages with per-message ack/retry |
| test/queue.test.ts | ✅ | S27 — 6 queue cases: enqueue on write-limit, 429 on read-limit, priority bypass, consumer drain, 4xx ack, 5xx/throw retry |
| vitest.config.ts | ✅ | S27 — added `cloudflare:workers` alias so tests can import `src/index.ts` |
| test/mocks/cloudflare-workers.ts | ✅ | S27 — minimal `DurableObject` mock for vitest |

## PHASE O — SCHEMA & TYPE CORRECTIONS (GAP-DOC REMEDIATION)

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S28 — expanded `AgentType` to 19 specialists (PRD + RFC union), extended `Finding.status` with `closed`/`superseded`, added `is_regression`, added `AuditSession.last_commit_sha`, added doc-aligned `DashboardEventType` values |
| src/db/schema.sql | ✅ | S28 — `claims` composite PK `(tenant_id, audit_run_id, agent_id, file_path)` per RFC/Build Guide; `findings.is_regression` + status CHECK; `audit_sessions.last_commit_sha` |
| src/lib/agent-config.ts | ✅ | S28 — exported `ALL_AGENT_TYPES` (19 agents); seeds defaults for all |
| src/lib/router.ts | ✅ | S28 — `validAgentTypes` uses `ALL_AGENT_TYPES`; `/audit/start` accepts and forwards `repo_url`, `branch`, `commit_sha` |
| src/agents/base-agent.ts | ✅ | S28 — `DOMAIN_MAP` covers all 19 agent types |
| src/workers/coordinator.ts | ✅ | S28 — seeds configs for all 19 agent types |
| src/workers/ingestion.ts | ✅ | S28 — multipart form accepts repo metadata; `ensureAuditSession` persists `repo_url`, `repo_branch`, `last_commit_sha` |
| src/dashboard/index.html | ✅ | S28 — `AGENT_TYPES` list updated to 19 agents |
| src/dashboard/home.html | ✅ | S28 — feature description lists 19 specialist agents |
| src/dashboard/dashboard-html.ts | ✅ | S28 — regenerated from updated `index.html` |
| src/dashboard/home-html.ts | ✅ | S28 — regenerated from updated `home.html` |
| generate-html-ts.py | ✅ | S28 — helper to regenerate HTML→TS modules |
| test/ingestion.test.ts | ✅ | S28 — added repo metadata persistence test |
| test/agent-config.test.ts | ✅ | S28 — added 19-agent-type seeding test |

## PHASE P — COORDINATOR & AGENT ROSTER (RFC §4.1 / ARCHITECTURE §3.1 / BUILD GUIDE P2-D01)

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S29 — `AgentRegistryRow` gained `domain`, `assigned_files`, `queue_cursor`, and `idle`/`blocked` status; `Env` gained 19 per-agent `*_AGENT_DO` namespaces alongside generic `AGENT_DO` |
| src/db/schema.sql | ✅ | S29 — `agent_registry` gained `domain`, `assigned_files` columns; default status changed to `idle` |
| src/workers/coordinator.ts | ✅ | S29 — 30-second alarm; domain-aware `getRelevantAgentsForPhase`; `spawnAgent` writes `domain` + `assigned_files`; per-agent DO namespace routing via `agentNamespace` helper; exported for tests |
| src/agents/base-agent.ts | ✅ | S29 — file queue now reads from `files.domain_tag` |
| src/workers/agents/*.ts | ✅ | S29 — 19 per-agent Durable Object classes extending `AgentDurableObject` |
| src/workers/agents/index.ts | ✅ | S29 — barrel re-exports all per-agent DO classes |
| src/index.ts | ✅ | S29 — exports all per-agent DO classes |
| wrangler.toml | ✅ | S29 — 19 per-agent DO bindings + `v3` migration for new classes |
| src/constitutions/backend.md | ✅ | S29 — new Backend Specialist constitution |
| src/constitutions/dependency.md | ✅ | S29 — new Dependency Specialist constitution |
| src/constitutions/a11y.md | ✅ | S29 — new Accessibility Specialist constitution |
| src/constitutions/i18n.md | ✅ | S29 — new Internationalization Specialist constitution |
| src/constitutions/logging.md | ✅ | S29 — new Logging Specialist constitution |
| src/constitutions/code_quality.md | ✅ | S29 — new Code Quality Specialist constitution |
| src/constitutions/error_handling.md | ✅ | S29 — new Error Handling Specialist constitution |
| src/constitutions/configuration.md | ✅ | S29 — new Configuration Specialist constitution |
| src/constitutions/refactoring.md | ✅ | S29 — new Refactoring Specialist constitution |
| test/helpers.ts | ✅ | S29 — added `makeMockAgentNamespaces` for 20 agent DO namespace mocks |
| test/auth.test.ts | ✅ | S29 — uses `makeMockAgentNamespaces` |
| test/ingestion.test.ts | ✅ | S29 — uses `makeMockAgentNamespaces` |
| test/queue.test.ts | ✅ | S29 — uses `makeMockAgentNamespaces` |
| test/coordinator.test.ts | ✅ | S29 — 5 new tests for domain-aware spawn, registry fields, and namespace mapping |

## PHASE Q — BOUNDED ReAct, SHARED MEMORY, RECURRENCE (ARCHITECTURE §2.3 / §2.4 / LIFECYCLE §7)

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S30 — `AgentPersistentState` gained `reactIterations`; added `KnowledgeLedgerEntry`; `Env` gained `SHARED_MEMORY_DO` |
| src/db/schema.sql | ✅ | S30 — added `knowledge_ledger` table with tenant/run/file indexes |
| src/workers/shared-memory.ts | ✅ | S30 — `SharedMemoryDurableObject` with `/write` and `/read` RPC handlers backed by `knowledge_ledger` |
| src/index.ts | ✅ | S30 — exports `SharedMemoryDurableObject` |
| src/agents/base-agent.ts | ✅ | S30 — ReAct bound at 5 iterations per chunk; reads/writes `SharedMemoryDO`; `deduplicateFinding` flags regressions and skips open duplicates |
| wrangler.toml | ✅ | S30 — `SHARED_MEMORY_DO` binding and `v4` migration |
| test/mocks/cloudflare-workers.ts | ✅ | S30 — mock `DurableObject` now stores `state` and `env` |
| test/helpers.ts | ✅ | S30 — `makeMockAgentNamespaces` includes `SHARED_MEMORY_DO` |
| test/base-agent.test.ts | ✅ | S30 — tests for recurrence detection and cross-agent context merge |
| test/shared-memory.test.ts | ✅ | S30 — tests for `SharedMemoryDurableObject` write/read/404/405 |

## PHASE R — CLOUDFLARE WORKFLOWS (RFC §3.2 LONG-RUNNING PROCESSES)

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S31 — added `PRIORITY_RESOLVER_WORKFLOW`, `SALVATION_WORKFLOW`, `CONTINUOUS_AUDIT_WORKFLOW` `Workflow` bindings to `Env` |
| src/workflows/priority-resolver-workflow.ts | ✅ | S31 — `WorkflowEntrypoint` wrapping `runPriorityResolver` in a single `step.do` |
| src/workflows/salvation-workflow.ts | ✅ | S31 — `WorkflowEntrypoint` wrapping `runSalvationProtocol` in a single `step.do` |
| src/workflows/continuous-audit-workflow.ts | ✅ | S31 — `WorkflowEntrypoint` stub that recalculates `production_score`; Git-diff regression scanning reserved for Phase 6 |
| src/workers/coordinator.ts | ✅ | S31 — phase-2→phase-3 transition now triggers `PRIORITY_RESOLVER_WORKFLOW.create(...)` instead of awaiting `runPriorityResolver` inline |
| src/agents/base-agent.ts | ✅ | S31 — `salvation` state now triggers `SALVATION_WORKFLOW.create(...)` instead of awaiting `runSalvationProtocol` inline |
| src/index.ts | ✅ | S31 — exports `PriorityResolverWorkflow`, `SalvationWorkflow`, `ContinuousAuditWorkflow` |
| wrangler.toml | ✅ | S31 — added `[[workflows]]` bindings for all three classes |
| test/mocks/cloudflare-workers.ts | ✅ | S31 — added `WorkflowEntrypoint` mock so vitest can load workflow classes |
| test/helpers.ts | ✅ | S31 — added `makeMockWorkflows()` helper returning the three `Workflow` bindings |
| test/base-agent.test.ts | ✅ | S31 — uses `makeMockWorkflows()` |
| test/coordinator.test.ts | ✅ | S31 — uses `makeMockWorkflows()` |
| test/auth.test.ts | ✅ | S31 — uses `makeMockWorkflows()` |
| test/queue.test.ts | ✅ | S31 — uses `makeMockWorkflows()` |
| test/ingestion.test.ts | ✅ | S31 — uses `makeMockWorkflows()` |
| test/shared-memory.test.ts | ✅ | S31 — uses `makeMockWorkflows()` |
| test/workflows.test.ts | ✅ | S31 — 3 workflow instantiation/delegation tests |

## PHASE S — SPEC ALIGNMENT (PRODUCTION READY PLAN PHASE 1)

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S32 — extended `TaskType` with `gate_retry`, `dedup`, `task_description`, `qa_script_gen`, `log_summary`, `fallback` |
| src/lib/model-router.ts | ✅ | S32 — `getRoutingConfig()` matches Build Guide budgets per task/agent; `RouteDecision` includes `budget`; input > 100K auto-overrides to K2.6 130K; `routeToModel` applies agent-config overrides |
| src/lib/llm-gateway.ts | ✅ | S32 — estimates input tokens, passes `agentType` and `inputTokenCount` to router; uses `route.budget` for session check; applies `applyBudgetOverride` at ≥80% spend; logs final model to `token_usage` |
| src/workers/priority-resolver.ts | ✅ | S32 — conflict detection now flags Security + Refactoring (was Security + Architecture) per PRD/Build Guide |
| test/model-router.test.ts | ✅ | S32 — 21 cases covering all documented task types, input override, agent-config overrides, and budget override behavior |

## PHASE T — BUDGET PAUSE ENFORCEMENT / 80/95% AGENT THROTTLING

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S33 — added `critical` boolean to `AgentConfig` |
| src/db/schema.sql | ✅ | S33 — added `critical` to `agent_config`, `throttled` to `run_budget`, updated trigger to set `throttled=1` at 80% and `paused=1` at 95% |
| src/db/migrations/v5_add_agent_config_critical.sql | ✅ | S33 — idempotent migration adding `critical` to existing `agent_config` rows |
| src/db/migrations/v6_run_budget_throttle.sql | ✅ | S33 — migration adding `run_budget.throttled` and recreating the budget trigger with 80/95 enforcement |
| src/lib/agent-config.ts | ✅ | S33 — `NON_CRITICAL_AGENT_TYPES`, `isCriticalAgentType()`, default criticality, persisted `critical` column |
| src/agents/base-agent.ts | ✅ | S33 — `tick()` pauses non-critical agents when `throttled=1` and all agents when `paused=1` |
| src/workers/coordinator.ts | ✅ | S33 — alarm pauses non-critical registry rows at 80%, all rows at 95%, and broadcasts scoped `budget_alert` events |
| test/agent-config.test.ts | ✅ | S33 — added criticality default, persistence, and `isCriticalAgentType` tests |
| test/base-agent.test.ts | ✅ | S33 — added non-critical agent throttling test |
| test/coordinator.test.ts | ✅ | S33 — added 80/95 alarm pause + broadcast tests |

## PHASE U — REAL SALVATION RESEARCH / NVD + GITHUB ISSUES + WEB SEARCH

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S34 — added `SEARCH_API_KEY` and `SEARCH_PROVIDER` to `Env` |
| src/lib/external-research.ts | ✅ | S34 — NVD, GitHub issue, and Brave/Bing web-search adapters with timeouts; `createResearchAdapters()`; `researchSalvation()` with query derivation, parallel adapter calls, URL deduplication, 5-source limit, and `knowledge_ledger` caching |
| src/workers/salvation.ts | ✅ | S34 — `runSalvationProtocol()` calls `researchSalvation()` before LLM synthesis; `buildSalvationPrompt()` includes real sources; LLM-generated `framework_docs` fallback added when fewer than 2 real sources are found |
| wrangler.toml | ✅ | S34 — added `SEARCH_PROVIDER` var |
| scripts/setup-secrets.sh | ✅ | S34 — added `SEARCH_API_KEY` secret prompt |
| test/external-research.test.ts | ✅ | S34 — 6 adapter + caching tests |
| test/salvation.test.ts | ✅ | S34 — 5 tests for report persistence, real sources in prompt, fallback source, parse error, and prompt rendering |
| test/auth.test.ts | ✅ | S34 — added `SEARCH_API_KEY` / `SEARCH_PROVIDER` to `mockEnv` |
| test/base-agent.test.ts | ✅ | S34 — added `SEARCH_API_KEY` / `SEARCH_PROVIDER` to `makeMockEnv` |
| test/coordinator.test.ts | ✅ | S34 — added `SEARCH_API_KEY` / `SEARCH_PROVIDER` to `makeMockEnv` |
| test/ingestion.test.ts | ✅ | S34 — added `SEARCH_API_KEY` / `SEARCH_PROVIDER` to `makeEnv` |
| test/queue.test.ts | ✅ | S34 — added `SEARCH_API_KEY` / `SEARCH_PROVIDER` to `makeEnv` |
| test/shared-memory.test.ts | ✅ | S34 — added `SEARCH_API_KEY` / `SEARCH_PROVIDER` to `makeEnv` |
| test/workflows.test.ts | ✅ | S34 — added `SEARCH_API_KEY` / `SEARCH_PROVIDER` to `makeEnv` |

## PHASE V — TASK LIFECYCLE REST API / LOCKS / COMMIT WIRING / 48-HOUR TIMEOUT

| File | Status | Notes |
|------|--------|-------|
| src/lib/router.ts | ✅ | S35 — added `handleTaskList`, `handleTaskPatch`, `handleTaskVerify`, `handleFindingList`, `handleFindingPatch` with tenant-scoped ownership via `audit_sessions` |
| src/index.ts | ✅ | S35 — wired `/api/v1/tenants/:tenantId/audits/:auditRunId/tasks`, `/tasks/:taskId`, `/tasks/:taskId/verify`, `/findings`, `/findings/:findingId` through rate-limited protected routes |
| src/workers/priority-resolver.ts | ✅ | S35 — inserts `tenant_id` into `tasks` rows from `audit_sessions` |
| src/workers/coordinator.ts | ✅ | S35 — `alarm()` resets `in_progress` tasks whose `lock_expires_at` has expired and broadcasts `task_status_change` with reason `lock_expired` |
| src/db/schema.sql | ✅ | S35 — added `idx_tasks_run_status_lock` index for lock timeout query |
| src/db/migrations/v7_task_lock_index.sql | ✅ | S35 — idempotent migration for the lock timeout index |
| test/tasks.test.ts | ✅ | S35 — 10 tests covering list, filter, in_progress lock, invalid transitions, done commit_sha requirement, verification trigger, findings list/patch, and cross-tenant isolation |
| test/coordinator.test.ts | ✅ | S35 — added task lock expiry test |

## PHASE W — VERIFICATION HARDENING / REAL REPO PARSING / REGRESSION SCAN / VISUAL QA RE-RUN / HUMAN SIGN-OFF

| File | Status | Notes |
|------|--------|-------|
| src/lib/github.ts | ✅ | S36 — extended `parseRepoUrl` to support `/tree/branch` URLs and optional branch; added `fetchFileContent` helper for file-level GitHub API reads |
| src/workers/verification.ts | ✅ | S36 — `verifyTask` reads owner/repo from `audit_sessions`; implements `scheduleRegressionScan` that fetches new commit content and creates `is_regression=1` findings; adds `humanApproved` parameter that bypasses diff evidence and marks findings resolved |
| src/lib/router.ts | ✅ | S36 — `handleTaskPatch` passes `human_approved` to `verifyTask`; runs `runVisualQA` re-run when screenshot findings move to `in_review` and returns task to backlog if new failures appear |
| src/index.ts | ✅ | S36 — reads request body for `POST .../tasks/:taskId/verify` and passes it to `handleTaskVerify` |
| src/workers/coordinator.ts | ✅ | S36 — `spawnVerificationAgent` passes `broadcast` callback to `verifyTask` so regression findings are broadcast as `finding_created` |
| test/verification.test.ts | ✅ | S36 — 8 tests covering owner/repo parsing, missing/unsupported repo_url, regression scan, human approval, Visual QA re-run gate, severity escalation, and production score recalculation |

## PHASE X — CONTINUOUS AUDIT / GIT DIFF WORKER / HOURLY WORKFLOW / REGRESSION DETECTION / WEBHOOKS

| File | Status | Notes |
|------|--------|-------|
| src/lib/git-diff.ts | ✅ | S37 — new helpers `getLatestCommit`, `getChangedFilesSince`, `fetchRawFile` |
| test/git-diff.test.ts | ✅ | S37 — 4 tests for latest commit, raw file, changed files, failure paths |
| src/workers/coordinator.ts | ✅ | S37 — `spawnAgent` accepts optional `overrideFiles` for re-analysis; `agent_registry.assigned_files` is used by booted agents |
| src/agents/base-agent.ts | ✅ | S37 — boot state reads `assigned_files` from `agent_registry` when non-empty, enabling targeted re-analysis |
| src/workers/ingestion.ts | ✅ | S37 — exported `chunkFile`, `tagDomain`, `sha256ContentHash`, `processRepoFile`; added `upsertFiles` for re-ingestion |
| src/workflows/continuous-audit-workflow.ts | ✅ | S37 — 10 workflow steps: fetch session, latest commit, changed files, re-ingest, delete removed files, spawn re-analysis, regression check, trigger consumer audits, recalculate score, update last_commit_sha |
| src/lib/router.ts | ✅ | S37 — added `handleGitHubWebhook`, `handleGitLabWebhook`, `handleBitbucketWebhook` with HMAC-SHA256 signature verification |
| src/index.ts | ✅ | S37 — wired `/webhooks/github`, `/webhooks/gitlab`, `/webhooks/bitbucket` as public routes |
| wrangler.toml | ✅ | S37 — added `GITHUB_WEBHOOK_SECRET` var, continuous-audit `schedules = ["0 * * * *"]` |
| test/workflows.test.ts | ✅ | S37 — updated continuous audit test to assert all 10 workflow steps and GitHub API calls |
| test/webhooks.test.ts | ✅ | S37 — 5 tests for GitHub signature verification/trigger, invalid signature, missing repo, GitLab/Bitbucket no-ops |

## PHASE Y — MULTI-REPOSITORY SUPPORT / REPO GROUPS / CROSS-REPO DEPENDENCY PROPAGATION

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S38 — added `RepoGroup`, `RepoGroupMember`, `RepoDependency` interfaces |
| src/db/schema.sql | ✅ | S38 — added `repo_groups`, `repo_group_members`, `repo_dependencies` tables and indexes |
| src/db/migrations/v8_repo_groups.sql | ✅ | S38 — idempotent migration for multi-repository tables |
| src/workers/ingestion.ts | ✅ | S38 — parses `repo_group_id` from multipart and JSON bodies; `ensureRepoGroupMembership` creates group and membership |
| src/lib/router.ts | ✅ | S38 — `handleAuditStart` forwards `repo_group_id`; added `handleGroupGet` and `handleDependencyCreate` |
| src/index.ts | ✅ | S38 — wired `GET /api/v1/tenants/:tenantId/groups/:groupId` and `POST /api/v1/tenants/:tenantId/dependencies` |
| src/workers/verification.ts | ✅ | S38 — `propagateResolvedFinding` creates verification tasks in consumer runs when a provider dependency finding is resolved |
| src/workflows/continuous-audit-workflow.ts | ✅ | S38 — `trigger-consumer-audits` step triggers `CONTINUOUS_AUDIT_WORKFLOW` for all consumer runs when a shared dependency file changes |
| test/repo-groups.test.ts | ✅ | S38 — 5 tests covering group membership on ingest/audit-start, group listing, dependency creation, and cross-repo task propagation |

## PHASE Z — AI GATEWAY, MANAGED MEMORY FALLBACK, PERFORMANCE, LOAD TESTING, DOCS, SECURITY AUDIT, ONBOARDING

| File | Status | Notes |
|------|--------|-------|
| src/types/index.ts | ✅ | S41 — added optional `AI_GATEWAY_URL?` to `Env`; added optional `chunkCache?: Map<string,string>` to `GateContext` |
| wrangler.toml | ✅ | S41 — added `AI_GATEWAY_URL = ""` var |
| src/lib/llm-gateway.ts | ✅ | S41/S42 — `buildEndpoint()` routes through `AI_GATEWAY_URL` when set; `getApiKey()` falls back to encrypted `app_settings` when env keys are empty; `// TODO: VERIFY CLOUDFLARE API` noted for unconfirmed gateway path prefix |
| test/llm-gateway.test.ts | ✅ | S42 — added `getApiKey` env + encrypted fallback tests |
| src/lib/settings.ts | ✅ | S42 — encrypted app settings helpers (`getSetting`, `setSetting`, `getProviderApiKey`, `storeProviderApiKey`, `listMaskedSettings`) |
| src/db/schema.sql | ✅ | S42 — added `app_settings` table |
| src/db/migrations/v10_app_settings.sql | ✅ | S42 — idempotent migration for `app_settings` |
| src/lib/agent-memory.ts | ⚠️ | S41 — exports `SharedMemoryDurableObject` as a managed-memory fallback stub; real `AGENT_MEMORY` binding is unverified and not enabled |
| src/lib/cache.ts | ✅ | S41 — small `LRUCache` for in-DO R2 evidence caching |
| src/lib/gate.ts | ✅ | S41 — `evidenceInR2()` reads/writes the `GateContext.chunkCache` |
| src/agents/base-agent.ts | ✅ | S41 — instantiates an LRU cache per agent and passes it through `tick()` / `buildGateContext()` |
| test/cache.test.ts | ✅ | S41 — cache hit/miss/eviction tests |
| scripts/load-test.ts | ✅ | S41 — staging load-test harness with audit-start and WebSocket metrics |
| package.json | ✅ | S41 — added `npm run load-test` and `npm run security-audit` scripts |
| test/load-test.test.ts | ✅ | S41 — mocked dry-run test for the load-test harness |
| src/lib/openapi.ts | ✅ | S41 — OpenAPI 3.1 spec describing the authenticated REST endpoints |
| src/lib/router.ts | ✅ | S41 — `handleOpenApiGet()` serves the spec |
| src/index.ts | ✅ | S41 — wired public `GET /api/v1/openapi.json` |
| test/openapi.test.ts | ✅ | S41 — spec path and content tests |
| scripts/security-audit.ts | ✅ | S41 — static scanner for direct provider fetches, hardcoded secrets, and missing auth on protected routes |
| test/security-audit.test.ts | ✅ | S41 — scanner unit tests plus codebase scan assertion |
| src/dashboard/onboarding.html | ✅ | S41 — step-by-step onboarding wizard page |
| src/dashboard/onboarding-html.ts | ✅ | S41 — generated HTML module for `ONBOARDING_HTML` |
| src/lib/router.ts | ✅ | S41 — `handleOnboarding()` returns the onboarding page |
| src/index.ts | ✅ | S41 — wired public `GET /onboarding` |
| scripts/e2e-server.ts | ✅ | S41 — added `/onboarding` to the static E2E page map |
| test/e2e/onboarding.spec.ts | ✅ | S41 — Playwright tests for onboarding page render, links, and snapshot |
| src/dashboard/settings.html | ✅ | S42 — provider API key settings form with admin basic-auth protection |
| src/dashboard/settings-html.ts | ✅ | S42 — generated HTML module for `SETTINGS_HTML` |
| src/lib/router.ts | ✅ | S42 — `handleSettings()`, `handleSettingsKeysGet()`, `handleSettingsKeysPost()` |
| src/index.ts | ✅ | S42 — wired public `GET /settings` and admin `GET/POST /api/v1/settings/keys` |
| scripts/e2e-server.ts | ✅ | S42 — added `/settings` to the static E2E page map |
| test/settings.test.ts | ✅ | S42 — 6 tests for settings helpers and admin API handlers |
| test/e2e/settings.spec.ts | ✅ | S42 — Playwright tests for settings page render and snapshot |
| test/e2e/helpers.ts | ✅ | S42 — added `settings` to `PageName` |
| src/lib/openapi.ts | ✅ | S42 — documented `/api/v1/settings/keys` endpoints |

## INTEGRATION + DEPLOY

| Item | Status | Notes |
|------|--------|-------|
| src/index.ts (final entry point) | ✅ | S14 — wires /ingest, /dashboard, /dashboard/ws, /audit/start |
| D1 database created in Cloudflare | ✅ | D1 ID: b7446147-03da-4dc8-9587-f28b8df6e452 |
| R2 bucket created in Cloudflare | ✅ | Bucket: auditengine-r2 |
| Schema applied to D1 | ✅ | Remote schema applied |
| Queue created in Cloudflare | ✅ | Created `auditengine-write-queue` with `message_retention_period=86400` (account max allowed) |
| KIMI_API_KEY secret set | ⏳ | Set via `wrangler secret put KIMI_API_KEY` |
| MINIMAX_API_KEY secret set | ⏳ | Set via `wrangler secret put MINIMAX_API_KEY` |
| GITHUB_TOKEN secret set | ⏳ | Set via `wrangler secret put GITHUB_TOKEN` |
| SEARCH_API_KEY secret set | ⏳ | Set via `wrangler secret put SEARCH_API_KEY` (required for web-search adapter) |
| ADMIN_PASSWORD secret set | ✅ | Set and deployed; provided to user |
| ENCRYPTION_KEY secret set | ✅ | Set and deployed; provided to user |
| Schema fully reconciled on remote D1 | ✅ | Dropped legacy empty tables and re-applied src/db/schema.sql |
| Create Tenant endpoint + UI | ✅ | POST /api/v1/tenants (admin) and /api/v1/tenant (JWT) wired; settings page creates tenants |
| Security audit script updated | ✅ | /dashboard added to PUBLIC_PATHS so page can serve unauthenticated HTML |
| Git repo write API | ✅ | Branch/commit/PR endpoints for GitHub, GitLab, Bitbucket; agents can apply changes to repos |
| Git provider token UI + fallback | ✅ | Settings page stores GitHub/GitLab/Bitbucket tokens in app_settings; write API falls back to them |
| Audit start form repo URL input | ✅ | /audit/new now accepts Git Repository URL and branch; ingestion fetches repo files directly |
| Audit start form auth header | ✅ | /audit/new now sends tenant JWT from localStorage to /audit/start |
| /audit/start repo_url validation | ✅ | Allows repo_url without files array |
| GitHub User-Agent header | ✅ | Added to all GitHub API calls to satisfy API requirement |
| wrangler deploy successful | ✅ | Deploy URL: https://auditengine.tsnion.workers.dev (Version ID: a338eced-4f92-44bb-925f-827927b0320c) |

## TESTS

| File | Status | Notes |
|------|--------|-------|
| test/helpers.ts | ✅ | S15 — mock D1 + gate context factory |
| test/gate.test.ts | ✅ | S15 — 8 gate cases |
| test/model-router.test.ts | ✅ | S15 — 5 router cases |
| test/queue.test.ts | ✅ | S27 — 6 queue cases |
| test/coordinator.test.ts | ✅ | S29 — 5 coordinator cases; S33 — 2 budget-pause alarm cases |
| test/base-agent.test.ts | ✅ | S30 — 4 base-agent cases; S33 — 1 budget-throttle case |
| test/shared-memory.test.ts | ✅ | S30 — 3 shared-memory cases |
| test/workflows.test.ts | ✅ | S31 — 3 workflow delegation cases; S37 — updated continuous audit test with 10 steps |
| test/coordinator.test.ts | ✅ | S29 — 5 coordinator cases; S33 — 2 budget-pause alarm cases; S35 — 1 task lock timeout test; S36 — regression broadcast wiring |
| test/tasks.test.ts | ✅ | S35 — 10 task lifecycle tests |
| test/verification.test.ts | ✅ | S36 — 8 verification hardening tests |
| test/webhooks.test.ts | ✅ | S37 — 5 webhook tests; S40 — 7 webhook tests (GitHub, GitLab, Bitbucket signature verification and trigger) |
| test/git-diff.test.ts | ✅ | S37 — 4 git-diff helper tests |
| test/repo-groups.test.ts | ✅ | S38 — 5 multi-repository support tests |
| test/dashboard-api.test.ts | ✅ | S39 — 7 dashboard admin/tenant/audit API tests |
| test/github-oauth.test.ts | ✅ | S40 — 4 GitHub OAuth redirect/callback tests |
| test/gitlab.test.ts | ✅ | S40 — 6 GitLab provider API tests |
| test/bitbucket.test.ts | ✅ | S40 — 7 Bitbucket provider API tests |
| test/settings.test.ts | ✅ | S42 — 6 tests for encrypted settings helpers and admin API handlers |
| test/e2e/settings.spec.ts | ✅ | S42 — 2 Playwright tests for settings page |
| All 209 test cases passing (backend) | ✅ | S42 |
| Playwright E2E specs | ✅ | S42 — 20 tests (login, tenant list, audit list, task board, finding detail, onboarding, settings) |

---

## KNOWN ISSUES / BLOCKERS
(add entries here when something is broken, blocked, or unclear)

- `auditengine-write-queue` consumer is bound but does not deliver messages in production; message delivery was resumed and the consumer was re-added without effect. `/audit/start` repo audits now bypass the queue and use `AUDIT_START_WORKFLOW` instead. Rate-limited config/task writes may still be affected if the queue remains stalled.

---

## TYPE CHECK STATUS
Last run: 2026-08-18
Result: PASS
Errors: 0
Tests: 221 backend tests passed (gate 21, model-router 21, auth 6, ingestion 8, agent-config 7, secrets 10, token-budget 9, rate-limiter 10, queue 6, coordinator 8, base-agent 4, shared-memory 3, workflows 3, external-research 6, salvation 5, tasks 10, verification 8, git-diff 4, webhooks 7, github-oauth 4, gitlab 6, bitbucket 7, repo-groups 5, dashboard-api 7, security-audit 7, cache 2, load-test 1, openapi 2, llm-gateway 6, settings 6)
Note: S52 fixed dashboard/task-board/finding-detail WebSocket auth by passing tenant JWT via query parameter; added AUDIT_START_WORKFLOW binding and new audit-start workflow so repo audits run in a long-lived Workflow instead of the HTTP request's waitUntil budget; file-only audits continue to use waitUntil; updated repo-groups test for the new flow; dashboard now redirects to /login when no token is present

## S54 — REPO FILE TREE + SELECTED-PATH AUDITS

| File | Status | Notes |
|------|--------|-------|
| src/lib/github.ts | ✅ DONE | Added `listRepoFiles` using GitHub git/trees API with recursive=1; returns blob paths/types |
| src/lib/gitlab.ts | ⚠️ PARTIAL | Added `listRepoFiles` TODO fallback to `fetchRepoFiles` + map; replace with REST tree API later |
| src/lib/bitbucket.ts | ⚠️ PARTIAL | Added `listRepoFiles` TODO fallback to `fetchRepoFiles` + map; replace with REST src API later |
| src/lib/git-router.ts | ✅ DONE | Added `listRepoFiles` provider dispatcher; falls back to `getRepoFiles` map for unsupported providers |
| src/lib/router.ts | ✅ DONE | Added `handleRepoFileList`; `handleAuditStart` forwards `selected_paths` to workflow/ingestion |
| src/workflows/audit-start-workflow.ts | ✅ DONE | `AuditStartPayload` includes `selected_paths`; passed to ingest request body |
| src/workers/ingestion.ts | ✅ DONE | `parseRepoFiles` filters repo files by `selected_paths` when present |
| src/index.ts | ✅ DONE | Wired `POST /api/v1/repo/files` as protected route through `dispatchRoute` |

## SCHEMA ALIGNMENT NOTES
- New RFC/PRD-aligned tables added alongside existing tables (repo_manifest retained for backward compatibility).
- files table mirrors repo_manifest with PRD-style column names (path, domain_tag, line_count, chunk_count, r2_key, content_hash).
- audit_sessions tracks run lifecycle (pending → running → complete) and readiness_score.
- audit_logs captures state changes, errors, gate rejections, and findings.
- agent_config holds per-tenant per-agent behavioral tuning; not yet wired to llmCall.
- Foreign-key REFERENCES clauses omitted intentionally because current tenant_id defaults to '' and would violate strict FK constraints.

---

## SESSION LOG

| Session | Date | What was done | Files changed | Commit |
|---------|------|---------------|---------------|--------|
| S00 | 2026-08-08 | Project scaffold | wrangler.toml, package.json, tsconfig.json, src/index.ts, SYSTEM_SPEC.md, SESSION_LOG.md, scripts/setup-secrets.sh | 126e8ea |
| S01 | 2026-08-08 | Types + D1 schema | src/types/index.ts, src/db/schema.sql | 6df09e6 |
| S02 | 2026-08-08 | LLM gateway + model router | src/lib/llm-gateway.ts, src/lib/model-router.ts | 78800d1 |
| S03 | 2026-08-08 | Verification gate | src/lib/gate.ts | 4b6f027 |
| S04 | 2026-08-08 | Constitution files (11 agents) | src/constitutions/*.md | c6f4be5 |
| S05 | 2026-08-08 | Agent base state machine | src/agents/base-agent.ts | d36c448 |
| S06 | 2026-08-08 | Agent message builders | src/agents/base-agent.ts | 12d051a |
| S07 | 2026-08-08 | Ingestion worker | src/workers/ingestion.ts | 4fa3ca3 |
| S08 | 2026-08-08 | Coordinator DO | src/workers/coordinator.ts, src/agents/base-agent.ts | 8af8d50 |
| S09 | 2026-08-08 | Priority resolver | src/workers/priority-resolver.ts, src/workers/coordinator.ts | b065c1e |
| S10 | 2026-08-08 | Verification agent | src/workers/verification.ts, src/workers/coordinator.ts | 07d2af8 |
| S11 | 2026-08-08 | Salvation protocol | src/workers/salvation.ts, src/agents/base-agent.ts | 3957acf |
| S12 | 2026-08-08 | Visual QA agent | src/workers/visual-qa.ts, src/workers/coordinator.ts, tsconfig.json | 83dc30d |
| S13 | 2026-08-08 | Dashboard DO + frontend | src/dashboard/dashboard-do.ts, src/dashboard/index.html | dcadfd3 |
| S14 | 2026-08-08 | Entry point + Cloudflare deploy | src/index.ts, src/workers/ingestion.ts, src/dashboard/dashboard-html.ts, wrangler.toml | 5ed890e |
| S15 | 2026-08-08 | Gate + router tests | test/helpers.ts, test/gate.test.ts, test/model-router.test.ts | ee09da4 |
| S16 | 2026-08-08 | UI navigation + audit start form | src/dashboard/home.html, src/dashboard/audit-new.html, src/dashboard/index.html, src/index.ts, src/dashboard/*-html.ts | 56d930c |
| S17 | 2026-08-08 | Docs-to-skills extraction | .kimi-code/skills/auditengine-spec-guard/SKILL.md, .kimi-code/skills/auditengine-agent-constitution/SKILL.md, .kimi-code/skills/auditengine-lifecycle-guard/SKILL.md | |
| S18 | 2026-08-08 | Multi-tenancy + auth foundation | src/types/index.ts, src/db/schema.sql, src/lib/auth.ts, src/index.ts, src/workers/ingestion.ts, wrangler.toml, test/auth.test.ts | |
| S19 | 2026-08-08 | Real ingestion pipeline | src/types/index.ts, src/lib/r2-storage.ts, src/lib/zip.ts, src/lib/github.ts, src/lib/lang.ts, src/workers/ingestion.ts, src/agents/base-agent.ts, src/workers/coordinator.ts, src/index.ts, package.json, test/ingestion.test.ts | |
| S20 | 2026-08-08 | Schema alignment + migration | src/types/index.ts, src/db/schema.sql, src/db/migrate.ts, src/workers/coordinator.ts, src/agents/base-agent.ts, src/workers/ingestion.ts, test/ingestion.test.ts, BUILD_STATE.md | |
| S21 | 2026-08-08 | RFC Verification Gate hardening | src/types/index.ts, src/lib/gate.ts, src/agents/base-agent.ts, test/helpers.ts, test/gate.test.ts, BUILD_STATE.md | |
| S22 | 2026-08-08 | RFC §4.6.4 behavioral tuning | src/lib/agent-config.ts, src/lib/model-router.ts, src/lib/llm-gateway.ts, src/lib/gate.ts, src/workers/coordinator.ts, src/index.ts, test/agent-config.test.ts, test/model-router.test.ts, BUILD_STATE.md | |
| S23 | 2026-08-08 | Architecture §3.2 evidence verification pipeline completion | src/lib/gate.ts, test/gate.test.ts, BUILD_STATE.md | |
| S24 | 2026-08-08 | Gap Analysis GAP-006 two-stage secrets redaction | src/lib/secrets.ts, src/lib/llm-gateway.ts, src/lib/gate.ts, test/secrets.test.ts, test/gate.test.ts, BUILD_STATE.md | |
| S25 | 2026-08-08 | Implementation Plan P3-D06 / GAP-005 session token budget enforcement | src/lib/token-budget.ts, src/lib/llm-gateway.ts, test/token-budget.test.ts, BUILD_STATE.md | |
| S26 | 2026-08-08 | Gap Analysis GAP-007 / Implementation Plan P1-D05 + P3-D07 tiered API rate limiting | src/types/index.ts, src/db/schema.sql, wrangler.toml, src/workers/rate-limiter.ts, src/lib/rate-limit.ts, src/lib/agent-config.ts, src/lib/llm-gateway.ts, src/index.ts, test/rate-limiter.test.ts, test/agent-config.test.ts, test/auth.test.ts, test/ingestion.test.ts, BUILD_STATE.md | |
| S27 | 2026-08-08 | Gap Analysis GAP-007 completion: Cloudflare Queues async write buffering | src/types/index.ts, wrangler.toml, src/lib/router.ts, src/index.ts, test/queue.test.ts, vitest.config.ts, test/mocks/cloudflare-workers.ts, test/auth.test.ts, test/ingestion.test.ts, BUILD_STATE.md | |
| S28 | 2026-08-08 | Schema & type corrections for 19-agent doc union | src/types/index.ts, src/db/schema.sql, src/lib/agent-config.ts, src/lib/router.ts, src/agents/base-agent.ts, src/workers/coordinator.ts, src/workers/ingestion.ts, src/dashboard/index.html, src/dashboard/home.html, src/dashboard/dashboard-html.ts, src/dashboard/home-html.ts, generate-html-ts.py, test/ingestion.test.ts, test/agent-config.test.ts, BUILD_STATE.md | |
| S29 | 2026-08-08 | Coordinator & agent roster: 30s alarm, domain-aware spawn, registry with domain/assigned_files, 19 per-agent DO classes, 9 new constitutions | src/types/index.ts, src/db/schema.sql, src/workers/coordinator.ts, src/agents/base-agent.ts, src/workers/agents/*.ts, src/workers/agents/index.ts, src/index.ts, wrangler.toml, src/constitutions/*.md, test/helpers.ts, test/auth.test.ts, test/ingestion.test.ts, test/queue.test.ts, test/coordinator.test.ts, BUILD_STATE.md | |
| S30 | 2026-08-12 | Bounded ReAct, SharedMemory DO, recurrence detection | src/types/index.ts, src/db/schema.sql, src/workers/shared-memory.ts, src/index.ts, src/agents/base-agent.ts, wrangler.toml, test/mocks/cloudflare-workers.ts, test/helpers.ts, test/base-agent.test.ts, test/shared-memory.test.ts, BUILD_STATE.md | |
| S31 | 2026-08-12 | Cloudflare Workflows for priority resolver, salvation, and continuous audit | src/types/index.ts, src/workflows/*.ts, src/workers/coordinator.ts, src/agents/base-agent.ts, src/index.ts, wrangler.toml, test/mocks/cloudflare-workers.ts, test/helpers.ts, test/*.test.ts, test/workflows.test.ts, BUILD_STATE.md | |
| S32 | 2026-08-12 | Spec alignment: Build-Guide model-router budgets, input > 100K override, budget override in llmCall, Priority Resolver Security+Refactoring conflict rule | src/types/index.ts, src/lib/model-router.ts, src/lib/llm-gateway.ts, src/workers/priority-resolver.ts, test/model-router.test.ts, BUILD_STATE.md | |
| S33 | 2026-08-13 | Budget pause enforcement: agent criticality, 80/95% D1 trigger throttle/pause, coordinator alarm pause logic, tests | src/types/index.ts, src/db/schema.sql, src/db/migrations/v5_add_agent_config_critical.sql, src/db/migrations/v6_run_budget_throttle.sql, src/lib/agent-config.ts, src/agents/base-agent.ts, src/workers/coordinator.ts, test/agent-config.test.ts, test/base-agent.test.ts, test/coordinator.test.ts, BUILD_STATE.md, PRODUCTION_READY_PLAN.md | |
| S34 | 2026-08-15 | Real Salvation research: NVD/GitHub/web-search adapters, knowledge_ledger caching, wired into salvation protocol | src/types/index.ts, src/lib/external-research.ts, src/workers/salvation.ts, wrangler.toml, scripts/setup-secrets.sh, test/external-research.test.ts, test/salvation.test.ts, test/auth.test.ts, test/base-agent.test.ts, test/coordinator.test.ts, test/ingestion.test.ts, test/queue.test.ts, test/shared-memory.test.ts, test/workflows.test.ts, BUILD_STATE.md, PRODUCTION_READY_PLAN.md | |
| S35 | 2026-08-15 | Task lifecycle REST API: task/finding endpoints, lock_expires_at, 48-hour timeout, commit_sha wiring | src/lib/router.ts, src/index.ts, src/workers/priority-resolver.ts, src/workers/coordinator.ts, src/db/schema.sql, src/db/migrations/v7_task_lock_index.sql, test/tasks.test.ts, test/coordinator.test.ts, BUILD_STATE.md, PRODUCTION_READY_PLAN.md | |
| S36 | 2026-08-15 | Verification hardening: real owner/repo parsing from audit_sessions, regression scan, human sign-off, Visual QA re-run gate | src/lib/github.ts, src/workers/verification.ts, src/lib/router.ts, src/index.ts, src/workers/coordinator.ts, test/verification.test.ts, BUILD_STATE.md, PRODUCTION_READY_PLAN.md | |
| S37 | 2026-08-15 | Continuous audit: Git diff helpers, hourly workflow, changed-file re-ingestion, regression detection, GitHub/GitLab/Bitbucket webhooks | src/lib/git-diff.ts, src/workflows/continuous-audit-workflow.ts, src/workers/coordinator.ts, src/agents/base-agent.ts, src/workers/ingestion.ts, src/lib/router.ts, src/index.ts, wrangler.toml, test/git-diff.test.ts, test/webhooks.test.ts, test/workflows.test.ts, test/*.test.ts, BUILD_STATE.md, PRODUCTION_READY_PLAN.md | |
| S38 | 2026-08-15 | Multi-repository support: repo group schema, repo_group_id in /ingest and /audit/start, cross-repo verification propagation, dependency-change re-analysis, GET group endpoint | src/types/index.ts, src/db/schema.sql, src/db/migrations/v8_repo_groups.sql, src/workers/ingestion.ts, src/lib/router.ts, src/index.ts, src/workers/verification.ts, src/workflows/continuous-audit-workflow.ts, test/repo-groups.test.ts, test/workflows.test.ts, BUILD_STATE.md, PRODUCTION_READY_PLAN.md | |
| S39 | 2026-08-17 | Dashboard UI / human task board: login, tenant selector, audit list, task board, finding detail pages; admin/tenant/audit REST endpoints; dashboard-api tests; Playwright E2E suite | src/lib/auth.ts, src/lib/router.ts, src/index.ts, src/dashboard/login-html.ts, src/dashboard/tenant-selector-html.ts, src/dashboard/audit-list-html.ts, src/dashboard/task-board-html.ts, src/dashboard/finding-detail-html.ts, src/dashboard/home-html.ts, src/dashboard/dashboard-html.ts, test/dashboard-api.test.ts, test/e2e/*.ts, playwright.config.ts, scripts/e2e-server.ts, package.json, vitest.config.ts, BUILD_STATE.md, PRODUCTION_READY_PLAN.md | |
| S40 | 2026-08-16 | Phase 9 OAuth + Git provider webhooks: provider token columns, AES-GCM token encryption, GitHub OAuth redirect/callback, GitLab/Bitbucket OAuth handlers and webhook signature verification, provider-agnostic git-router with tenant token fallback, ingestion and verification wired to git-router, wrangler.toml placeholders and setup-secrets.sh, new tests for OAuth and GitLab/Bitbucket APIs | src/db/migrations/v9_provider_tokens.sql, src/db/schema.sql, src/types/index.ts, src/lib/token-crypto.ts, src/lib/git-router.ts, src/lib/github.ts, src/lib/gitlab.ts, src/lib/bitbucket.ts, src/lib/auth.ts, src/lib/router.ts, src/index.ts, src/workers/ingestion.ts, src/workers/verification.ts, wrangler.toml, scripts/setup-secrets.sh, test/helpers.ts, test/github-oauth.test.ts, test/gitlab.test.ts, test/bitbucket.test.ts, test/webhooks.test.ts, test/verification.test.ts, test/auth.test.ts, test/base-agent.test.ts, test/coordinator.test.ts, test/dashboard-api.test.ts, test/external-research.test.ts, test/ingestion.test.ts, test/queue.test.ts, test/repo-groups.test.ts, test/salvation.test.ts, test/shared-memory.test.ts, test/tasks.test.ts, test/workflows.test.ts, BUILD_STATE.md, PRODUCTION_READY_PLAN.md | |
| S41 | 2026-08-18 | Phase 10/11 production hardening: AI Gateway routing, managed memory fallback stub, in-DO R2 evidence cache, load-test harness, OpenAPI spec, security audit script, onboarding wizard UI and E2E test | src/types/index.ts, wrangler.toml, src/lib/llm-gateway.ts, src/lib/agent-memory.ts, src/lib/cache.ts, src/lib/gate.ts, src/agents/base-agent.ts, scripts/load-test.ts, scripts/security-audit.ts, scripts/e2e-server.ts, src/lib/openapi.ts, src/lib/router.ts, src/index.ts, src/dashboard/onboarding.html, src/dashboard/onboarding-html.ts, generate-html-ts.py, package.json, test/llm-gateway.test.ts, test/cache.test.ts, test/load-test.test.ts, test/openapi.test.ts, test/security-audit.test.ts, test/e2e/onboarding.spec.ts, test/e2e/helpers.ts, BUILD_STATE.md, PRODUCTION_READY_PLAN.md | |
| S42 | 2026-08-18 | Provider API key settings UI: encrypted `app_settings` storage, `/settings` page, admin `GET/POST /api/v1/settings/keys`, LLM gateway fallback to stored keys | src/types/index.ts, src/db/schema.sql, src/db/migrations/v10_app_settings.sql, src/lib/settings.ts, src/lib/llm-gateway.ts, src/lib/router.ts, src/lib/openapi.ts, src/index.ts, src/dashboard/settings.html, src/dashboard/settings-html.ts, scripts/e2e-server.ts, test/settings.test.ts, test/llm-gateway.test.ts, test/e2e/settings.spec.ts, test/e2e/helpers.ts, BUILD_STATE.md | |
| S43 | 2026-08-18 | Deploy auditengine worker: applied v10 D1 migration, set ADMIN_PASSWORD and ENCRYPTION_KEY secrets, deployed to workers.dev | — | |
| S44 | 2026-08-18 | Fix dashboard 401, add Settings nav, reconcile D1 schema (v11 audit_logs + v12 drop legacy tables + full schema.sql), verified settings API | src/index.ts, src/dashboard/home-html.ts, src/db/migrations/v11_audit_logs.sql, src/db/migrations/v12_drop_legacy_tables.sql, BUILD_STATE.md | |
| S45 | 2026-08-18 | Add Create Tenant endpoint + UI, fix dashboard/login flow, fix security-audit false positive, full test suite green | src/lib/router.ts, src/index.ts, src/dashboard/login-html.ts, src/dashboard/tenant-selector-html.ts, src/dashboard/settings-html.ts, scripts/security-audit.ts, BUILD_STATE.md | |
| S46 | 2026-08-18 | Full Git repo write access: unified branch/commit/PR API for GitHub, GitLab, Bitbucket; REST endpoints; agent helper; tests | src/lib/github-write.ts, src/lib/gitlab-write.ts, src/lib/bitbucket-write.ts, src/lib/git-write.ts, src/lib/router.ts, src/index.ts, test/git-write.test.ts, BUILD_STATE.md | |
| S47 | 2026-08-18 | Git provider token UI with instructions + direct token URLs, app_settings fallback for tokens, settings POST supports git tokens | src/lib/settings.ts, src/lib/github.ts, src/lib/gitlab.ts, src/lib/bitbucket.ts, src/lib/router.ts, src/dashboard/settings-html.ts, BUILD_STATE.md | |
| S48 | 2026-08-18 | Add Git Repository URL and branch inputs to audit start form | src/dashboard/audit-new-html.ts, BUILD_STATE.md | |
| S49 | 2026-08-18 | Fix audit start form 401 by sending tenant JWT from localStorage | src/dashboard/audit-new-html.ts, BUILD_STATE.md | |
| S50 | 2026-08-18 | Fix /audit/start 400 when repo_url provided without files | src/lib/router.ts, BUILD_STATE.md | |
| S51 | 2026-08-18 | Add User-Agent to GitHub API calls, improve ingestion error messages | src/lib/github.ts, src/lib/github-write.ts, src/lib/git-diff.ts, src/lib/router.ts, src/workers/ingestion.ts, BUILD_STATE.md | |
| S52 | 2026-08-18 | Fix dashboard/task-board/finding-detail WebSocket auth with ?token; route repo audits through new AUDIT_START_WORKFLOW to avoid HTTP waitUntil/CPU limits; file-only audits keep waitUntil; update test helpers and repo-groups test | src/types/index.ts, src/lib/router.ts, src/index.ts, src/workflows/audit-start-workflow.ts, wrangler.toml, src/dashboard/dashboard-html.ts, src/dashboard/task-board-html.ts, src/dashboard/finding-detail-html.ts, test/helpers.ts, test/repo-groups.test.ts, BUILD_STATE.md | |
| S53 | 2026-08-18 | Add /repos page to list and audit saved repositories; unify navigation across all dashboard pages; prefill repo URL on /audit/new; whitelist /repos in security audit; tests green | src/dashboard/repos-html.ts, src/lib/router.ts, src/index.ts, src/dashboard/home-html.ts, src/dashboard/settings-html.ts, src/dashboard/audit-new-html.ts, src/dashboard/dashboard-html.ts, src/dashboard/tenant-selector-html.ts, src/dashboard/audit-list-html.ts, src/dashboard/task-board-html.ts, src/dashboard/finding-detail-html.ts, scripts/security-audit.ts, BUILD_STATE.md | d482f70 |
| S56 | 2026-08-18 | Repo file picker and specific-file audits: GitHub tree API, selected_paths filtering, /repos Audit/Audit-files actions, /audit/new loadable file tree, E2E tests + live smoke tests, GitHub public-repo support | src/lib/github.ts, src/lib/gitlab.ts, src/lib/bitbucket.ts, src/lib/git-router.ts, src/lib/router.ts, src/workflows/audit-start-workflow.ts, src/workers/ingestion.ts, src/index.ts, src/dashboard/repos-html.ts, src/dashboard/audit-new-html.ts, scripts/e2e-server.ts, test/e2e/helpers.ts, test/e2e/login.spec.ts, test/e2e/tenant-list.spec.ts, test/e2e/repo-audit.spec.ts, test/e2e/live-repo-audit.spec.ts, playwright.live.config.ts, test/e2e/*.png snapshots, BUILD_STATE.md | 242e45f |
