import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runSalvationProtocol, buildSalvationPrompt } from '../src/workers/salvation'
import type { Env, AgentPersistentState, SalvationResearchSource } from '../src/types/index'
import { makeMockEnvStrings } from './helpers'

vi.mock('../src/lib/llm-gateway', () => ({
  llmCall: vi.fn(async () => ({
    text: JSON.stringify({
      salvation_id: 'S-001',
      finding_id: 'F-001',
      attempts: [{ attempt_number: 1, what_was_tried: 'analysis', why_it_failed: 'missing evidence' }],
      research_sources: [
        {
          source_type: 'nvd',
          url: 'https://nvd.nist.gov/vuln/detail/CVE-2023-0001',
          relevant_finding: 'Auth bypass',
          proposed_solution: 'Validate tokens',
        },
      ],
      human_recommendation: 'Validate all auth tokens',
      estimated_effort: 'M',
      blocking_task_ids: [],
      broadcast_message: 'Salvation complete',
    }),
    usage: { prompt_tokens: 0, completion_tokens: 0 },
  })),
}))

import { llmCall } from '../src/lib/llm-gateway'

function makeMockD1() {
  const runs: { sql: string; params: unknown[] }[] = []
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: () => {
          runs.push({ sql, params })
          return Promise.resolve({ changes: 1, meta: {} })
        },
        first: () => Promise.resolve(null),
        all: () => Promise.resolve({ results: [] }),
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
  return { db, runs }
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: makeMockD1().db,
    R2: {} as R2Bucket,
    AGENT_DO: {} as DurableObjectNamespace,
    SECURITY_AGENT_DO: {} as DurableObjectNamespace,
    API_AGENT_DO: {} as DurableObjectNamespace,
    FRONTEND_AGENT_DO: {} as DurableObjectNamespace,
    DATABASE_AGENT_DO: {} as DurableObjectNamespace,
    ARCHITECTURE_AGENT_DO: {} as DurableObjectNamespace,
    TESTING_AGENT_DO: {} as DurableObjectNamespace,
    PERFORMANCE_AGENT_DO: {} as DurableObjectNamespace,
    DEVOPS_AGENT_DO: {} as DurableObjectNamespace,
    DOCUMENTATION_AGENT_DO: {} as DurableObjectNamespace,
    VISUAL_QA_AGENT_DO: {} as DurableObjectNamespace,
    BACKEND_AGENT_DO: {} as DurableObjectNamespace,
    DEPENDENCY_AGENT_DO: {} as DurableObjectNamespace,
    A11Y_AGENT_DO: {} as DurableObjectNamespace,
    I18N_AGENT_DO: {} as DurableObjectNamespace,
    LOGGING_AGENT_DO: {} as DurableObjectNamespace,
    CODE_QUALITY_AGENT_DO: {} as DurableObjectNamespace,
    ERROR_HANDLING_AGENT_DO: {} as DurableObjectNamespace,
    CONFIGURATION_AGENT_DO: {} as DurableObjectNamespace,
    REFACTORING_AGENT_DO: {} as DurableObjectNamespace,
    SHARED_MEMORY_DO: {} as DurableObjectNamespace,
    COORDINATOR_DO: {} as DurableObjectNamespace,
    PRIORITY_RESOLVER_WORKFLOW: {} as Workflow,
    SALVATION_WORKFLOW: {} as Workflow,
    CONTINUOUS_AUDIT_WORKFLOW: {} as Workflow,
    DASHBOARD_DO: {
      idFromName: () => ({ toString: () => 'dashboard-id' }),
      get: () => ({ fetch: () => Promise.resolve(new Response('OK', { status: 200 })) }),
    } as unknown as DurableObjectNamespace,
    RATE_LIMIT_DO: {} as DurableObjectNamespace,
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    ...makeMockEnvStrings(),
    ...overrides,
  } as Env
}

function baseState(overrides: Partial<AgentPersistentState> = {}): AgentPersistentState {
  return {
    agentId: 'agent-001',
    tenantId: 'tenant-1',
    agentType: 'security',
    auditRunId: 'run-001',
    state: 'salvation',
    fileQueue: [],
    queueCursor: 0,
    currentFile: 'src/auth.ts',
    currentFileContent: 'const token = req.headers.authorization',
    gateFailCount: 3,
    reactIterations: 0,
    currentFindingId: null,
    constitutionText: '',
    specText: '',
    lastModelOutput: null,
    gateRejectionReason: 'missing evidence_quote',
    gateRejectionHistory: ['missing evidence_quote'],
    crossAgentContext: [],
    validatedFindings: [],
    ...overrides,
  }
}

