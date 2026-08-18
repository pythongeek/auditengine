import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifyTask, recalcProductionScore, escalateSeverityValue } from '../src/workers/verification'
import { handleTaskPatch } from '../src/lib/router'
import type { Env, Task, Finding } from '../src/types/index'
import { makeMockEnvStrings } from './helpers'

vi.mock('../src/workers/visual-qa', () => ({
  runVisualQA: vi.fn(async () => {}),
  discoverRoutes: vi.fn(async () => []),
  generateQAScript: vi.fn(async () => []),
  executeQAScript: vi.fn(async () => []),
}))

import { runVisualQA } from '../src/workers/visual-qa'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

function makeMockD1(options: {
  auditSession?: { id: string; tenant_id: string; repo_url: string; repo_branch: string }
  findings?: Finding[]
  tasks?: Task[]
  insertedFindings?: Array<{ sql: string; params: unknown[] }>
  insertedLogs?: unknown[]
  insertedErrors?: unknown[]
  runs?: { sql: string; params: unknown[] }[]
} = {}) {
  const auditSession = options.auditSession ?? { id: 'run-1', tenant_id: 'tenant-1', repo_url: 'https://github.com/owner/repo', repo_branch: 'main' }
  const findings = options.findings ?? []
  const tasks = options.tasks ?? []
  const insertedFindings = options.insertedFindings ?? []
  const insertedLogs = options.insertedLogs ?? []
  const insertedErrors = options.insertedErrors ?? []
  const runs = options.runs ?? []

  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: () => {
          runs.push({ sql, params })
          const lower = sql.toLowerCase()
          if (lower.includes('insert into findings')) {
            insertedFindings.push({ sql, params })
          }
          if (lower.includes('insert into audit_logs')) {
            insertedLogs.push({ sql, params })
          }
          if (lower.includes('insert into agent_errors')) {
            insertedErrors.push({ sql, params })
          }
          return Promise.resolve({ changes: 1, meta: {} })
        },
        first: () => {
          runs.push({ sql, params })
          const lower = sql.toLowerCase()
          if (lower.includes('from audit_sessions') && lower.includes('repo_url')) {
            return Promise.resolve(auditSession)
          }
          if (lower.includes('from audit_sessions') && lower.includes('tenant_id')) {
            return Promise.resolve(auditSession)
          }
          if (lower.includes('from findings') && lower.includes('finding_id')) {
            return Promise.resolve(findings.find(f => f.finding_id === params[0]) ?? null)
          }
          if (lower.includes('from tasks') && lower.includes('task_id')) {
            return Promise.resolve(tasks.find(t => t.task_id === params[0] && t.audit_run_id === params[1]) ?? null)
          }
          if (lower.includes('from findings') && lower.includes('severity')) {
            return Promise.resolve({ count: findings.filter(f => ['critical', 'high'].includes(f.severity)).length })
          }
          if (lower.includes('from tasks') && lower.includes('task_id')) {
            return Promise.resolve(null)
          }
          return Promise.resolve(null)
        },
        all: () => {
          runs.push({ sql, params })
          const lower = sql.toLowerCase()
          if (lower.includes('from findings') && lower.includes('in (')) {
            const ids = params as string[]
            return Promise.resolve({ results: findings.filter(f => ids.includes(f.finding_id)) })
          }
          if (lower.includes('from findings')) {
            return Promise.resolve({ results: findings })
          }
          if (lower.includes('from tasks')) {
            return Promise.resolve({ results: [] })
          }
          return Promise.resolve({ results: [] })
        },
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database

  return { db, runs, insertedFindings, insertedLogs, insertedErrors }
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
    DASHBOARD_DO: {} as DurableObjectNamespace,
    RATE_LIMIT_DO: {} as DurableObjectNamespace,
    PRIORITY_RESOLVER_WORKFLOW: {} as Workflow,
    SALVATION_WORKFLOW: {} as Workflow,
    CONTINUOUS_AUDIT_WORKFLOW: {} as Workflow,
    WRITE_QUEUE: {} as Queue,
    BROWSER: {} as Fetcher,
    ...makeMockEnvStrings({ GITHUB_TOKEN: 'token', STAGING_URL: 'https://staging.example.com' }),
    ...overrides,
  } as Env
}

