---
name: auditengine-lifecycle-guard
description: Enforces Salvation Protocol, Visual QA, re-audit, and gap-mitigation rules for AuditEngine.
type: flow
whenToUse: Whenever implementing Salvation Protocol, Visual QA, continuous re-audit, Priority Resolver, ingestion, or gap mitigations.
---

# AUDITENGINE LIFECYCLE GUARD

Use this skill for ingestion, Salvation Protocol, Visual QA, continuous re-audit, Priority Resolver, and gap-mitigation work.

## 1. REPOSITORY INGESTION

The Ingestion Worker is the Phase 0 blocking gate.

Required behavior:

- Accept zip upload or GitHub URL.
- Walk every file and build a flat manifest.
- Chunk each file into segments of ≤500 lines.
- Compute a SHA-256 `content_hash` per file.
- Store chunks in R2. Docs key format: `{tenant_id}/{audit_session_id}/{file_path_hash}/{chunk_index}`.
- Write file metadata to D1 (`path`, `language`, `domain_tag`, `line_count`, `chunk_count`, `r2_key`, `content_hash`).
- Tag domains: `frontend`, `backend`, `config`, `test`, `infra`, `smart-contract`.
- Emit `repo.ready` event to the Coordinator.
- If ingestion fails or produces an empty manifest, **HALT** and alert. Never proceed with a partial manifest.

## 2. SALVATION PROTOCOL

Trigger: an agent fails to resolve a finding after **3 attempts**.

Escalation path:

1. Third failure transitions the agent into Research Phase.
2. Research queries authoritative sources: OWASP, NVD CVE, framework GitHub Issues, Stack Overflow.
3. Every source must be cited with a **full URL**.
4. Produce a Salvation Report containing:
   - `attempts`: every attempt with `what_was_tried` and `why_it_failed`
   - `research_sources`: `source_type`, `url`, `relevant_finding`, `proposed_solution`
   - `human_recommendation`
   - `estimated_effort`: `S` | `M` | `L` | `XL`
   - `blocking_task_ids`
   - `broadcast_message`
5. The finding becomes a blocked task with cited research instead of a dead-end.

## 3. VISUAL QA AGENT

- Uses Cloudflare Browser Run (headless Chromium).
- Operates against the staged/deployed app URL (`STAGING_URL` env var).
- Tests every route, form submission, and admin action.
- Records screenshots, network requests, and DOM state.
- Assert types: `http_status`, `dom_visible`, `dom_text`, `network_request`, `no_console_error`.
- Any admin action that produces no network request = **CRITICAL** finding.
- Findings are injected into the same priority queue as static-analysis findings.

## 4. CONTINUOUS AUDIT LIFECYCLE

- Re-audit triggers when a file's `content_hash` changes.
- Support Git diff ingestion for incremental changes (gap mitigation).
- Preserve findings on unchanged files; do not duplicate them.
- Auto-close findings when the underlying issue is no longer detectable.
- Flag regressions when a resolved finding reappears; increment `recurrence_count`.
- Recalculate Production Readiness Score after every lifecycle cycle.
- A codebase is never marked production-ready until every critical and high-severity finding has been verified as resolved by commit diff.

## 5. PRIORITY RESOLVER

- Implemented as a deterministic Cloudflare Workflow.
- Must **NOT** use an LLM.
- Input: all findings for the audit run.
- Score = base severity × multipliers.
- Multipliers include: cross-agent agreement, blocking relationships, test coverage, conflict discount.
- Output: ranked task board with `title`, `finding_ids`, `priority_score`, `multipliers`, `status`, `assigned_agent`, `commit_sha`.

## 6. KEY GAP MITIGATIONS (use as acceptance criteria)

- **Token budget**: halt the audit session when budget is exhausted; alert at 80% and 100%.
- **Rate limiting**: tiered read/write quotas (docs default 200 read/min, 20 write/min per tenant); Salvation triggers must never be rate-limited.
- **Memory**: flush state to Durable Object SQLite between ReAct iterations; checkpoint before reaching 100 MB.
- **Secrets redaction**: two-stage (pre-LLM placeholders, post-analysis SHA-256 in evidence).
- **Agent cold start**: pre-warm with a lightweight ping RPC; checkpoint state before hibernation.
- **Cross-repo support**: future enhancement; do not implement without an explicit task.

## 7. DO NOT GUESS

If a doc requirement conflicts with `src/types/index.ts`, `src/db/schema.sql`, or `AGENTS.md`, stop and say:

> SPEC CONFLICT DETECTED: [describe the conflict and the source document].
