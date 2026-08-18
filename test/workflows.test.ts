import { describe, it, expect, vi } from 'vitest'
import { PriorityResolverWorkflow } from '../src/workflows/priority-resolver-workflow'
import { SalvationWorkflow } from '../src/workflows/salvation-workflow'
import { ContinuousAuditWorkflow } from '../src/workflows/continuous-audit-workflow'
import { makeMockWorkflows, makeMockEnvStrings } from './helpers'
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

vi.mock('../src/lib/git-diff', () => ({
  getLatestCommit: vi.fn(async () => 'new-sha'),
  getChangedFilesSince: vi.fn(async () => [
    { path: 'src/auth.ts', status: 'modified', new_content: 'const x = 1', patch: '' },
  ]),
  fetchRawFile: vi.fn(async () => null),
}))

import { getLatestCommit, getChangedFilesSince, fetchRawFile } from '../src/lib/git-diff'

function makeMockD1(options: { auditSession?: { repo_url: string; repo_branch: string; last_commit_sha: string | null } } = {}): { db: D1Database; runs: { sql: string; params: unknown[] }[] } {
  const runs: { sql: string; params: unknown[] }[] = []
  const statement = (sql: string) => ({
    run: () => {
      runs.push({ sql, params: [] })
      return Promise.resolve({ changes: 1, meta: {} })
    },
    first: () => {
      runs.push({ sql, params: [] })
      const lower = sql.toLowerCase()
      if (lower.includes('audit_sessions') && options.auditSession) {
        return Promise.resolve(options.auditSession)
      }
      return Promise.resolve(null)
    },
    all: () => {
      runs.push({ sql, params: [] })
      return Promise.resolve({ results: [] })
    },
    bind: (...params: unknown[]) => ({
      run: () => {
        runs.push({ sql, params })
        return Promise.resolve({ changes: 1, meta: {} })
      },
      first: () => {
        runs.push({ sql, params })
        const lower = sql.toLowerCase()
        if (lower.includes('audit_sessions') && options.auditSession) {
          return Promise.resolve(options.auditSession)
        }
        if (lower.includes('from findings')) {
          return Promise.resolve({ results: [] })
        }
        return Promise.resolve(null)
      },
      all: () => {
        runs.push({ sql, params })
        const lower = sql.toLowerCase()
        if (lower.includes('from findings')) {
          return Promise.resolve({ results: [] })
        }
        return Promise.resolve({ results: [] })
      },
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

function makeMockNamespace(): DurableObjectNamespace {
  return {
    idFromName: () => ({ toString: () => 'agent-id' }),
    get: () => ({
      fetch: () => Promise.resolve(new Response('OK', { status: 200 })),
    }),
  } as unknown as DurableObjectNamespace
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  const { db } = makeMockD1()
  const ns = makeMockNamespace()
  return {
    DB: db,
    R2: {
      put: () => Promise.resolve({} as R2Object),
      get: () => Promise.resolve(null),
      list: () => Promise.resolve({ objects: [], truncated: false, cursor: '' } as unknown as R2Objects),
      delete: () => Promise.resolve(),
    } as unknown as R2Bucket,
    AGENT_DO: ns,
    SECURITY_AGENT_DO: ns,
    API_AGENT_DO: ns,
    FRONTEND_AGENT_DO: ns,
    DATABASE_AGENT_DO: ns,
    ARCHITECTURE_AGENT_DO: ns,
    TESTING_AGENT_DO: ns,
    PERFORMANCE_AGENT_DO: ns,
    DEVOPS_AGENT_DO: ns,
    DOCUMENTATION_AGENT_DO: ns,
    VISUAL_QA_AGENT_DO: ns,
    BACKEND_AGENT_DO: ns,
    DEPENDENCY_AGENT_DO: ns,
    A11Y_AGENT_DO: ns,
    I18N_AGENT_DO: ns,
    LOGGING_AGENT_DO: ns,
    CODE_QUALITY_AGENT_DO: ns,
    ERROR_HANDLING_AGENT_DO: ns,
    CONFIGURATION_AGENT_DO: ns,
    REFACTORING_AGENT_DO: ns,
    SHARED_MEMORY_DO: ns,
    COORDINATOR_DO: ns,
    DASHBOARD_DO: ns,
    RATE_LIMIT_DO: ns,
    ...makeMockWorkflows(),
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    ...makeMockEnvStrings(),
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

  it('ContinuousAuditWorkflow runs all seven steps', async () => {
    const env = makeEnv({
      DB: makeMockD1({
        auditSession: {
          repo_url: 'https://github.com/acme/widgets',
          repo_branch: 'main',
          last_commit_sha: 'old-sha',
        },
      }).db,
    })
    const workflow = new ContinuousAuditWorkflow({} as ExecutionContext, env)
    const { step, names } = makeStep()

    await workflow.run(
      { payload: { auditRunId: 'run-001', tenantId: 'tenant-1' } } as unknown as Parameters<typeof workflow.run>[0],
      step
    )

    expect(names).toEqual([
      'fetch-audit-session',
      'fetch-latest-commit',
      'fetch-changed-files',
      're-ingest-changed-files',
      'delete-removed-files',
      'spawn-reanalysis',
      'regression-check',
      'trigger-consumer-audits',
      'recalculate-score',
      'update-last-commit',
    ])
    expect(vi.mocked(getLatestCommit)).toHaveBeenCalledWith('acme', 'widgets', 'main', '')
    expect(vi.mocked(getChangedFilesSince)).toHaveBeenCalledWith('acme', 'widgets', 'old-sha', 'new-sha', '')
  })
})
