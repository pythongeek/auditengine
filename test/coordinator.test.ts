import { describe, it, expect, vi } from 'vitest'
import { CoordinatorDurableObject, spawnAgent, getRelevantAgentsForPhase, agentNamespace } from '../src/workers/coordinator'
import { makeMockAgentNamespaces, makeMockWorkflows, makeMockEnvStrings } from './helpers'
import { ALL_AGENT_TYPES, NON_CRITICAL_AGENT_TYPES } from '../src/lib/agent-config'
import type { Env, AgentType, DashboardEvent } from '../src/types/index'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

function makeMockD1WithFiles(files: { domain_tag: string | null; path: string }[]) {
  const runs: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: () => {
          runs.push({ sql, params })
          return Promise.resolve({ changes: 1, meta: {} })
        },
        first: () => Promise.resolve(null),
        all: () => {
          const lower = sql.toLowerCase()
          if (lower.includes('distinct domain_tag')) {
            const tags = new Set(files.map(f => f.domain_tag).filter(Boolean))
            return Promise.resolve({ results: Array.from(tags).map(t => ({ domain_tag: t })) })
          }
          if (lower.includes('from files')) {
            return Promise.resolve({ results: files.map(f => ({ path: f.path, domain_tag: f.domain_tag })) })
          }
          return Promise.resolve({ results: [] })
        },
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
  return { db, runs }
}

function makeMockEnv(overrides: Partial<Env> = {}): Env {
  const fetchCalls: { url: string; body: unknown }[] = []
  const ns = {
    idFromName: (name: string) => ({ toString: () => name }),
    get: () => ({
      fetch: (req: Request) => {
        fetchCalls.push({ url: req.url, body: null })
        return Promise.resolve(new Response('OK', { status: 200 }))
      },
    }),
  } as unknown as DurableObjectNamespace

  const namespaces = makeMockAgentNamespaces()
  for (const key of Object.keys(namespaces)) {
    (namespaces as Record<string, DurableObjectNamespace>)[key] = ns
  }

  return {
    DB: makeMockD1WithFiles([]).db,
    R2: {} as R2Bucket,
    ...namespaces,
    COORDINATOR_DO: {} as DurableObjectNamespace,
    DASHBOARD_DO: {} as DurableObjectNamespace,
    RATE_LIMIT_DO: {} as DurableObjectNamespace,
    ...makeMockWorkflows(),
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    ...makeMockEnvStrings(),
    ...overrides,
  } as Env
}

function makeMockD1ForBudget(budgetRow: Record<string, unknown> | null) {
  const runs: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: () => {
          runs.push({ sql, params })
          return Promise.resolve({ changes: 1, meta: {} })
        },
        first: () => {
          runs.push({ sql, params })
          const lower = sql.toLowerCase()
          if (lower.includes('run_budget')) return Promise.resolve(budgetRow)
          return Promise.resolve(null)
        },
        all: () => {
          runs.push({ sql, params })
          return Promise.resolve({ results: [] })
        },
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
  return { db, runs }
}

function makeMockDashboardNamespace(events: DashboardEvent[]) {
  return {
    idFromName: (name: string) => ({ toString: () => name }),
    get: () => ({
      fetch: (req: Request) => {
        return req.json().then((body) => {
          events.push(body as DashboardEvent)
          return new Response('OK', { status: 200 })
        })
      },
    }),
  } as unknown as DurableObjectNamespace
}

function makeMockEnvForAlarm(db: D1Database, events: DashboardEvent[], overrides: Partial<Env> = {}): Env {
  const base = makeMockEnv({ DB: db, KIMI_API_KEY: 'test-kimi-key', ...overrides })
  base.DASHBOARD_DO = makeMockDashboardNamespace(events)
  return base
}