describe('salvation protocol', () => {
  let mockFetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response('Not found', { status: 404 }))

  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockImplementation(async (_url: string, _init?: RequestInit) => new Response('Not found', { status: 404 }))
    vi.stubGlobal('fetch', mockFetch)
    ;(llmCall as ReturnType<typeof vi.fn>).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists a parsed salvation report and broadcasts completion', async () => {
    const { db, runs } = makeMockD1()
    const env = makeEnv({ DB: db })
    const state = baseState()

    await runSalvationProtocol(state, env)

    const insertRun = runs.find(r => r.sql.toLowerCase().includes('insert into salvation_reports'))
    expect(insertRun).toBeDefined()
    expect(insertRun?.params[0]).toBe('S-001')
    const broadcastRun = runs.find(r => r.sql.toLowerCase().includes('agent_registry') && r.sql.toLowerCase().includes("status = 'running'"))
    expect(broadcastRun).toBeDefined()
  })

  it('includes real external research sources in the LLM prompt', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('services.nvd.nist.gov')) {
        return new Response(
          JSON.stringify({
            vulnerabilities: [{
              cve: {
                id: 'CVE-2023-0001',
                descriptions: [{ lang: 'en', value: 'Auth bypass in token header' }],
              },
            }],
          }),
          { status: 200 }
        )
      }
      if (url.includes('api.github.com/search/issues')) {
        return new Response(
          JSON.stringify({
            items: [{
              html_url: 'https://github.com/org/repo/issues/1',
              title: 'Token header bypass',
              body: 'Validate the authorization header',
            }],
          }),
          { status: 200 }
        )
      }
      return new Response('Not found', { status: 404 })
    })

    const { db, runs } = makeMockD1()
    const env = makeEnv({
      DB: db,
      GITHUB_TOKEN: 'gh-token',
      SEARCH_API_KEY: 'search-key',
    })
    const state = baseState()

    await runSalvationProtocol(state, env)

    const call = (llmCall as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const userMessage = call.messages.find((m: { role: string; content: string }) => m.role === 'user')
    expect(userMessage.content).toContain('https://nvd.nist.gov/vuln/detail/CVE-2023-0001')
    expect(userMessage.content).toContain('https://github.com/org/repo/issues/1')
    expect(userMessage.content).toContain('REAL RESEARCH SOURCES')

    const cacheInsert = runs.find(r => r.sql.toLowerCase().includes('insert into knowledge_ledger'))
    expect(cacheInsert).toBeDefined()
  })

  it('adds an LLM-generated fallback source when external research finds fewer than 2 sources', async () => {
    const { db } = makeMockD1()
    const env = makeEnv({ DB: db })
    const state = baseState()

    await runSalvationProtocol(state, env)

    const call = (llmCall as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const userMessage = call.messages.find((m: { role: string; content: string }) => m.role === 'user')
    expect(userMessage.content).toContain('https://llm-generated')
  })

  it('logs an error when the LLM response cannot be parsed', async () => {
    ;(llmCall as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ text: 'not valid json', usage: { prompt_tokens: 0, completion_tokens: 0 } })

    const { db, runs } = makeMockD1()
    const env = makeEnv({ DB: db })
    const state = baseState()

    await runSalvationProtocol(state, env)

    const errorRun = runs.find(r => r.sql.toLowerCase().includes('insert into agent_errors'))
    expect(errorRun).toBeDefined()
    expect(JSON.stringify(errorRun?.params)).toContain('salvation_parse_error')
  })
})

describe('buildSalvationPrompt', () => {
  it('renders the research source block', () => {
    const sources: SalvationResearchSource[] = [
      {
        source_type: 'github_issue',
        url: 'https://github.com/org/repo/issues/1',
        relevant_finding: 'Token leak',
        proposed_solution: 'Rotate secrets',
      },
    ]
    const state = baseState()
    const messages = buildSalvationPrompt(state, sources)
    const user = messages.find(m => m.role === 'user')
    expect(user?.content).toContain('github_issue')
    expect(user?.content).toContain('https://github.com/org/repo/issues/1')
  })
})
