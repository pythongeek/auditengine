---
name: auditengine-s01
description: Run AuditEngine build session S01 from the build bible
type: flow
whenToUse: When the user wants to execute S01 of the AuditEngine build plan
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