describe('coordinator domain-aware spawn', () => {
  it('returns all agents for an empty manifest because all-domain agents match', async () => {
    const { db } = makeMockD1WithFiles([])
    const relevant = await getRelevantAgentsForPhase('run-1', 'tenant-1', db, ['architecture', 'security', 'frontend'])
    expect(relevant).toContain('architecture')
    expect(relevant).not.toContain('security')
    expect(relevant).not.toContain('frontend')
  })

  it('spawns backend agents only when backend files exist', async () => {
    const { db } = makeMockD1WithFiles([
      { path: 'src/api.ts', domain_tag: 'backend' },
      { path: 'src/db.sql', domain_tag: 'database' },
    ])
    const relevant = await getRelevantAgentsForPhase('run-1', 'tenant-1', db, [
      'security', 'api', 'backend', 'database', 'architecture', 'frontend'
    ])
    expect(relevant).toContain('security')
    expect(relevant).toContain('api')
    expect(relevant).toContain('backend')
    expect(relevant).toContain('database')
    expect(relevant).toContain('architecture')
    expect(relevant).not.toContain('frontend')
  })

  it('spawns frontend agents only when frontend files exist', async () => {
    const { db } = makeMockD1WithFiles([{ path: 'src/components/Button.tsx', domain_tag: 'frontend' }])
    const relevant = await getRelevantAgentsForPhase('run-1', 'tenant-1', db, [
      'frontend', 'a11y', 'security', 'api'
    ])
    expect(relevant).toContain('frontend')
    expect(relevant).toContain('a11y')
    expect(relevant).not.toContain('security')
    expect(relevant).not.toContain('api')
  })
})

describe('coordinator spawnAgent', () => {
  it('writes registry row with domain and assigned files', async () => {
    const files = [
      { path: 'src/api.ts', domain_tag: 'backend' },
      { path: 'src/routes.ts', domain_tag: 'backend' },
    ]
    const { db, runs } = makeMockD1WithFiles(files)
    const env = makeMockEnv({ DB: db })

    await spawnAgent('security', 2, 'tenant-1', 'run-1', env)

    const registryInsert = runs.find(r => r.sql.toLowerCase().includes('insert or ignore into agent_registry'))
    expect(registryInsert).toBeDefined()
    expect(registryInsert?.params[2]).toBe('security')
    expect(registryInsert?.params[5]).toBe(2)
    expect(registryInsert?.params[6]).toBe('backend')
    const assignedFiles = JSON.parse(registryInsert?.params[7] as string)
    expect(assignedFiles).toEqual(['src/api.ts', 'src/routes.ts'])
  })
})

describe('coordinator agentNamespace', () => {
  it('maps every agent type to the correct Durable Object namespace', () => {
    const env = makeMockEnv()
    const agentTypes: AgentType[] = [
      'security', 'api', 'frontend', 'database', 'architecture', 'testing', 'performance', 'devops',
      'documentation', 'visual_qa', 'backend', 'dependency', 'a11y', 'i18n', 'logging', 'code_quality',
      'error_handling', 'configuration', 'refactoring'
    ]
    for (const agentType of agentTypes) {
      expect(() => agentNamespace(agentType, env)).not.toThrow()
    }
    expect((agentNamespace('security', env) as unknown as { idFromName: unknown }).idFromName).toBeDefined()
  })
})

