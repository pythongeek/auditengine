# AuditEngine Production-Ready Completion Plan

This plan covers every **Partially implemented** and **Not implemented** item from the doc-to-codebase audit. It is ordered by dependency and risk: spec alignment first, then runtime gaps, then external integrations, then UI/docs.

**Target:** `npx tsc --noEmit` and `npm test` pass after every phase, and the deployed worker at `auditengine.tsnion.workers.dev` can run a complete audit without stubs or hard-coded values.

---

## Phase 1 — Spec Alignment (quick wins, low risk)

### Step 1.1 — Model-router token budgets ✅ S32
**Files:** `src/lib/model-router.ts`, `test/model-router.test.ts`, `src/types/index.ts` (if new `TaskType` values are needed)
- Read the exact per-task budgets from `docs-extracted/05-Implementation-Plan.txt` and `docs-extracted/02-RFC-Technical-Specification.txt`.
- Add any missing `TaskType` values (e.g., `log_summary`, `dedup`, `task_description`, `gate_retry`) to `src/types/index.ts`.
- Update `TASK_ROUTE_MAP` so every documented task type maps to the correct model, provider, and `maxTokens`.
- Keep the existing agent-config override and large-file override behavior.
- **Acceptance:** every documented task type has a unit test asserting its route budget and model; `applyBudgetOverride` still downgrades non-salvation/trace tasks when ≥80% spent.

### Step 1.2 — Priority conflict rule fix ✅ S32
**Files:** `src/workers/priority-resolver.ts`, `test/coordinator.test.ts` or `test/workflows.test.ts`
- Change `detectConflicts()` from Security + Architecture to Security + Refactoring.
- Update the conflict reason string and existing tests.
- **Acceptance:** a file flagged by both Security and Refactoring agents is marked as a conflict; a Security+Architecture file is **not**.

---

## Phase 2 — Budget Pause Enforcement (medium risk, no new secrets)

### Step 2.1 — Agent criticality classification ✅ S33
**Files:** `src/lib/agent-config.ts`, `src/types/index.ts`, `src/lib/agent-config.ts`
- Add a `critical` boolean (or enum `criticality`) to `AgentConfig`/`DEFAULT_AGENT_CONFIG`.
- Non-critical agents: `testing`, `documentation`, `performance`, `visual_qa`, `logging` (RFC/PRD discretion). All other 19 agents are critical.
- Ensure `ensureDefaultAgentConfig` writes the new column.
- **Acceptance:** default config rows contain the correct criticality values.

### Step 2.2 — Coordinator 80/95 pause logic ✅ S33
**Files:** `src/workers/coordinator.ts`, `test/coordinator.test.ts`, `src/db/schema.sql`
- In `CoordinatorDurableObject.alarm()`, after reading `run_budget` alert flags, act on them:
  - `alert_80_sent = 1` and not yet acted: `UPDATE agent_registry SET status = 'paused' WHERE audit_run_id = ? AND agent_type IN (non-critical list)`.
  - `alert_95_sent = 1` and not yet acted: `UPDATE agent_registry SET status = 'paused' WHERE audit_run_id = ?` (all agents).
- Track which alert levels have been acted on in DO storage (similar to `lastAlertState`).
- Broadcast `budget_alert` with the correct threshold and a `paused_agents` payload.
- Optionally add a `throttled` flag to `run_budget` via D1 trigger or handle it in the coordinator.
- **Acceptance:** tests verify non-critical agents pause at 80%, all agents pause at 95%, and critical agents continue between 80% and 95%.

---

## Phase 3 — Real External Research for Salvation (needs new secrets/APIs)

### Step 3.1 — Research adapter framework ✅ S34
**Files:** `src/lib/external-research.ts` (new), `src/types/index.ts`, `src/lib/salvation.ts`, `test/salvation.test.ts` (new), `test/external-research.test.ts` (new)
- Add `ExternalResearchSource` interface and a `ResearchAdapter` interface: `{ search(query: string): Promise<SalvationResearchSource[]> }`.
- Implement three adapters with timeouts and result limiting:
  - `NvdAdapter` — `fetch` to `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=...` (no key, rate-limit friendly).
  - `GitHubIssueAdapter` — `fetch` GitHub search issues API using `env.GITHUB_TOKEN`.
  - `WebSearchAdapter` — generic `fetch` to a configurable search provider (e.g., Brave/Bing). Requires a new secret `SEARCH_API_KEY` and a `SEARCH_PROVIDER` var (default `brave`). If no key is configured, adapter returns empty.