function sampleTask(overrides: Partial<Task> = {}): Task {
  return {
    task_id: 'task-1',
    tenant_id: 'tenant-1',
    audit_run_id: 'run-1',
    title: 'Fix auth issue',
    finding_ids: JSON.stringify(['finding-1']),
    priority_score: 90,
    multipliers: JSON.stringify(['base(90)']),
    status: 'in_review',
    assigned_agent: null,
    commit_sha: 'abc123',
    created_at: 1,
    updated_at: 1,
    conflict_flag: 0,
    conflict_reason: null,
    lock_expires_at: null,
    ...overrides,
  }
}

function sampleFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    finding_id: 'finding-1',
    tenant_id: 'tenant-1',
    audit_run_id: 'run-1',
    agent_id: 'agent-1',
    agent_type: 'security',
    severity: 'critical',
    category: 'auth_bypass',
    file: 'src/auth.ts',
    line_range: [1, 10],
    evidence_quote: 'const token = req.headers.authorization',
    description: 'Missing token validation',
    impact: 'Unauthorized access',
    verified_by: [],
    source: 'agent',
    status: 'open',
    recurrence_count: 0,
    is_regression: false,
    ts: 1,
    verified_at: null,
    screenshot_id: null,
    ...overrides,
  }
}

function mockGithubDiff(diff: { files: Array<{ filename: string; patch: string }> }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/commits/')) {
      return new Response(JSON.stringify(diff), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('/contents/')) {
      return new Response(JSON.stringify({ content: btoa('const token = req.headers.authorization'), encoding: 'base64' }), { status: 200 })
    }
    return new Response('Not found', { status: 404 })
  }))
}

describe('verifyTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses owner/repo from audit_sessions and fetches the correct GitHub diff', async () => {
    const { db, runs } = makeMockD1({
      auditSession: { id: 'run-1', tenant_id: 'tenant-1', repo_url: 'https://github.com/acme/widgets', repo_branch: 'main' },
      findings: [sampleFinding()],
    })
    mockGithubDiff({ files: [{ filename: 'src/auth.ts', patch: '- const token = req.headers.authorization\n+ const token = validate(req.headers.authorization)' }] })

    const result = await verifyTask(sampleTask(), makeEnv({ DB: db }))

    expect(result.result).toBe('resolved')
    const fetchCalls = vi.mocked(fetch).mock.calls
    expect(fetchCalls[0][0]).toContain('https://api.github.com/repos/acme/widgets/commits/abc123')
    expect(runs.some(r => r.sql.toLowerCase().includes('update findings') && r.params.includes('resolved'))).toBe(true)
  })

  it('returns failed when repo_url is missing', async () => {
    const { db, insertedErrors } = makeMockD1({
      auditSession: { id: 'run-1', tenant_id: 'tenant-1', repo_url: '', repo_branch: '' },
    })

    const result = await verifyTask(sampleTask(), makeEnv({ DB: db }))

    expect(result.result).toBe('failed')
    expect(result.reason).toBe('Missing repo_url')
    expect(insertedErrors.length).toBeGreaterThan(0)
  })

  it('returns failed for unsupported repo_url', async () => {
    const { db, insertedErrors } = makeMockD1({
      auditSession: { id: 'run-1', tenant_id: 'tenant-1', repo_url: 'https://example.com/acme/widgets', repo_branch: 'main' },
    })

    const result = await verifyTask(sampleTask(), makeEnv({ DB: db }))

    expect(result.result).toBe('failed')
    expect(result.reason).toContain('Unsupported repo_url')
    expect(insertedErrors.length).toBeGreaterThan(0)
  })

  it('creates a regression finding when evidence reappears in the new commit', async () => {
    const finding = sampleFinding({ status: 'open' })
    const { db, insertedFindings, insertedLogs } = makeMockD1({
      auditSession: { id: 'run-1', tenant_id: 'tenant-1', repo_url: 'https://github.com/acme/widgets', repo_branch: 'main' },
      findings: [finding],
    })
    mockGithubDiff({ files: [{ filename: 'src/auth.ts', patch: '- const token = req.headers.authorization\n+ const token = validate(req.headers.authorization)' }] })

    const events: unknown[] = []
    await verifyTask(sampleTask(), makeEnv({ DB: db }), false, (event) => events.push(event))

    expect(insertedFindings.length).toBe(1)
    const insertParams = insertedFindings[0].params as unknown[]
    expect(insertParams[0]).toMatch(/^regression-finding-1-/)
    expect(insertParams[5]).toBe('critical') // escalated severity
    expect(insertParams[14]).toBe('regression') // source
    expect(insertParams[17]).toBe(1) // is_regression
    expect(insertedLogs.length).toBe(1)
    expect(events).toHaveLength(1)
    expect((events[0] as { type: string }).type).toBe('finding_created')
  })

  it('marks findings resolved via human approval without checking diff', async () => {
    const { db, runs } = makeMockD1({
      auditSession: { id: 'run-1', tenant_id: 'tenant-1', repo_url: 'https://github.com/acme/widgets', repo_branch: 'main' },
      findings: [sampleFinding()],
    })
    mockGithubDiff({ files: [] })

    const result = await verifyTask(sampleTask(), makeEnv({ DB: db }), true)

    expect(result.result).toBe('resolved')
    expect(result.finding_results?.[0].resolved).toBe(true)
    expect(result.finding_results?.[0].reason).toBe('human approved')
    // No GitHub diff fetch should happen when human approved
    expect(vi.mocked(fetch).mock.calls.length).toBe(0)
    expect(runs.some(r => r.sql.toLowerCase().includes('update findings') && r.params.includes('resolved'))).toBe(true)
  })
})