describe('coordinator budget pause alarm', () => {
  it('pauses only non-critical agents at 80% and broadcasts a scoped alert', async () => {
    const events: DashboardEvent[] = []
    const { db, runs } = makeMockD1ForBudget({
      phase: 'boot',
      alert_50_sent: 0,
      alert_80_sent: 1,
      alert_95_sent: 0,
      paused: 0,
      throttled: 1,
      spent_usd: 4.0,
      budget_usd: 5.0,
    })
    const env = makeMockEnvForAlarm(db, events)
    const setAlarm = vi.fn()
    const coordinator = new CoordinatorDurableObject({ storage: { setAlarm } } as unknown as DurableObjectState, env)
    ;(coordinator as any).auditRunId = 'run-1'
    ;(coordinator as any).tenantId = 'tenant-1'

    await coordinator.alarm()
    await new Promise(resolve => setTimeout(resolve, 0))

    const pauseUpdate = runs.find(r =>
      r.sql.toLowerCase().includes('update agent_registry') &&
      r.sql.toLowerCase().includes("status = 'paused'")
    )
    expect(pauseUpdate).toBeDefined()
    expect(pauseUpdate?.params[0]).toBe('run-1')
    expect(pauseUpdate?.params.slice(1)).toEqual(NON_CRITICAL_AGENT_TYPES)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('budget_alert')
    expect(events[0].payload.threshold).toBe(80)
    expect(events[0].payload.scope).toBe('non_critical')
    expect(events[0].payload.paused_agents).toEqual(NON_CRITICAL_AGENT_TYPES)

    expect(setAlarm).toHaveBeenCalledOnce()
  })

  it('pauses all agents at 95% and broadcasts an all-agents alert', async () => {
    const events: DashboardEvent[] = []
    const { db, runs } = makeMockD1ForBudget({
      phase: 'boot',
      alert_50_sent: 0,
      alert_80_sent: 0,
      alert_95_sent: 1,
      paused: 1,
      throttled: 1,
      spent_usd: 4.75,
      budget_usd: 5.0,
    })
    const env = makeMockEnvForAlarm(db, events)
    const setAlarm = vi.fn()
    const coordinator = new CoordinatorDurableObject({ storage: { setAlarm } } as unknown as DurableObjectState, env)
    ;(coordinator as any).auditRunId = 'run-1'
    ;(coordinator as any).tenantId = 'tenant-1'

    await coordinator.alarm()
    await new Promise(resolve => setTimeout(resolve, 0))

    const pauseUpdate = runs.find(r =>
      r.sql.toLowerCase().includes('update agent_registry') &&
      r.sql.toLowerCase().includes("status = 'paused'")
    )
    expect(pauseUpdate).toBeDefined()
    expect(pauseUpdate?.params).toEqual(['run-1'])

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('budget_alert')
    expect(events[0].payload.threshold).toBe(95)
    expect(events[0].payload.scope).toBe('all')
    expect(events[0].payload.paused_agents).toEqual(ALL_AGENT_TYPES)

    expect(setAlarm).toHaveBeenCalledOnce()
  })
})

describe('coordinator task lock timeout', () => {
  function makeMockD1ForLockTimeout(tasks: Array<{ task_id: string; status: string; lock_expires_at: number | null }>) {
    const runs: { sql: string; params: unknown[] }[] = []
    const db = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => ({
          run: () => {
            runs.push({ sql, params })
            return Promise.resolve({ changes: 1, meta: {} })
          },
          first: () => {
            runs.push({ sql, params })
            const lower = sql.toLowerCase()
            if (lower.includes('run_budget')) {
              return Promise.resolve({
                phase: 'complete',
                alert_50_sent: 0,
                alert_80_sent: 0,
                alert_95_sent: 0,
                paused: 0,
                throttled: 0,
                spent_usd: 0,
                budget_usd: 5,
              })
            }
            return Promise.resolve(null)
          },
          all: () => {
            runs.push({ sql, params })
            const lower = sql.toLowerCase()
            if (lower.includes('from tasks') && lower.includes('lock_expires_at')) {
              const now = Math.floor(Date.now() / 1000)
              const result = tasks.filter(t => t.status === 'in_progress' && t.lock_expires_at !== null && t.lock_expires_at < now)
              return Promise.resolve({ results: result })
            }
            return Promise.resolve({ results: [] })
          },
        }),
      }),
      batch: () => Promise.resolve([]),
      dump: () => Promise.resolve(new ArrayBuffer(0)),
      exec: () => Promise.resolve({ count: 0, duration: 0 }),
    } as unknown as D1Database
    return { db, runs }
  }

  it('resets in_progress tasks whose 48-hour lock has expired', async () => {
    const events: DashboardEvent[] = []
    const { db, runs } = makeMockD1ForLockTimeout([
      { task_id: 'task-expired', status: 'in_progress', lock_expires_at: 1 },
      { task_id: 'task-active', status: 'in_progress', lock_expires_at: Math.floor(Date.now() / 1000) + 3600 },
    ])
    const env = makeMockEnvForAlarm(db, events)
    const setAlarm = vi.fn()
    const coordinator = new CoordinatorDurableObject({ storage: { setAlarm } } as unknown as DurableObjectState, env)
    ;(coordinator as any).auditRunId = 'run-1'
    ;(coordinator as any).tenantId = 'tenant-1'

    await coordinator.alarm()
    await new Promise(resolve => setTimeout(resolve, 0))

    const resetRuns = runs.filter(r =>
      r.sql.toLowerCase().includes('update tasks') &&
      r.sql.toLowerCase().includes('status =')
    )
    expect(resetRuns).toHaveLength(1)
    expect(resetRuns[0].params).toContain('task-expired')

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('task_status_change')
    expect(events[0].payload.task_id).toBe('task-expired')
    expect(events[0].payload.status).toBe('backlog')
    expect(events[0].payload.reason).toBe('lock_expired')
  })
})