- Each adapter returns sources matching `SalvationResearchSource` exactly, with `source_type` constrained to `owasp | nvd | github_issue | stackoverflow | framework_docs`.
- Cache results in `knowledge_ledger` with `knowledge_type = 'research'` to avoid repeated external calls for the same file/category.
- **Acceptance:** tests mock each adapter; real adapters do not crash when keys are missing.

### Step 3.2 — Wire research into Salvation Protocol ✅ S34
**Files:** `src/workers/salvation.ts`, `src/agents/base-agent.ts`, `wrangler.toml`
- Derive 2–3 keyword queries from the gate rejection history and the current file category.
- Call the adapters in parallel, collect up to 5 sources, deduplicate by URL.
- If fewer than 2 real sources are found, fall back to a single LLM call that explicitly returns at least one `framework_docs` source but marks it as LLM-generated.
- Persist the report unchanged; the `research_sources` array now contains real URLs where possible.
- Add `SEARCH_API_KEY` and `SEARCH_PROVIDER` to `wrangler.toml` `[vars]` / secrets list and to `Env` type.
- **Acceptance:** a salvation workflow test with mocked adapters verifies that real sources are written to `salvation_reports` and broadcast as `salvation_complete`.

---

## Phase 4 — Task Lifecycle REST API (medium risk, no new secrets)

### Step 4.1 — Task/Finding endpoints ✅ S35
**Files:** `src/lib/router.ts`, `src/index.ts`, `test/queue.test.ts` / `test/coordinator.test.ts`
- Add handlers:
  - `GET /api/v1/tenants/:tenantId/audits/:auditRunId/tasks` — list tasks with status filter.
  - `PATCH /api/v1/tenants/:tenantId/audits/:auditRunId/tasks/:taskId` — body `{ status, commit_sha?, assigned_agent? }`. Allowed transitions: `backlog → in_progress`, `in_progress → in_review`, `in_review → done`, and any → `backlog` (human reset). Validate tenant ownership.
  - `POST /api/v1/tenants/:tenantId/audits/:auditRunId/tasks/:taskId/verify` — trigger `verifyTask` for the task and return the result.
  - `GET /api/v1/tenants/:tenantId/audits/:auditRunId/findings` — list findings.
  - `PATCH /api/v1/tenants/:tenantId/audits/:auditRunId/findings/:findingId` — update status, e.g., `wont_fix` with `reason`.
- Wire into `src/index.ts` under `dispatchRoute`.
- **Acceptance:** unit tests cover each endpoint, ownership enforcement, and invalid status transitions (400).

### Step 4.2 — Lock timeout and commit wiring ✅ S35
**Files:** `src/workers/coordinator.ts`, `src/lib/router.ts`, `src/db/schema.sql` (no schema change needed)
- On `PATCH → in_progress`, set `tasks.lock_expires_at = unixepoch() + 48 * 3600` and `assigned_agent`.
- In `CoordinatorDurableObject.alarm()`, add a query to find tasks with `status = 'in_progress' AND lock_expires_at < unixepoch()` and reset them to `backlog` with `assigned_agent = NULL`, broadcasting `task_status_change`.
- On `PATCH → done`, require `commit_sha` and set `status = 'in_review'` (do **not** auto-resolve; verification decides). Then trigger verification automatically.
- **Acceptance:** tests verify lock expiry resets the task; done without commit_sha returns 400; done moves task to `in_review` and queues verification.

---

## Phase 5 — Verification Hardening (needs real repo metadata)

### Step 5.1 — Parse owner/repo from stored repo URL ✅ S36
**Files:** `src/workers/verification.ts`, `src/lib/github.ts`, `test/verification.test.ts` (new)
- Replace hardcoded `OWNER`/`REPO` in `verifyTask` with values parsed from `audit_sessions.repo_url` for the task's `audit_run_id`.
- Parse `https://github.com/owner/repo` and `https://github.com/owner/repo/tree/branch` formats; default branch to `audit_sessions.repo_branch`.
- If `repo_url` is missing or unsupported, return `VerifyResult { result: 'failed', reason: 'Missing repo_url' }` and log `agent_errors`.
- **Acceptance:** tests with mock `audit_sessions` rows verify correct owner/repo extraction and failure when absent.

### Step 5.2 — Regression scan ✅ S36
**Files:** `src/workers/verification.ts`, `src/workers/coordinator.ts`, `test/verification.test.ts`
- Implement `scheduleRegressionScan` instead of the stub:
  - For each finding that was just verified as resolved, spawn a lightweight re-analysis for its file by the same agent type (or create a new `regression` task) with a `since_commit` parameter.
  - If the re-analysis finds the same evidence_quote in the new commit, create a new finding with `is_regression = true`, `severity = previous + 1`, and broadcast `finding_created`.
