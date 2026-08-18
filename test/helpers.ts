import type { GateContext, Env } from '../src/types/index'

export function makeMockAgentNamespaces(): Pick<Env,
  'AGENT_DO' | 'SECURITY_AGENT_DO' | 'API_AGENT_DO' | 'FRONTEND_AGENT_DO' | 'DATABASE_AGENT_DO' |
  'ARCHITECTURE_AGENT_DO' | 'TESTING_AGENT_DO' | 'PERFORMANCE_AGENT_DO' | 'DEVOPS_AGENT_DO' |
  'DOCUMENTATION_AGENT_DO' | 'VISUAL_QA_AGENT_DO' | 'BACKEND_AGENT_DO' | 'DEPENDENCY_AGENT_DO' |
  'A11Y_AGENT_DO' | 'I18N_AGENT_DO' | 'LOGGING_AGENT_DO' | 'CODE_QUALITY_AGENT_DO' |
  'ERROR_HANDLING_AGENT_DO' | 'CONFIGURATION_AGENT_DO' | 'REFACTORING_AGENT_DO' | 'SHARED_MEMORY_DO'
> {
  const ns = {} as DurableObjectNamespace
  return {
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
  }
}

export function makeMockWorkflows(): Pick<Env,
  'PRIORITY_RESOLVER_WORKFLOW' | 'SALVATION_WORKFLOW' | 'CONTINUOUS_AUDIT_WORKFLOW' | 'AUDIT_START_WORKFLOW'
> {
  const create = async () => Promise.resolve({} as WorkflowInstance)
  return {
    PRIORITY_RESOLVER_WORKFLOW: { create } as unknown as Workflow,
    SALVATION_WORKFLOW: { create } as unknown as Workflow,
    CONTINUOUS_AUDIT_WORKFLOW: { create } as unknown as Workflow,
    AUDIT_START_WORKFLOW: { create } as unknown as Workflow,
  }
}

export function mockD1(
  findingExists = false,
  options: { fileExists?: boolean } = {}
): D1Database {
  const fileExists = options.fileExists ?? true
  return {
    prepare: (sql: string) => ({
      bind: () => ({
        first: () => {
          const lower = sql.toLowerCase()
          if (lower.includes('from files')) {
            return Promise.resolve(fileExists ? { '1': 1 } : null)
          }
          return Promise.resolve(findingExists ? { finding_id: 'F-0001' } : null)
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

export function makeMockR2(content = 'const token = req.headers.authorization'): R2Bucket {
  return {
    get: () => Promise.resolve({
      key: 'test-key',
      text: () => Promise.resolve(content),
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(content).buffer),
    } as unknown as R2ObjectBody),
    put: () => Promise.resolve({} as unknown as R2Object),
    list: () => Promise.resolve({ objects: [], truncated: false, cursor: '' } as unknown as R2Objects),
    delete: () => Promise.resolve(),
  } as unknown as R2Bucket
}

export function makeGateContext(overrides: Partial<GateContext> = {}): GateContext {
  const content = overrides.currentFileContent ?? 'const token = req.headers.authorization'
  return {
    agentId: 'agent-001',
    agentType: 'security',
    auditRunId: 'run-001',
    tenantId: 'tenant-1',
    currentFile: 'src/auth.ts',
    currentFileContent: content,
    r2: overrides.r2 ?? makeMockR2(content),
    claimLog: new Set(),
    ...overrides,
  }
}

export function makeMockEnvStrings(
  overrides: Partial<Pick<Env,
    | 'KIMI_API_KEY' | 'MINIMAX_API_KEY' | 'GITHUB_TOKEN'
    | 'GITHUB_CLIENT_ID' | 'GITHUB_CLIENT_SECRET' | 'GITHUB_WEBHOOK_SECRET'
    | 'GITLAB_TOKEN' | 'GITLAB_CLIENT_ID' | 'GITLAB_CLIENT_SECRET' | 'GITLAB_WEBHOOK_SECRET'
    | 'BITBUCKET_TOKEN' | 'BITBUCKET_CLIENT_ID' | 'BITBUCKET_CLIENT_SECRET' | 'BITBUCKET_WEBHOOK_SECRET'
    | 'ENCRYPTION_KEY' | 'JWT_SECRET' | 'STAGING_URL'
    | 'ADMIN_EMAIL' | 'ADMIN_PASSWORD' | 'SEARCH_API_KEY' | 'SEARCH_PROVIDER'
  >> = {}
): Pick<Env,
  | 'KIMI_API_KEY' | 'MINIMAX_API_KEY' | 'GITHUB_TOKEN'
  | 'GITHUB_CLIENT_ID' | 'GITHUB_CLIENT_SECRET' | 'GITHUB_WEBHOOK_SECRET'
  | 'GITLAB_TOKEN' | 'GITLAB_CLIENT_ID' | 'GITLAB_CLIENT_SECRET' | 'GITLAB_WEBHOOK_SECRET'
  | 'BITBUCKET_TOKEN' | 'BITBUCKET_CLIENT_ID' | 'BITBUCKET_CLIENT_SECRET' | 'BITBUCKET_WEBHOOK_SECRET'
  | 'ENCRYPTION_KEY' | 'JWT_SECRET' | 'STAGING_URL'
  | 'ADMIN_EMAIL' | 'ADMIN_PASSWORD' | 'SEARCH_API_KEY' | 'SEARCH_PROVIDER'
> {
  return {
    KIMI_API_KEY: '',
    MINIMAX_API_KEY: '',
    GITHUB_TOKEN: '',
    GITHUB_CLIENT_ID: '',
    GITHUB_CLIENT_SECRET: '',
    GITHUB_WEBHOOK_SECRET: '',
    GITLAB_TOKEN: '',
    GITLAB_CLIENT_ID: '',
    GITLAB_CLIENT_SECRET: '',
    GITLAB_WEBHOOK_SECRET: '',
    BITBUCKET_TOKEN: '',
    BITBUCKET_CLIENT_ID: '',
    BITBUCKET_CLIENT_SECRET: '',
    BITBUCKET_WEBHOOK_SECRET: '',
    ENCRYPTION_KEY: '',
    JWT_SECRET: 'test-secret',
    STAGING_URL: '',
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD: '',
    SEARCH_API_KEY: '',
    SEARCH_PROVIDER: 'brave',
    ...overrides,
  }
}