describe('coordinator provider key fail-fast', () => {
  function makeMockD1NoKeys(): { db: D1Database; runs: { sql: string; params: unknown[] }[] } {
    const appSettings = new Map<string, string>()
    const runs: { sql: string; params: unknown[] }[] = []
    const db = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => ({
          run: () => {
            runs.push({ sql, params })
            return Promise.resolve({ changes: 1, meta: {} })
          },
          first: () => {
            runs.push({ sql, params })
            const lower = sql.toLowerCase()
            if (lower.includes('run_budget')) {
              return Promise.resolve({
                phase: 'boot',
                alert_50_sent: 0,
                alert_80_sent: 0,
                alert_95_sent: 0,
                spent_usd: 0,
                budget_usd: 5,
              })
            }
            if (lower.includes('from app_settings')) {
              return Promise.resolve(appSettings.get(params[0] as string) ? { value: appSettings.get(params[0] as string) } : null)
            }
            if (lower.includes('from audit_sessions')) {
              return Promise.resolve({ status: 'running' })
            }
            return Promise.resolve(null)
          },
          all: () => {
            runs.push({ sql, params })
            return Promise.resolve({ results: [] })
          },
        }),
      }),
      batch: () => Promise.resolve([]),
      dump: () => Promise.resolve(new ArrayBuffer(0)),
      exec: () => Promise.resolve({ count: 0, duration: 0 }),
    } as unknown as D1Database
    return { db, runs }
  }

  it('marks the audit failed when no LLM provider keys are configured', async () => {
    const events: DashboardEvent[] = []
    const { db, runs } = makeMockD1NoKeys()
    const env = makeMockEnvForAlarm(db, events, { KIMI_API_KEY: '', MINIMAX_API_KEY: '' })
    const coordinator = new CoordinatorDurableObject({ storage: { setAlarm: vi.fn() } } as unknown as DurableObjectState, env)
    ;(coordinator as any).auditRunId = 'run-no-keys'
    ;(coordinator as any).tenantId = 'tenant-1'

    await coordinator.alarm()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(runs.some(r => r.sql.toLowerCase().includes('update audit_sessions') && r.sql.includes('failed'))).toBe(true)
    const logRun = runs.find(r => r.sql.toLowerCase().includes('audit_logs') && r.sql.toLowerCase().includes('insert') && r.sql.includes('workflow_failed'))
    expect(logRun).toBeDefined()
    expect(JSON.stringify(logRun?.params)).toMatch(/llm provider api key/i)
    expect(events.some(e => e.type === 'audit_complete' && e.payload.status === 'failed')).toBe(true)
  })
})