- Use the `content_hash` or `last_commit_sha` fields to know what to compare against.
- **Acceptance:** a regression test shows a resolved finding re-appearing in a diff and a new `is_regression = 1` finding is created.

### Step 5.3 — Visual QA re-run gate and human sign-off ✅ S36
**Files:** `src/workers/visual-qa.ts`, `src/lib/router.ts`, `src/workers/coordinator.ts`, `src/types/index.ts`
- When a task containing `screenshot_id` findings moves to `in_review`, the coordinator (or verification handler) re-runs `runVisualQA` against `env.STAGING_URL` and verifies the screenshot still shows the issue.
- If the re-run fails, the task status returns to `backlog` with a reason.
- Add a `human_approved` boolean field to the `verifyTask` / `POST .../verify` flow; if `true`, the finding can be marked `resolved` regardless of diff evidence (audited by `audit_logs`).
- **Acceptance:** tests mock the browser and verify the re-run gate; human override is recorded in `audit_logs`.

---

## Phase 6 — Continuous Audit / Git Diff Worker (needs real Git access)

### Step 6.1 — Git diff helper ✅ S37
**Files:** `src/lib/git-diff.ts` (new), `src/lib/github.ts`, `test/git-diff.test.ts` (new)
- Functions: `getLatestCommit(owner, repo, branch, token)`, `getChangedFilesSince(owner, repo, baseSha, headSha, token)`, `fetchRawFile(owner, repo, path, ref, token)`.
- Return typed arrays of `{ path, status, new_content }`.
- **Acceptance:** tests mock GitHub API; failure paths return null and log errors.

### Step 6.2 — Continuous audit workflow implementation ✅ S37
**Files:** `src/workflows/continuous-audit-workflow.ts`, `src/workers/coordinator.ts`, `src/agents/base-agent.ts`, `src/workers/ingestion.ts`, `wrangler.toml`, `test/workflows.test.ts`
- Schedule the workflow hourly via `wrangler.toml` `schedules = ["0 * * * *"]` on `CONTINUOUS_AUDIT_WORKFLOW`.
- Steps inside the workflow:
  1. `fetch-latest-commit` — compare with `audit_sessions.last_commit_sha`. If unchanged, exit.
  2. `fetch-changed-files` — call `getChangedFilesSince` and `fetchRawFile` for changed paths.
  3. `re-ingest-changed-files` — re-chunk, re-hash, upload to R2, and update `files.content_hash` and `last_analyzed_at`.
  4. `spawn-reanalysis` — notify the `CoordinatorDurableObject` (or directly spawn agent DOs) to re-analyze changed files. Use the existing `agentNamespace` and `spawnAgent` helpers; pass a `reanalysis` flag.
  5. `regression-check` — for every resolved finding on a changed file, create a regression task or finding if the evidence still exists.
  6. `recalculate-score` — call `recalcProductionScore` and broadcast `score_updated`.
  7. `update-last-commit` — write the new `last_commit_sha` to `audit_sessions`.
- **Acceptance:** workflow tests with mocked GitHub and DO stubs verify all seven steps execute in order and commit is updated.

### Step 6.3 — Webhook ingestion trigger ✅ S37
**Files:** `src/index.ts`, `src/lib/router.ts`, `test/webhooks.test.ts` (new)
- Add `POST /webhooks/github`, `/webhooks/gitlab`, `/webhooks/bitbucket` (gitlab/bitbucket can be no-ops initially but must return 200).
- GitHub webhook verifies `X-Hub-Signature-256` using `env.GITHUB_WEBHOOK_SECRET` (new secret), parses `push` events, and triggers `CONTINUOUS_AUDIT_WORKFLOW.create({ id, params })` for the affected `audit_run_id`.
- **Acceptance:** tests verify signature validation and workflow creation; invalid signature returns 401.

---

## Phase 7 — Multi-Repository Support (high risk, schema change)

### Step 7.1 — Repository group schema ✅ S38
**Files:** `src/db/schema.sql`, `src/types/index.ts`, `src/workers/ingestion.ts`, `src/lib/router.ts`
- Add tables:
  - `repo_groups(tenant_id, group_id, name, created_at)`
  - `repo_group_members(group_id, audit_run_id, role)` (role: `consumer`/`dependency`/`service`)
  - `repo_dependencies(tenant_id, group_id, dependency_path, consumer_run_id, provider_run_id)`
