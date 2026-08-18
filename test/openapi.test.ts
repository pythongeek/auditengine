import { describe, it, expect } from 'vitest'
import worker from '../src/index'
import { getOpenApiSpec } from '../src/lib/openapi'
import type { Env } from '../src/types/index'
import { makeMockAgentNamespaces, makeMockWorkflows, makeMockEnvStrings } from './helpers'

describe('OpenAPI spec', () => {
  it('serves the spec at /api/v1/openapi.json', async () => {
    const env: Env = {
      DB: {} as D1Database,
      R2: {} as R2Bucket,
      ...makeMockAgentNamespaces(),
      COORDINATOR_DO: {} as DurableObjectNamespace,
      DASHBOARD_DO: {} as DurableObjectNamespace,
      RATE_LIMIT_DO: {} as DurableObjectNamespace,
      ...makeMockWorkflows(),
      WRITE_QUEUE: {} as Queue,
      BROWSER: {} as Fetcher,
      ...makeMockEnvStrings(),
    } as Env

    const request = new Request('https://localhost/api/v1/openapi.json')
    const response = await (worker as { fetch: (req: Request, env: Env) => Promise<Response> }).fetch(request, env)
    const body = await response.json() as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body.openapi).toBe('3.1.0')
    expect(body.info).toMatchObject({ title: 'AuditEngine API', version: '1.0.0' })
    const paths = Object.keys(body.paths as Record<string, unknown>)
    expect(paths).toContain('/ingest')
    expect(paths).toContain('/audit/start')
    expect(paths).toContain('/api/v1/tenants')
  })

  it('describes only known router paths', () => {
    const spec = getOpenApiSpec()
    const paths = Object.keys(spec.paths as Record<string, unknown>)
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) {
      expect(path.startsWith('/')).toBe(true)
      const operations = (spec.paths as Record<string, Record<string, unknown>>)[path]
      expect(Object.keys(operations).length).toBeGreaterThan(0)
    }
  })
})
