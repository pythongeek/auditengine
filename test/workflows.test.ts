import { describe, it, expect, vi } from 'vitest'
import { PriorityResolverWorkflow } from '../src/workflows/priority-resolver-workflow'
import { SalvationWorkflow } from '../src/workflows/salvation-workflow'
import { ContinuousAuditWorkflow } from '../src/workflows/continuous-audit-workflow'
import { makeMockAgentNamespaces, makeMockWorkflows } from './helpers'
import type { Env, AgentPersistentState } from '../src/types/index'
import type { WorkflowStep, WorkflowStepContext } from 'cloudflare:workers'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

vi.mock('../src/lib/llm-gateway', () => ({
  llmCall: vi.fn(async () => ({
    text: JSON.stringify({
      salvation_id: 'S-001',
      finding_id: 'F-001',
      attempts: [{ attempt_number: 1, what_was_tried: 'tried', why_it_failed: 'failed' }],
      research_sources: [
        {
          source_type: 'owasp',
          url: 'https://owasp.org',
          relevant_finding: 'x',
          proposed_solution: 'y',
        },
      ],
      human_recommendation: 'fix it',
      estimated_effort: 'M',
      blocking_task_ids: [],
      broadcast_message: 'salvation done',
    }),
    usage: { prompt_tokens: 0, completion_tokens: 0 },
  })),
}))

function makeMockD1(): { db: D1Database; runs: { sql: string; params: unknown[] }[] } {
  const runs: { sql: string; params: unknown[] }[] = []
  const statement = (sql: string) => ({
    run: () => {
      runs.push({ sql, params: [] })
      return Promise.resolve({ changes: 1, meta: {} })
    },
    first: () => Promise.resolve(null),
    all: () => Promise.resolve({ results: [] }),
    bind: (...params: unknown[]) => ({
      run: () => {
        runs.push({ sql, params })
        return Promise.resolve({ changes: 1, meta: {} })
      },
      first: () => Promise.resolve(null),
      all: () => Promise.resolve({ results: [] }),
    }),
  })
  const db = {
    prepare: (sql: string) => statement(sql),
    batch: (statements: unknown[]) => {
      runs.push({ sql: 'batch', params: [statements.length] })
      return Promise.resolve([])
    },
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
  return { db, runs }
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  const { db } = makeMockD1()
  return {
    DB: db,
    R2: {} as R2Bucket,
    ...makeMockAgentNamespaces(),
    COORDINATOR_DO: {} as DurableObjectNamespace,
    DASHBOARD_DO: {
      idFromName: () => ({ toString: () => 'dashboard-id' }),
      get: () => ({
        fetch: () => Promise.resolve(new Response('OK', { status: 200 })),
      }),
    } as unknown as DurableObjectNamespace,
    RATE_LIMIT_DO: {} as DurableObjectNamespace,
    ...makeMockWorkflows(),
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    KIMI_API_KEY: '',
    MINIMAX_API_KEY: '',
    GITHUB_TOKEN: '',
    JWT_SECRET: 'test-secret',
    STAGING_URL: '',
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD: '',
    ...overrides,
  }
}

function makeStep(): { step: WorkflowStep; names: string[] } {
  const names: string[] = []
  const step = {
    do: async <T>(name: string, callback: (ctx: WorkflowStepContext) => Promise<T>) => {
      names.push(name)
      return callback({} as WorkflowStepContext)
    },
    sleep: async () => {},
    sleepUntil: async () => {},
    waitForEvent: async () => ({ payload: {}, timestamp: new Date() }),
  } as unknown as WorkflowStep
  return { step, names }
}

describe('Workflows', () => {
  it('PriorityResolverWorkflow delegates to runPriorityResolver', async () => {
    const env = makeEnv()
    const workflow = new PriorityResolverWorkflow({} as ExecutionContext, env)
    const { step, names } = makeStep()

    await workflow.run({ payload: { auditRunId: 'run-001' } } as unknown as Parameters<typeof workflow.run>[0], step)

    expect(names).toEqual(['resolve-priorities'])
  })

  it('SalvationWorkflow delegates to runSalvationProtocol', async () => {
    const env = makeEnv()
    const workflow = new SalvationWorkflow({} as ExecutionContext, env)
    const { step, names } = makeStep()

    const state: AgentPersistentState = {
      agentId: 'agent-001',
      tenantId: 'tenant-1',
      agentType: 'security',
      auditRunId: 'run-001',
      state: 'salvation',
      fileQueue: [],
      queueCursor: 0,
      currentFile: 'src/auth.ts',
      currentFileContent: 'x',
      gateFailCount: 3,
      reactIterations: 0,
      currentFindingId: null,
      constitutionText: '',
      specText: '',
      lastModelOutput: null,
      gateRejectionReason: null,
      gateRejectionHistory: ['reason'],
      crossAgentContext: [],
      validatedFindings: [],
    }

    await workflow.run({ payload: state } as unknown as Parameters<typeof workflow.run>[0], step)

    expect(names).toEqual(['salvation-research'])
  })

  it('ContinuousAuditWorkflow recalculates the production score', async () => {
    const env = makeEnv()
    const workflow = new ContinuousAuditWorkflow({} as ExecutionContext, env)
    const { step, names } = makeStep()

    await workflow.run(
      { payload: { auditRunId: 'run-001', tenantId: 'tenant-1' } } as unknown as Parameters<typeof workflow.run>[0],
      step
    )

    expect(names).toEqual(['recalculate-production-score'])
  })
})