- Add `repo_group_id` parameter to `/ingest` and `/audit/start`.
- Update `ensureAuditSession` to store group membership.
- **Acceptance:** migration tests verify tables; ingestion with group_id succeeds.

### Step 7.2 — Cross-repo propagation ✅ S38
**Files:** `src/workers/coordinator.ts`, `src/workers/verification.ts`, `src/lib/router.ts`
- When a finding in a `provider` run is marked `resolved`, lookup `repo_dependencies` and trigger verification in related `consumer` runs for the same file path.
- When a shared dependency file changes, queue re-analysis in all consuming runs.
- Add `GET /api/v1/tenants/:tenantId/groups/:groupId` endpoint to list group audits.
- **Acceptance:** tests verify that resolving a finding in a provider run creates a verification task in a consumer run.

---

## Phase 8 — Dashboard UI / Human Task Board (frontend work)

### Step 8.1 — Standalone Pages dashboard or Next.js app ✅ S39
**Files:** `dashboard-ui/` (new) or `src/dashboard/*.html` extensions
- Add a login page that accepts a JWT token and stores it in `localStorage`.
- Add a tenant selector (list tenants from a new `GET /api/v1/tenants` endpoint — admin-only).
- Add an audit list page (`GET /api/v1/tenants/:tenantId/audits`).
- Add a task board page with columns: Backlog, In Progress, In Review, Done. Allow drag-and-drop that calls the PATCH endpoints from Phase 4.
- Add a finding detail page with commit SHA input, human sign-off button, and WebSocket live updates.
- **Acceptance:** Playwright snapshot tests cover login, audit list, task board, and finding sign-off.

### Step 8.2 — Backend endpoints for the UI ✅ S39
**Files:** `src/lib/router.ts`, `src/index.ts`, `src/lib/auth.ts`
- `GET /api/v1/tenants` (admin only, uses `ADMIN_EMAIL`/`ADMIN_PASSWORD`).
- `GET /api/v1/tenants/:tenantId/audits`.
- `GET /api/v1/tenants/:tenantId/audits/:auditRunId` (status, score, findings count).
- Ensure all endpoints are protected by JWT and rate-limited.
- **Acceptance:** tests verify admin-only tenant list and tenant-scoped audit list.

---

## Phase 9 — OAuth + Git Provider Webhooks (needs apps/secrets)

### Step 9.1 — GitHub OAuth ✅ S40
**Files:** `src/lib/auth.ts`, `src/lib/token-crypto.ts`, `src/index.ts`, `src/lib/router.ts`, `wrangler.toml`
- Add `GET /auth/github` redirect and `GET /auth/github/callback` handlers.
- Exchange code for token using `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (new secrets) and store the token in `tenants.github_token` (encrypted at rest with a new `ENCRYPTION_KEY` secret, or use Cloudflare Secrets Store if available).
- Update `verifyTask` to use the tenant-specific token first, falling back to `env.GITHUB_TOKEN`.
- **Acceptance:** tests mock the GitHub OAuth exchange and token storage.

### Step 9.2 — GitLab / Bitbucket support ✅ S40
**Files:** `src/lib/git-router.ts`, `src/lib/github.ts`, `src/lib/gitlab.ts`, `src/lib/bitbucket.ts`, `src/workers/verification.ts`, `src/workers/ingestion.ts`, `src/index.ts`, `wrangler.toml`
- Add `GitLabVerifier` and `BitbucketVerifier` implementing the same interface as GitHub verification.
- Support GitLab zipball URL and API, Bitbucket archive URL and API.
- Add `/auth/gitlab/callback` and `/webhooks/gitlab`, `/webhooks/bitbucket`.
- **Acceptance:** tests mock GitLab and Bitbucket APIs; ingestion and verification work for all three providers.

---

## Phase 10 — Cloudflare AI Gateway / Managed Memory (optional, verify API)

### Step 10.1 — AI Gateway routing ✅ S41
**Files:** `src/types/index.ts`, `wrangler.toml`, `src/lib/llm-gateway.ts`, `test/llm-gateway.test.ts`
- Added optional `AI_GATEWAY_URL` var. When set, `buildEndpoint()` routes through the gateway; when unset, direct provider calls are preserved.
- The exact gateway path prefix is marked `// TODO: VERIFY CLOUDFLARE API — DO NOT GUESS` because the documented format is unconfirmed.
- **Acceptance:** `test/llm-gateway.test.ts` verifies both gateway and direct endpoint construction.