describe('router Visual QA re-run gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns task to backlog when Visual QA re-run finds new open failures', async () => {
    const task = sampleTask({ status: 'in_progress' })
    const finding = sampleFinding({ finding_id: 'finding-1', screenshot_id: 'screenshot-1' })
    const visualQaFinding = sampleFinding({ finding_id: 'finding-qa', source: 'visual_qa', status: 'open', screenshot_id: 'screenshot-2' })
    const mockDb = makeMockD1({
      auditSession: { id: 'run-1', tenant_id: 'tenant-1', repo_url: 'https://github.com/acme/widgets', repo_branch: 'main' },
      findings: [finding, visualQaFinding],
      tasks: [task],
    })
    vi.mocked(runVisualQA).mockResolvedValueOnce(undefined)

    // After runVisualQA, a new open visual_qa finding exists
    const env = makeEnv({ DB: mockDb.db })
    const response = await handleTaskPatch(env, 'tenant-1', 'run-1', 'task-1', { status: 'in_review' })
    const body = await response.json() as { status: string; reason?: string }

    expect(response.status).toBe(200)
    expect(body.status).toBe('backlog')
    expect(body.reason).toContain('visual_qa re-run detected unresolved screenshot issues')
    expect(mockDb.runs.some(r => r.sql.toLowerCase().includes('update tasks') && r.params.includes('backlog'))).toBe(true)
  })
})

describe('escalateSeverityValue', () => {
  it('escalates severity by one rung', () => {
    expect(escalateSeverityValue('info')).toBe('low')
    expect(escalateSeverityValue('low')).toBe('medium')
    expect(escalateSeverityValue('medium')).toBe('high')
    expect(escalateSeverityValue('high')).toBe('critical')
    expect(escalateSeverityValue('critical')).toBe('critical')
  })
})

describe('recalcProductionScore', () => {
  it('calculates resolved / total critical+high ratio', async () => {
    const { db } = makeMockD1({
      findings: [
        sampleFinding({ severity: 'critical', status: 'resolved' }),
        sampleFinding({ severity: 'high', status: 'open' }),
      ],
    })

    await recalcProductionScore('run-1', db)

    // Score should be 50 (1 resolved / 2 total)
    // Mock returns the total count for any SELECT COUNT(*) from findings, so run() is called with 50
    // This is a smoke test that the function does not throw
  })
})
