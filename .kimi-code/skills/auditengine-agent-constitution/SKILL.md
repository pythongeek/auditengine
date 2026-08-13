---
name: auditengine-agent-constitution
description: Provides agent constitutions, lifecycle, and output-schema rules when writing AuditEngine specialist agents.
type: flow
whenToUse: Whenever you create or edit an agent constitution, specialist agent logic, coordinator logic, or agent prompts.
---

# AUDITENGINE AGENT CONSTITUTION

Use this skill whenever writing, editing, or reviewing agent code, constitutions, or prompts.

## 1. AGENT ROSTER (current implementation)

The valid specialist `AgentType` values are defined in `src/types/index.ts`:

- `security`, `api`, `frontend`, `database`, `architecture`, `testing`, `performance`, `devops`, `documentation`, `visual_qa`

The docs also describe a 15-agent roster. Do not add new `AgentType` values to `src/types/index.ts` unless the task explicitly says "update types/index.ts".

## 2. COORDINATOR RESPONSIBILITIES

The Coordinator Agent is a Durable Object. It **NEVER** analyzes code. Its jobs are:

1. Read the repository manifest from D1.
2. Decide which specialist agents to spawn based on detected file domains.
3. Write an Agent Registry entry to D1 for every spawned agent.
4. Emit spawn commands to sub-agents via typed RPC / `stub.fetch`.
5. Track agent status transitions.
6. Trigger the Priority Resolver when all agents report done.
7. Monitor for Salvation Protocol escalations.
8. Halt the run if a critical budget alert fires.

## 3. SPECIALIST AGENT LIFECYCLE

Every specialist agent follows the bounded ReAct loop:

> CLAIM → READ → ANALYZE → WRITE → COMPLETE

Rules:

- Claim files atomically through the D1 `claims` table. Do not analyze a file another agent has claimed.
- Read file chunks from R2 (≤500 lines per chunk).
- Analyze using `llmCall()` only.
- Write findings only after they pass the Verification Gate.
- Mark complete only when the file queue is exhausted or the agent is paused.

The ReAct loop must be bounded to a maximum of **5 iterations per chunk**.

## 4. TOOLS EACH AGENT MAY USE

Agents interact with the system through these functions only:

- `claimFile(path)` — atomic claim via D1.
- `readFile(path, chunkIndex?)` — read from R2.
- `queryD1(sql, params)` — read cross-agent context from D1.
- `writeFinding(finding)` — persist a validated finding.
- `llmCall(params)` — the **ONLY** allowed way to call an external model.
- `searchWeb(query)` — only during Salvation Protocol Research Phase.

Agents must **NOT** call other agents directly. All cross-agent awareness is through the D1 `findings` table (poll every 30 seconds).

## 5. OUTPUT SCHEMA CONTRACTS

All agent outputs are validated by the Verification Gate before reaching D1. The gate is deterministic code, not an LLM.

### Finding fields (from `src/types/index.ts`)

`finding_id`, `audit_run_id`, `agent_id`, `agent_type`, `severity`, `category`, `file`, `line_range`, `evidence_quote`, `description`, `impact`, `verified_by`, `source`, `status`, `recurrence_count`, `ts`, `verified_at`, `screenshot_id`.

### Salvation Report fields

`salvation_id`, `finding_id`, `attempts` (with `attempt_number`, `what_was_tried`, `why_it_failed`), `research_sources` (`source_type`, `url`, `relevant_finding`, `proposed_solution`), `human_recommendation`, `estimated_effort`, `blocking_task_ids`, `broadcast_message`.

## 6. EVIDENCE RULES

- Every finding **MUST** contain a verbatim `evidence_quote` from the analyzed file.
- The `evidence_quote` must be at least 10 characters.
- Secrets in evidence must be redacted with `[REDACTED-HASH:<sha256>]` or replaced by `[REDACTED]`.
- Performance findings must reference the exact query / ORM call, not generalized advice.
- Security findings must quote the exact code; never claim a vulnerability without evidence.
- If you cannot determine whether code is vulnerable, label it `needs-investigation` with severity `info`.

## 7. CONSTITUTIONAL BAN LIST

Never include these phrases in any agent output, finding, comment, or log:

`production ready`, `looks good`, `should work`, `seems correct`, `appears to`, `likely works`, `no issues found`, `clean code`, `well structured`, `everything looks`.

## 8. VERIFICATION AGENT RULES

- The Verification Agent re-reads only changed files (commit diff), not the whole repo.
- It compares the changed code against the original evidence line.
- A finding is resolved only when the original evidence is no longer present and the root cause is fixed.
- Output status: `resolved`, `failed_verification`, `needs_revision`, `failed`.

## 9. IF A TASK CONTRADICTS THE SPEC

Stop and use one of:

- `SPEC CONFLICT DETECTED: [describe]`
- `TYPE QUESTION: [describe]`
- `SCOPE QUESTION: [describe]`
