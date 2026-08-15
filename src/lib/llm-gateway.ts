import type { Env, LLMCallParams, NormalizedResponse, RawUsage,
  Provider, Model, DashboardEvent, Message } from '../types/index'
import { routeToModel, applyBudgetOverride } from './model-router'
import { getAgentConfig } from './agent-config'
import { redactForLLM } from './secrets'
import { checkTokenBudget } from './token-budget'
import { checkAgentRateLimit } from './rate-limit'

// Provider endpoints — exact values, do not modify URLs
const ENDPOINTS: Record<Model, string> = {
  "kimi-k3":    "https://api.moonshot.cn/v1/chat/completions",
  "kimi-k2.6":  "https://api.moonshot.cn/v1/chat/completions",
  "minimax-m3": "https://api.minimax.chat/v1/text/chatcompletion_pro",
}

// Pricing per 1,000,000 tokens in USD
const PRICING: Record<Model, { fresh: number; cached: number; output: number }> = {
  "kimi-k3":    { fresh: 3.00,  cached: 0.30, output: 15.00 },
  "kimi-k2.6":  { fresh: 0.95,  cached: 0.19, output:  4.00 },
  "minimax-m3": { fresh: 0.30,  cached: 0.06, output:  1.20 },
}

export class RateLimitError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'RateLimitError'
  }
}

export class BudgetExhaustedError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'BudgetExhaustedError'
  }
}

export function calcCostUsd(model: Model, usage: RawUsage): number {
  const pricing = PRICING[model]
  if (!pricing) return 0

  const promptTokens = usage.prompt_tokens ?? 0
  const completionTokens = usage.completion_tokens ?? 0
  const cachedTokens = usage.cached_tokens ?? 0
  const freshTokens = Math.max(0, promptTokens - cachedTokens)

  const cost =
    (freshTokens / 1_000_000) * pricing.fresh +
    (cachedTokens / 1_000_000) * pricing.cached +
    (completionTokens / 1_000_000) * pricing.output

  return Math.round(cost * 1_000_000_000) / 1_000_000_000
}

export function normalizeResponse(provider: Provider, raw: unknown): NormalizedResponse {
  if (provider === 'kimi') {
    const r = raw as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        prompt_tokens_details?: { cached_tokens?: number }
      }
    }
    const text = r.choices?.[0]?.message?.content ?? ''
    const usage: RawUsage = {
      prompt_tokens: r.usage?.prompt_tokens ?? 0,
      completion_tokens: r.usage?.completion_tokens ?? 0,
      cached_tokens: r.usage?.prompt_tokens_details?.cached_tokens,
    }
    return { text, usage }
  }

  // minimax
  const r = raw as {
    choices?: Array<{ messages?: Array<{ text?: string }> }>
    usage?: { total_tokens?: number }
  }
  const text = r.choices?.[0]?.messages?.[0]?.text ?? ''
  const total = r.usage?.total_tokens ?? 0
  const usage: RawUsage = {
    prompt_tokens: Math.floor(total * 0.75),
    completion_tokens: Math.floor(total * 0.25),
  }
  return { text, usage }
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 4
): Promise<Response> {
  let delay = 1000
  const cap = 32000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init)
    if (res.status !== 429) {
      return res
    }

    if (attempt === maxRetries) {
      throw new RateLimitError(`Rate limited after ${maxRetries} retries`)
    }

    const retryAfter = res.headers.get('Retry-After')
    if (retryAfter) {
      const parsed = parseInt(retryAfter, 10)
      if (!isNaN(parsed)) {
        delay = parsed * 1000
      }
    }

    await new Promise(resolve => setTimeout(resolve, delay))
    delay = Math.min(delay * 2, cap)
  }

  throw new RateLimitError('Rate limited')
}

export function getApiKey(provider: Provider, env: Env): string {
  if (provider === 'kimi') return env.KIMI_API_KEY
  return env.MINIMAX_API_KEY
}

