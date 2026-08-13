export const READ_LIMIT_PER_MINUTE = 200
export const WRITE_LIMIT_PER_MINUTE = 20
export const RATE_LIMIT_WINDOW_MS = 60_000

export interface RateLimitCounters {
  readWindow: number
  readCount: number
  writeWindow: number
  writeCount: number
  llmAgentWindow: number
  llmAgentCount: number
}

export interface RateLimitCheckResponse {
  allowed: boolean
  limit: number
  count: number
  remaining: number
}

export type RateLimitBucket = 'read' | 'write' | 'llm-agent'

export function checkRateLimitCounters(
  counters: RateLimitCounters,
  bucket: RateLimitBucket,
  limit: number,
  windowStart: number
): { response: RateLimitCheckResponse; counters: RateLimitCounters } {
  const next = { ...counters }

  if (bucket === 'read') {
    if (next.readWindow !== windowStart) {
      next.readWindow = windowStart
      next.readCount = 0
    }
    const allowed = next.readCount < limit
    if (allowed) next.readCount++
    return {
      response: {
        allowed,
        limit,
        count: next.readCount,
        remaining: Math.max(0, limit - next.readCount),
      },
      counters: next,
    }
  }

  if (bucket === 'write') {
    if (next.writeWindow !== windowStart) {
      next.writeWindow = windowStart
      next.writeCount = 0
    }
    const allowed = next.writeCount < limit
    if (allowed) next.writeCount++
    return {
      response: {
        allowed,
        limit,
        count: next.writeCount,
        remaining: Math.max(0, limit - next.writeCount),
      },
      counters: next,
    }
  }

  // bucket === 'llm-agent'
  if (next.llmAgentWindow !== windowStart) {
    next.llmAgentWindow = windowStart
    next.llmAgentCount = 0
  }
  const allowed = next.llmAgentCount < limit
  if (allowed) next.llmAgentCount++
  return {
    response: {
      allowed,
      limit,
      count: next.llmAgentCount,
      remaining: Math.max(0, limit - next.llmAgentCount),
    },
    counters: next,
  }
}

export function rateLimitResponse(): Response {
  return new Response(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
  })
}

export async function checkRateLimit(
  request: Request,
  tenantId: string,
  rateLimitDO: DurableObjectNamespace
): Promise<boolean> {
  const isPriority = request.headers.get('X-Priority') === 'salvation'
  const isWrite = request.method !== 'GET' && request.method !== 'HEAD'
  const bucket = isWrite ? 'write' : 'read'
  const limit = isWrite ? WRITE_LIMIT_PER_MINUTE : READ_LIMIT_PER_MINUTE

  return await checkRateLimitWithBucket(
    request.method,
    tenantId,
    rateLimitDO,
    'api-' + bucket,
    bucket,
    limit,
    isPriority
  )
}

export async function checkAgentRateLimit(
  tenantId: string,
  auditRunId: string,
  agentId: string,
  rateLimitDO: DurableObjectNamespace,
  limit: number,
  isPriority: boolean
): Promise<boolean> {
  const method = 'POST'
  return await checkRateLimitWithBucket(
    method,
    tenantId,
    rateLimitDO,
    `llm-${auditRunId}-${agentId}`,
    'llm-agent',
    limit,
    isPriority
  )
}

async function checkRateLimitWithBucket(
  method: string,
  tenantId: string,
  rateLimitDO: DurableObjectNamespace,
  namespaceSuffix: string,
  bucket: RateLimitBucket,
  limit: number,
  isPriority: boolean
): Promise<boolean> {
  const rateLimiterId = rateLimitDO.idFromName('rate-limit-' + namespaceSuffix + '-' + tenantId)
  const stub = rateLimitDO.get(rateLimiterId)
  const windowStart = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS

  const res = await stub.fetch(new Request('https://rate-limit/check', {
    method: 'POST',
    body: JSON.stringify({ method, windowStart, bucket, limit, priority: isPriority }),
    headers: { 'Content-Type': 'application/json' },
  }))

  const result = await res.json() as { allowed: boolean }
  return result.allowed
}
