export const DEFAULT_TOKEN_BUDGET = 100_000
export const PAID_TOKEN_BUDGET = 1_000_000

export function getTokenBudgetForPlan(plan: string): number {
  const normalized = plan.toLowerCase().trim()
  if (normalized === 'paid' || normalized === 'enterprise' || normalized === 'pro') {
    return PAID_TOKEN_BUDGET
  }
  return DEFAULT_TOKEN_BUDGET
}

export async function getTokensUsed(db: D1Database, auditRunId: string): Promise<number> {
  const row = await db
    .prepare('SELECT SUM(prompt_tokens + completion_tokens) AS total FROM token_usage WHERE audit_run_id = ?')
    .bind(auditRunId)
    .first<{ total: number }>()
  return row?.total ?? 0
}

export async function getTenantPlan(db: D1Database, auditRunId: string): Promise<string> {
  const session = await db
    .prepare('SELECT tenant_id FROM audit_sessions WHERE id = ?')
    .bind(auditRunId)
    .first<{ tenant_id: string }>()
  const tenantId = session?.tenant_id ?? ''

  const tenant = await db
    .prepare('SELECT plan FROM tenants WHERE id = ?')
    .bind(tenantId)
    .first<{ plan: string }>()

  return tenant?.plan ?? 'free'
}

export interface TokenBudgetResult {
  allowed: boolean
  used: number
  budget: number
  remaining: number
}

export async function checkTokenBudget(
  db: D1Database,
  auditRunId: string,
  requestedTokens: number
): Promise<TokenBudgetResult> {
  const plan = await getTenantPlan(db, auditRunId)
  const budget = getTokenBudgetForPlan(plan)
  const used = await getTokensUsed(db, auditRunId)
  const remaining = budget - used

  return {
    allowed: requestedTokens <= remaining,
    used,
    budget,
    remaining,
  }
}
