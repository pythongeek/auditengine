---
name: auditengine-s02
description: Run AuditEngine build session S02 from the build bible
type: flow
whenToUse: When the user wants to execute S02 of the AuditEngine build plan
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
