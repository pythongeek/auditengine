import { describe, it, expect } from 'vitest'
import { scanFiles, auditProject } from '../scripts/security-audit'

describe('security-audit script', () => {
  it('flags a direct provider fetch outside the LLM gateway', () => {
    const report = scanFiles([{
      path: 'src/agents/bad-agent.ts',
      content: "const res = await fetch('https://api.moonshot.cn/v1/chat/completions', { method: 'POST' })",
    }])
    expect(report.ok).toBe(false)
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0].category).toBe('direct_provider_fetch')
    expect(report.findings[0].file).toBe('src/agents/bad-agent.ts')
  })

  it('does not flag LLM endpoint strings inside src/lib/llm-gateway.ts', () => {
    const report = scanFiles([{
      path: 'src/lib/llm-gateway.ts',
      content: 'const ENDPOINTS = { "kimi-k3": "https://api.moonshot.cn/v1/chat/completions" }',
    }])
    expect(report.ok).toBe(true)
    expect(report.findings).toHaveLength(0)
  })

  it('flags hardcoded high-entropy secrets', () => {
    const report = scanFiles([{
      path: 'src/lib/bad-config.ts',
      content: "const api_key = 'sk_live_1234567890abcdef1234567890abcdef'",
    }])
    expect(report.ok).toBe(false)
    expect(report.findings.some(f => f.category === 'hardcoded_secret')).toBe(true)
  })

  it('does not flag env-variable secret references', () => {
    const report = scanFiles([{
      path: 'src/lib/router.ts',
      content: 'const token = env.GITHUB_TOKEN\nconst client_secret = process.env.GITHUB_CLIENT_SECRET',
    }])
    expect(report.findings).toHaveLength(0)
  })

  it('flags a protected route that bypasses authentication', () => {
    const content = `
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/v1/tenants' && request.method === 'GET') {
      return handleTenantList(env)
    }
    return new Response('ok')
  },
  async queue(batch: MessageBatch<QueuedWriteRequest>, env: Env): Promise<void> {}
}
`
    const report = scanFiles([{ path: 'src/index.ts', content }])
    expect(report.ok).toBe(false)
    expect(report.findings[0].category).toBe('missing_auth')
  })

  it('does not flag public routes or routes using handleProtectedRoute', () => {
    const content = `
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/' && request.method === 'GET') return handleHome()
    if (url.pathname === '/auth/github/callback' && request.method === 'GET') return handleGitHubOAuthCallback(request, env)
    if (url.pathname === '/api/v1/tenants' && request.method === 'GET') {
      const admin = await isAdmin(request, env)
      if (!admin) return errorResponse('Admin credentials required', 401)
      return handleTenantList(env)
    }
    if (url.pathname === '/ingest' && request.method === 'POST') {
      return handleProtectedRoute(request, env, null)
    }
    const auditsMatch = url.pathname.match(/^\\/api\\/v1\\/tenants\\/([^/]+)\\/audits$/)
    if (auditsMatch && request.method === 'GET') {
      return handleProtectedRoute(request, env, auditsMatch[1])
    }
    return new Response('ok')
  },
  async queue(batch: MessageBatch<QueuedWriteRequest>, env: Env): Promise<void> {}
}
`
    const report = scanFiles([{ path: 'src/index.ts', content }])
    expect(report.ok).toBe(true)
    expect(report.findings).toHaveLength(0)
  })

  it('reports no issues in the current src tree', async () => {
    const report = await auditProject('src')
    expect(report.findings).toHaveLength(0)
  }, 10000)
})
