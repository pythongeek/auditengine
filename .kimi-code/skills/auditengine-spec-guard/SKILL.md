---
name: auditengine-spec-guard
description: Load at the start of every AuditEngine task to enforce the docs-derived anti-hallucination and architecture rules.
type: flow
whenToUse: At the beginning of every AuditEngine session or task, before reading BUILD_STATE.md and src/types/index.ts.
---

# AUDITENGINE SPEC GUARD

Run this at the start of every AuditEngine task. It layers the rules from the `docs/` folder on top of `AGENTS.md`.

## 1. MANDATORY READ ORDER

1. Read `AGENTS.md` in the project root.
2. Read `BUILD_STATE.md`.
3. Read `src/types/index.ts`.
4. Read the specific file(s) listed in the task.
5. Read any docs section referenced by the task (PRD / RFC / Architecture / Gap Analysis / Lifecycle / Agent Documentation / Build Guide).

Do not write a line of code until steps 1-4 are complete.

## 2. SOURCE-OF-TRUTH HIERARCHY

When the docs contradict the current code, use this hierarchy:

1. `AGENTS.md` (standing orders)
2. `src/types/index.ts`
3. `src/db/schema.sql`
4. `docs/` (design intent, not a silent override)

If a task asks you to change code so it matches a doc but the change would violate `AGENTS.md`, `src/types/index.ts`, or `src/db/schema.sql`, stop and say:

> SPEC CONFLICT DETECTED: [describe the contradiction]. Awaiting explicit user approval before changing `src/types/index.ts` or `src/db/schema.sql`.

## 3. HARD RULES FROM AGENTS.md (non-negotiable)

- Never add, rename, or remove fields in `src/types/index.ts` unless the task explicitly says "update types/index.ts".
- Never rename a D1 column. The schema in `src/db/schema.sql` is the source of truth.
- All external model API calls go through `src/lib/llm-gateway.ts` `llmCall()` only. No direct `fetch()` to any model provider endpoint.
- The only valid model names are: `kimi-k3`, `kimi-k2.6`, `minimax-m3`.
- Do not use `claude-*`, `gpt-*`, `gemini-*`, or any other model name anywhere.
- Never import Node.js built-ins (`fs`, `path`, `child_process`, etc.). The Workers runtime has no filesystem and no node_modules. Use Web APIs and R2.
- Do not create, modify, or delete any file not listed in the task. If another file needs changing, say:
  > SCOPE QUESTION: I think I need to also change [file] because [reason]. Should I?

## 4. DOCS-DERIVED ANTI-HALLUCINATION RULES

- **Evidence mandate**: every finding must include a verbatim `evidence_quote` from the actual file, an exact file path, and a `line_range`.
- **Banned output phrases**: never write `production ready`, `looks good`, `should work`, `seems correct`, `appears to`, `likely works`, `no issues found`, `clean code`, `well structured`, `everything looks`.
- **Unknowns must be labeled**: if a file has not been read or a claim cannot be verified, label it `UNKNOWN` or append `— UNVERIFIED`.
- **Sycophancy is a bug**: optimize for truth, not user satisfaction.
- **No speculation**: do not say "probably", "likely", or "I assume" without marking it unverified.
- **Negative claims require exhaustive proof**: "no issues found" is almost never valid.

## 5. ARCHITECTURE / API GUARDS

- Cloudflare Workers memory limit is 128 MB; design agents to flush state to Durable Object storage between iterations.
- Durable Objects hibernate after 30 seconds of inactivity; checkpoint state before long waits.
- CPU limit is 300 seconds; LLM I/O does not count against it.
- All agent inter-communication happens through D1. Agents never call each other directly.
- The Coordinator never analyzes code; it only spawns agents, tracks status, and triggers workflows.
- File chunks must be ≤500 lines.
- R2 chunk key format (docs intent): `{tenant_id}/{audit_session_id}/{file_path_hash}/{chunk_index}`. If the current code uses a different key, do not change it without explicit user approval.
- The Priority Resolver must be deterministic code, not an LLM call.

## 6. WHEN YOU ARE UNCERTAIN

Use these exact phrases instead of guessing:

- `SPEC CONFLICT DETECTED: [describe it]`
- `SCOPE QUESTION: [describe it]`
- `VERIFY CLOUDFLARE API: [describe it]`
- `TYPE QUESTION: [describe it]`

## 7. INCREMENTAL BUILD PRINCIPLE

Never build a component that depends on a component you have not yet verified. Each phase must produce a verified, deployable increment (`npx tsc --noEmit` passes, tests pass, `wrangler deploy` succeeds) before moving to the next.

## 8. SESSION END PROTOCOL

1. Run: `npx tsc --noEmit` and fix all errors.
2. Update `BUILD_STATE.md` accurately.
3. Say: "SESSION COMPLETE. Files changed: [list]. BUILD_STATE.md updated. Ready to commit."
