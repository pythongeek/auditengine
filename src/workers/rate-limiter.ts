import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types/index'
import {
  checkRateLimitCounters,
  RATE_LIMIT_WINDOW_MS,
  type RateLimitCounters,
  type RateLimitBucket,
} from '../lib/rate-limit'

interface RateLimitCheckRequest {
  method: string
  windowStart: number
  bucket: RateLimitBucket
  limit: number
  priority: boolean
}

export class RateLimiterDurableObject extends DurableObject<Env> {
  private counters: RateLimitCounters = {
    readWindow: 0,
    readCount: 0,
    writeWindow: 0,
    writeCount: 0,
    llmAgentWindow: 0,
    llmAgentCount: 0,
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  async fetch(request: Request): Promise<Response> {
    const body = await request.json() as RateLimitCheckRequest
    const { windowStart, bucket, limit, priority } = body

    if (priority) {
      return new Response(JSON.stringify({ allowed: true, limit, count: 0, remaining: limit }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { response, counters } = checkRateLimitCounters(this.counters, bucket, limit, windowStart)
    this.counters = counters

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export { RATE_LIMIT_WINDOW_MS }
