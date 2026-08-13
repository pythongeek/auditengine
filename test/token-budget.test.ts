import { describe, it, expect } from 'vitest'
import {
  getTokenBudgetForPlan,
  getTokensUsed,
  getTenantPlan,
  checkTokenBudget,
  DEFAULT_TOKEN_BUDGET,
  PAID_TOKEN_BUDGET,
} from '../src/lib/token-budget'

function makeTokenBudgetMockD1(options: {
  tenantPlan?: string
  tokensUsed?: number
} = {}): D1Database {
  const tenantPlan = options.tenantPlan ?? 'free'
  const tokensUsed = options.tokensUsed ?? 0

  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: () => {
          const lower = sql.toLowerCase()
          if (lower.includes('from audit_sessions')) {
            return Promise.resolve({ tenant_id: 'tenant-1' })
          }
          if (lower.includes('from tenants')) {
            return Promise.resolve({ plan: tenantPlan })
          }
          if (lower.includes('sum(prompt_tokens + completion_tokens)')) {
            return Promise.resolve({ total: tokensUsed })
          }
          return Promise.resolve(null)
        },
        run: () => Promise.resolve({ changes: 1, meta: {} }),
        all: () => Promise.resolve({ results: [] }),
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
}

describe('token-budget', () => {
  it('returns 100K tokens for free plan', () => {
    expect(getTokenBudgetForPlan('free')).toBe(DEFAULT_TOKEN_BUDGET)
  })

  it('returns 1M tokens for paid plan', () => {
    expect(getTokenBudgetForPlan('paid')).toBe(PAID_TOKEN_BUDGET)
  })

  it('returns 1M tokens for enterprise plan', () => {
    expect(getTokenBudgetForPlan('enterprise')).toBe(PAID_TOKEN_BUDGET)
  })

  it('defaults to free budget for unknown plan', () => {
    expect(getTokenBudgetForPlan('unknown')).toBe(DEFAULT_TOKEN_BUDGET)
  })

  it('reads cumulative token usage from token_usage', async () => {
    const db = makeTokenBudgetMockD1({ tokensUsed: 42_000 })
    const used = await getTokensUsed(db, 'run-001')
    expect(used).toBe(42_000)
  })

  it('reads tenant plan through audit_sessions', async () => {
    const db = makeTokenBudgetMockD1({ tenantPlan: 'paid' })
    const plan = await getTenantPlan(db, 'run-001')
    expect(plan).toBe('paid')
  })

  it('allows request within budget', async () => {
    const db = makeTokenBudgetMockD1({ tenantPlan: 'free', tokensUsed: 10_000 })
    const result = await checkTokenBudget(db, 'run-001', 50_000)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(90_000)
  })

  it('rejects request exceeding budget', async () => {
    const db = makeTokenBudgetMockD1({ tenantPlan: 'free', tokensUsed: 95_000 })
    const result = await checkTokenBudget(db, 'run-001', 10_000)
    expect(result.allowed).toBe(false)
    expect(result.used).toBe(95_000)
    expect(result.budget).toBe(DEFAULT_TOKEN_BUDGET)
  })

  it('gives paid tenants a larger budget', async () => {
    const db = makeTokenBudgetMockD1({ tenantPlan: 'paid', tokensUsed: 200_000 })
    const result = await checkTokenBudget(db, 'run-001', 500_000)
    expect(result.allowed).toBe(true)
    expect(result.budget).toBe(PAID_TOKEN_BUDGET)
  })
})
