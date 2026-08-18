import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  NvdAdapter,
  GitHubIssueAdapter,
  WebSearchAdapter,
  createResearchAdapters,
  researchSalvation,
} from '../src/lib/external-research'
import type { Env, AgentPersistentState } from '../src/types/index'
import { makeMockEnvStrings } from './helpers'

function makeMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
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
    DASHBOARD_DO: {} as DurableObjectNamespace,
    RATE_LIMIT_DO: {} as DurableObjectNamespace,
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    ...makeMockEnvStrings({ JWT_SECRET: '' }),
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

function makeMockD1ForResearch(initialRows: Array<{ content: string }> = []) {
  const runs: { sql: string; params: unknown[] }[] = []
  const rows = [...initialRows]
  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: () => {
          runs.push({ sql, params })
          return Promise.resolve({ changes: 1, meta: {} })
        },
        first: () => Promise.resolve(null),
        all: () => {
          runs.push({ sql, params })
          const lower = sql.toLowerCase()
          if (lower.includes('knowledge_ledger') && lower.includes('select')) {
            return Promise.resolve({ results: rows })
          }
          return Promise.resolve({ results: [] })
        },
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
  return { db, runs, rows }
}

describe('external research adapters', () => {
  let mockFetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response('Not found', { status: 404 }))

  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockImplementation(async (_url: string, _init?: RequestInit) => new Response('Not found', { status: 404 }))
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('NvdAdapter parses CVE results from the NVD API', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('services.nvd.nist.gov')) {
        return new Response(
          JSON.stringify({
            vulnerabilities: [
              {
                cve: {
                  id: 'CVE-2023-0001',
                  descriptions: [{ lang: 'en', value: 'SQL injection in auth handler' }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return new Response('Not found', { status: 404 })
    })

    const adapter = new NvdAdapter()
    const results = await adapter.search('sql injection auth')
    expect(results).toHaveLength(1)
    expect(results[0].source_type).toBe('nvd')
    expect(results[0].url).toBe('https://nvd.nist.gov/vuln/detail/CVE-2023-0001')
    expect(results[0].relevant_finding).toContain('SQL injection')
  })

  it('GitHubIssueAdapter returns empty when no token is configured', async () => {
    const adapter = new GitHubIssueAdapter('')
    const results = await adapter.search('auth bypass')
    expect(results).toHaveLength(0)
  })

  it('WebSearchAdapter classifies StackOverflow results separately', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('api.search.brave.com')) {
        return new Response(
          JSON.stringify({
            web: {
              results: [
                { title: 'OWASP Auth Cheat Sheet', url: 'https://owasp.org', description: 'Auth guidance' },
                { title: 'StackOverflow: auth bypass', url: 'https://stackoverflow.com/q/123', description: 'Help' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return new Response('Not found', { status: 404 })
    })

    const adapter = new WebSearchAdapter('key', 'brave')
    const results = await adapter.search('auth bypass')
    expect(results).toHaveLength(2)
    expect(results[0].source_type).toBe('framework_docs')
    expect(results[1].source_type).toBe('stackoverflow')
  })

  it('createResearchAdapters returns NVD, GitHub, and web search adapters', () => {
    const env = makeMockEnv({ GITHUB_TOKEN: 'gh-token', SEARCH_API_KEY: 'search-key' })
    const adapters = createResearchAdapters(env)
    expect(adapters.map(a => a.name)).toEqual(['nvd', 'github_issue', 'web_search'])
  })
})

describe('researchSalvation', () => {
  let mockFetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response('Not found', { status: 404 }))

  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockImplementation(async (_url: string, _init?: RequestInit) => new Response('Not found', { status: 404 }))
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns cached research from knowledge_ledger without calling external APIs', async () => {
    const cachedSource = {
      source_type: 'nvd',
      url: 'https://nvd.nist.gov/vuln/detail/CVE-2023-9999',
      relevant_finding: 'Cached',
      proposed_solution: 'Use cache',
    }
    const { db, runs } = makeMockD1ForResearch([{ content: JSON.stringify(cachedSource) }])
    const env = makeMockEnv({ SEARCH_API_KEY: 'key' })
    const state = baseState()

    const results = await researchSalvation(state, env, db)

    expect(results).toHaveLength(1)
    expect(results[0].url).toBe(cachedSource.url)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(runs.some(r => r.sql.toLowerCase().includes('knowledge_ledger') && r.sql.toLowerCase().includes('select'))).toBe(true)
  })

  it('fetches adapters, deduplicates by URL, caches results, and returns up to 5 sources', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('services.nvd.nist.gov')) {
        return new Response(
          JSON.stringify({
            vulnerabilities: Array.from({ length: 3 }, (_, i) => ({
              cve: {
                id: `CVE-2023-000${i}`,
                descriptions: [{ lang: 'en', value: `NVD finding ${i}` }],
              },
            })),
          }),
          { status: 200 }
        )
      }
      if (url.includes('api.github.com')) {
        return new Response(
          JSON.stringify({
            items: Array.from({ length: 3 }, (_, i) => ({
              html_url: `https://github.com/org/repo/issues/${i}`,
              title: `GitHub issue ${i}`,
              body: `Body ${i}`,
            })),
          }),
          { status: 200 }
        )
      }
      if (url.includes('api.search.brave.com')) {
        return new Response(
          JSON.stringify({
            web: {
              results: Array.from({ length: 3 }, (_, i) => ({
                title: `Web result ${i}`,
                url: `https://example.com/result-${i}`,
                description: `Description ${i}`,
              })),
            },
          }),
          { status: 200 }
        )
      }
      return new Response('Not found', { status: 404 })
    })

    const { db, runs } = makeMockD1ForResearch()
    const env = makeMockEnv({ GITHUB_TOKEN: 'gh-token', SEARCH_API_KEY: 'search-key' })
    const state = baseState()

    const results = await researchSalvation(state, env, db)

    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(5)
    const urls = results.map(r => r.url)
    expect(new Set(urls).size).toBe(urls.length)
    const insertRuns = runs.filter(r => r.sql.toLowerCase().includes('insert into knowledge_ledger'))
    expect(insertRuns.length).toBe(results.length)
  })
})