describe('coordinator phase-3 to phase-4 transition', () => {
  function makeMockD1Phase3(options: { tasks?: number; priorityResolverDone?: boolean; phase3AgentsDone?: boolean } = {}): { db: D1Database; runs: { sql: string; params: unknown[] }[] } {
    const runs: { sql: string; params: unknown[] }[] = []
    const db = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => ({
          run: () => {
            runs.push({ sql, params })
            return Promise.resolve({ changes: 1, meta: {} })
          },
          first: () => {
            runs.push({ sql, params })
            const lower = sql.toLowerCase()
            if (lower.includes('run_budget')) {
              return Promise.resolve({
                phase: 'phase-3',
                alert_50_sent: 0,
                alert_80_sent: 0,
                alert_95_sent: 0,
                spent_usd: 0,
                budget_usd: 5,
              })
            }
            if (lower.includes("agent_type = 'priority_resolver'")) {
              return Promise.resolve(options.priorityResolverDone ? { status: 'done' } : null)
            }
            if (lower.includes('from agent_registry') && lower.includes('phase = ?') && lower.includes('count(*)')) {
              const phase = params[1]
              if (phase === 3) {
                // The first query is the total count; the second filters by status IN ('done', 'error').
                const isDoneQuery = lower.includes("status in ('done', 'error')") || lower.includes('status in (?, ?)')
                if (isDoneQuery) {
                  return Promise.resolve({ count: options.phase3AgentsDone ? 1 : 0 })
                }
                return Promise.resolve({ count: options.phase3AgentsDone ? 0 : 1 })
              }
              return Promise.resolve({ count: 0 })
            }
            if (lower.includes('from tasks') && lower.includes('count(*)')) {
              return Promise.resolve({ count: options.tasks ?? 0 })
            }
            return Promise.resolve(null)
          },
          all: () => {
            runs.push({ sql, params })
            return Promise.resolve({ results: [] })
          },
        }),
      }),
      batch: () => Promise.resolve([]),
      dump: () => Promise.resolve(new ArrayBuffer(0)),
      exec: () => Promise.resolve({ count: 0, duration: 0 }),
    } as unknown as D1Database
    return { db, runs }
  }

  it('proceeds to phase-4 even with zero tasks when priority resolver and phase-3 agents are done', async () => {
    const events: DashboardEvent[] = []
    const { db, runs } = makeMockD1Phase3({ tasks: 0, priorityResolverDone: true, phase3AgentsDone: true })
    const env = makeMockEnvForAlarm(db, events)
    const coordinator = new CoordinatorDurableObject({ storage: { setAlarm: vi.fn() } } as unknown as DurableObjectState, env)
    ;(coordinator as any).auditRunId = 'run-zero-tasks'
    ;(coordinator as any).tenantId = 'tenant-1'

    await coordinator.alarm()
    await new Promise(resolve => setTimeout(resolve, 0))

    const phaseUpdate = runs.find(r =>
      r.sql.toLowerCase().includes('update run_budget') &&
      r.sql.includes('phase-4')
    )
    expect(phaseUpdate).toBeDefined()
    expect(events.some(e => e.type === 'task_created')).toBe(true)
    const taskEvent = events.find(e => e.type === 'task_created')
    expect(taskEvent?.payload.message).toMatch(/no findings/i)
  })

  it('does not proceed to phase-4 while phase-3 agents are still running', async () => {
    const events: DashboardEvent[] = []
    const { db, runs } = makeMockD1Phase3({ tasks: 1, priorityResolverDone: true, phase3AgentsDone: false })
    const env = makeMockEnvForAlarm(db, events)
    const coordinator = new CoordinatorDurableObject({ storage: { setAlarm: vi.fn() } } as unknown as DurableObjectState, env)
    ;(coordinator as any).auditRunId = 'run-phase3-running'
    ;(coordinator as any).tenantId = 'tenant-1'

    await coordinator.alarm()
    await new Promise(resolve => setTimeout(resolve, 0))

    const phaseUpdate = runs.find(r =>
      r.sql.toLowerCase().includes('update run_budget') &&
      r.sql.includes('phase-4')
    )
    expect(phaseUpdate).toBeUndefined()
  })
})
