import { describe, it, expect, vi } from 'vitest'
import { buildPlanMessages, generatePlanForTask } from '../src/workers/planner'
import type { Finding, Task } from '../src/types/index'

vi.mock('../src/lib/llm-gateway', () => ({
  llmCall: vi.fn(async () => ({
    text: '1. Fix the auth check in src/auth.ts\n2. Verify with the login test',
    usage: { prompt_tokens: 0, completion_tokens: 0 },
  })),
}))

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    task_id: 'task-1',
    tenant_id: 'tenant-1',
    audit_run_id: 'run-1',
    title: 'Fix 2 issue(s) in auth.ts',
    finding_ids: JSON.stringify(['F-1']),
    priority_score: 100,
    multipliers: '[]',
    status: 'backlog',
    assigned_agent: null,
    commit_sha: null,
    created_at: 0,
    updated_at: 0,
    conflict_flag: 0,
    conflict_reason: null,
    lock_expires_at: null,
    ...overrides,
  }
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    finding_id: 'F-1',
    tenant_id: 'tenant-1',
    audit_run_id: 'run-1',
    agent_id: 'agent-1',
    agent_type: 'security',
    severity: 'critical',
    category: 'auth_bypass',
    file: 'src/auth.ts',
    line_range: [10, 20],
    evidence_quote: 'if (user) { return next() }',
    description: 'Missing token validation',
    impact: 'Unauthenticated access to protected routes',
    verified_by: '[]',
    source: 'agent',
    status: 'open',
    recurrence_count: 0,
    is_regression: false,
    ts: 0,
    verified_at: null,
    screenshot_id: null,
    ...overrides,
  } as Finding
}

function makeMockD1(task: Task | null, findings: Finding[] = []) {
  const updates: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: () => {
          updates.push({ sql, params })
          return Promise.resolve({ meta: { changes: 1 } })
        },
        first: () => {
          if (sql.includes('FROM tasks')) return Promise.resolve(task)
          return Promise.resolve(null)
        },
        all: () => {
          if (sql.includes('FROM findings')) return Promise.resolve({ results: findings })
          return Promise.resolve({ results: [] })
        },
      }),
    }),
  } as unknown as D1Database
  return { db, updates }
}

function makeEnv(db: D1Database) {
  return {
    DB: db,
    DASHBOARD_DO: {
      idFromName: (n: string) => n,
      get: () => ({ fetch: () => Promise.resolve(new Response('ok')) }),
    },
  } as unknown as import('../src/types/index').Env
}

describe('buildPlanMessages', () => {
  it('includes the task title and finding evidence', () => {
    const messages = buildPlanMessages(makeTask(), [makeFinding()])
    const user = messages.find(m => m.role === 'user')!
    expect(user.content).toContain('Fix 2 issue(s) in auth.ts')
    expect(user.content).toContain('F-1')
    expect(user.content).toContain('if (user) { return next() }')
    expect(messages[0].role).toBe('system')
  })
})

describe('generatePlanForTask', () => {
  it('stores a ready plan on success', async () => {
    const task = makeTask()
    const { db, updates } = makeMockD1(task, [makeFinding()])
    const result = await generatePlanForTask('task-1', makeEnv(db))
    expect(result.ok).toBe(true)
    expect(result.plan).toContain('Fix the auth check')
    const storeUpdate = updates.find(u => u.sql.includes('plan_text'))
    expect(storeUpdate).toBeDefined()
    expect(storeUpdate!.params[1]).toBe('task-1')
  })

  it('returns an error for a missing task', async () => {
    const { db } = makeMockD1(null)
    const result = await generatePlanForTask('missing', makeEnv(db))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Task not found')
  })
})