export async function llmCall(params: LLMCallParams, env: Env): Promise<NormalizedResponse> {
  const { agentId, agentType, taskType, messages, auditRunId, db, broadcast } = params

  // Check budget
  const budgetRow = await db
    .prepare('SELECT paused FROM run_budget WHERE audit_run_id = ?')
    .bind(auditRunId)
    .first<{ paused: number }>()
  if (budgetRow?.paused === 1) {
    throw new BudgetExhaustedError(`Budget exhausted for audit run ${auditRunId}`)
  }

  const auditSession = await db
    .prepare('SELECT tenant_id FROM audit_sessions WHERE id = ?')
    .bind(auditRunId)
    .first<{ tenant_id: string }>()
  const tenantId = auditSession?.tenant_id ?? ''

  const agentConfig = await getAgentConfig(db, tenantId, agentType)

  // Estimate input tokens to drive the routing table's size override.
  const inputTokenCount = messages.reduce((sum, m) => {
    return sum + Math.ceil((m.content ?? '').length / 4)
  }, 0)

  const route = routeToModel(taskType, agentConfig, agentType, inputTokenCount)

  const tokenBudget = await checkTokenBudget(db, auditRunId, route.budget)
  if (!tokenBudget.allowed) {
    throw new BudgetExhaustedError(
      `Token budget exhausted for audit run ${auditRunId}: ${tokenBudget.used}/${tokenBudget.budget} tokens used, ${route.budget} requested`
    )
  }

  // At 80% spend, downgrade expensive models (except salvation/trace analysis).
  const spentPct = tokenBudget.budget > 0 ? tokenBudget.used / tokenBudget.budget : 0
  const finalRoute = applyBudgetOverride(route, spentPct)

  const isSalvation = taskType === 'salvation_research'
  const agentRateAllowed = await checkAgentRateLimit(
    tenantId,
    auditRunId,
    agentId,
    env.RATE_LIMIT_DO,
    agentConfig.llm_calls_per_minute,
    isSalvation
  )
  if (!agentRateAllowed) {
    throw new BudgetExhaustedError(
      `Agent LLM rate limit exhausted for ${agentId} in audit run ${auditRunId}`
    )
  }

  const apiKey = getApiKey(finalRoute.provider, env)
  const endpoint = ENDPOINTS[finalRoute.model]

  const temperature = agentConfig.temperature
  const topP = agentConfig.top_p

  const redactedMessages: Message[] = messages.map(m => ({
    ...m,
    content: redactForLLM(m.content),
  }))

  let body: Record<string, unknown>
  if (finalRoute.provider === 'kimi') {
    body = {
      model: finalRoute.model,
      messages: redactedMessages,
      max_tokens: finalRoute.maxTokens,
      temperature,
      top_p: topP,
    }
  } else {
    // minimax
    const minimaxMessages = redactedMessages.map(m =>
      m.role === 'assistant' ? { role: m.role, text: m.content } : { role: m.role, text: m.content }
    )
    body = {
      model: finalRoute.model,
      messages: minimaxMessages,
      tokens_to_generate: finalRoute.maxTokens,
      temperature,
      top_p: topP,
    }
  }

  const res = await fetchWithRetry(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new Error(`LLM request failed: ${res.status} ${text}`)
  }

  const raw = await res.json()
  const normalized = normalizeResponse(finalRoute.provider, raw)

  const costUsd = calcCostUsd(finalRoute.model, normalized.usage)

  await db
    .prepare(`
      INSERT INTO token_usage
        (audit_run_id, agent_id, model, task_type, prompt_tokens, completion_tokens, cached_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      auditRunId,
      agentId,
      finalRoute.model,
      taskType,
      normalized.usage.prompt_tokens,
      normalized.usage.completion_tokens,
      normalized.usage.cached_tokens ?? 0,
      costUsd
    )
    .run()

  const event: DashboardEvent = {
    type: 'token_usage',
    audit_run_id: auditRunId,
    agent_id: agentId,
    payload: {
      model: finalRoute.model,
      task_type: taskType,
      prompt_tokens: normalized.usage.prompt_tokens,
      completion_tokens: normalized.usage.completion_tokens,
      cached_tokens: normalized.usage.cached_tokens ?? 0,
      cost_usd: costUsd,
    },
    ts: Date.now(),
  }
  broadcast(event)

  return normalized
}