### Step 10.2 — Managed Agent Memory (if supported) ⚠️
- **VERIFY CLOUDFLARE API:** before writing code, confirm whether the Cloudflare Agent Memory binding is available in the target Workers runtime and whether it supports the required read/write RPC. If it does, add an `AGENT_MEMORY` binding and a `src/lib/agent-memory.ts` wrapper that mirrors the current `SharedMemoryDurableObject` interface. If not, keep the custom DO.
- **Acceptance:** fall back to `SharedMemoryDurableObject` when the binding is absent.

---

## Phase 11 — Performance, Load, Docs, Security

### Step 11.1 — Performance/caching layer ✅ S41
**Files:** `src/types/index.ts`, `src/lib/cache.ts` (new), `src/lib/gate.ts`, `src/agents/base-agent.ts`, `test/cache.test.ts`
- Added a small `LRUCache` inside `AgentDurableObject` and threaded it through `tick()` into `GateContext.chunkCache` so repeated R2 evidence reads for the same chunk are served from memory within one agent tick.
- **Acceptance:** `test/cache.test.ts` verifies cache hit/miss/eviction; `evidenceInR2()` writes back to the cache.

### Step 11.2 — Load testing harness ✅ S41
**Files:** `scripts/load-test.ts` (new), `package.json`, `test/load-test.test.ts`
- Script creates N tenants, starts audits, opens WebSocket connections, and reports P95 latency, error rate, and dashboard message counts over a configurable duration.
- Runs against a staging deployment (`STAGING_URL`) using a configurable `JWT_SECRET`.
- **Acceptance:** `npm run load-test` completes; `test/load-test.test.ts` runs a mocked dry-run to ensure the harness does not crash.

### Step 11.3 — OpenAPI / API documentation ✅ S41
**Files:** `src/lib/openapi.ts` (new), `src/lib/router.ts`, `src/index.ts`, `test/openapi.test.ts`
- Added an OpenAPI 3.1 document describing the authenticated REST endpoints, security schemes, and core schemas.
- Served publicly at `GET /api/v1/openapi.json`.
- **Acceptance:** `test/openapi.test.ts` verifies the endpoint returns the expected spec and that every declared path has a security scheme where required.

### Step 11.4 — Security audit / onboarding wizard / API key settings ✅ S41 / S42
**Files:** `scripts/security-audit.ts` (new), `test/security-audit.test.ts`, `src/dashboard/onboarding.html`, `src/dashboard/onboarding-html.ts`, `src/dashboard/settings.html`, `src/dashboard/settings-html.ts`, `src/lib/settings.ts`, `src/lib/router.ts`, `src/index.ts`, `scripts/e2e-server.ts`, `test/e2e/onboarding.spec.ts`, `test/e2e/settings.spec.ts`, `test/settings.test.ts`
- Security script scans `src/**/*.ts` for direct provider fetches outside `src/lib/llm-gateway.ts`, hardcoded secret literals, and protected routes in `src/index.ts` that bypass authentication. It exits non-zero when issues are found.
- Added a step-by-step onboarding wizard at `/onboarding` with links to log in, start a new audit, and view audits, plus help tooltips.
- Added a `/settings` page where an admin can enter Kimi and Minimax API keys. Keys are encrypted at rest with `ENCRYPTION_KEY` and stored in the `app_settings` table; the LLM gateway falls back to these keys when the corresponding `wrangler secret` is not set.
- **Acceptance:** `test/security-audit.test.ts` covers all three scanner categories and asserts the current tree has zero findings; `test/e2e/onboarding.spec.ts` and `test/e2e/settings.spec.ts` verify the pages render and match Playwright snapshots; `test/settings.test.ts` verifies encryption, decryption, masking, and admin-only access.

---

## Execution Notes

1. **Do not start Phase 3, 6, or 9 until the required secrets are configured** in the Cloudflare dashboard or `wrangler secret put`. Secrets needed: `SEARCH_API_KEY`, `SEARCH_PROVIDER`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET`, `ENCRYPTION_KEY` (or use Cloudflare Secrets Store), optional `AI_GATEWAY_URL`.
2. **Every phase must be merged with a green commit.** Run `npx tsc --noEmit && npm test` before each commit; update `BUILD_STATE.md` with the new phase and session log entry.
3. **Schema changes** (Phases 2, 7) require `wrangler d1 migrations apply` or re-applying `src/db/schema.sql` to remote D1. Document the migration in `BUILD_STATE.md`.
4. **Rate-limit external APIs** (NVD, GitHub, search) with `Promise.all` concurrency limits and in-memory backoff to avoid provider bans.
5. If any Cloudflare API is uncertain (Agent Memory, AI Gateway, Secrets Store), add `// TODO: VERIFY CLOUDFLARE API — DO NOT GUESS` and stop for confirmation before merging.
