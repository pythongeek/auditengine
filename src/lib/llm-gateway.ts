import type { Env, LLMCallParams, NormalizedResponse, RawUsage,
  Provider, Model, DashboardEvent } from '../types/index'
import { routeToModel } from './model-router'

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

  const route = routeToModel(taskType)
  const apiKey = getApiKey(route.provider, env)
  const endpoint = ENDPOINTS[route.model]

  let body: Record<string, unknown>
  if (route.provider === 'kimi') {
    body = { model: route.model, messages, max_tokens: route.maxTokens }
  } else {
    // minimax
    const minimaxMessages = messages.map(m =>
      m.role === 'assistant' ? { role: m.role, text: m.content } : { role: m.role, text: m.content }
    )
    body = { model: route.model, messages: minimaxMessages, tokens_to_generate: route.maxTokens }
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
  const normalized = normalizeResponse(route.provider, raw)

  const costUsd = calcCostUsd(route.model, normalized.usage)

  await db
    .prepare(`
      INSERT INTO token_usage
        (audit_run_id, agent_id, model, task_type, prompt_tokens, completion_tokens, cached_tokens, cost_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      auditRunId,
      agentId,
      route.model,
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
      model: route.model,
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
