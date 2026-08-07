import type { Env } from './types/index'
import { AgentDurableObject } from './agents/base-agent'
import { CoordinatorDurableObject } from './workers/coordinator'
import { DashboardDurableObject } from './dashboard/dashboard-do'
import ingestionWorker from './workers/ingestion'
import { DASHBOARD_HTML } from './dashboard/dashboard-html'

export { AgentDurableObject, CoordinatorDurableObject, DashboardDurableObject }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Route: POST /ingest → ingestion worker
    if (url.pathname === '/ingest' && request.method === 'POST') {
      return ingestionWorker.fetch(request, env)
    }

    // Route: /dashboard → serve dashboard HTML
    if (url.pathname === '/dashboard') {
      return new Response(DASHBOARD_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // Route: /dashboard/ws → WebSocket upgrade to Dashboard DO
    if (url.pathname === '/dashboard/ws') {
      const auditRunId = url.searchParams.get('audit_run_id')
      if (!auditRunId) {
        return new Response('Missing audit_run_id', { status: 400 })
      }
      const id = env.DASHBOARD_DO.idFromName('dashboard-' + auditRunId)
      const stub = env.DASHBOARD_DO.get(id)
      return stub.fetch(request)
    }

    // Route: POST /audit/start → create audit run, boot coordinator
    if (url.pathname === '/audit/start' && request.method === 'POST') {
      let body: { audit_run_id?: string; files?: Array<{ path: string; content: string }> }
      try {
        body = await request.json() as typeof body
      } catch {
        return new Response('Invalid JSON', { status: 400 })
      }

      if (!body.audit_run_id || !Array.isArray(body.files)) {
        return new Response('Missing audit_run_id or files', { status: 400 })
      }

      // Run ingestion first
      const ingestRequest = new Request(request.url.replace('/audit/start', '/ingest'), {
        method: 'POST',
        body: JSON.stringify({ audit_run_id: body.audit_run_id, files: body.files }),
        headers: { 'Content-Type': 'application/json' },
      })
      const ingestResponse = await ingestionWorker.fetch(ingestRequest, env)
      if (!ingestResponse.ok) {
        return new Response('Ingestion failed', { status: 500 })
      }

      // Boot coordinator DO
      const coordinatorId = env.COORDINATOR_DO.idFromName('coordinator-' + body.audit_run_id)
      const coordinatorStub = env.COORDINATOR_DO.get(coordinatorId)
      await coordinatorStub.fetch(new Request('https://coordinator/start', {
        method: 'POST',
        body: JSON.stringify({ audit_run_id: body.audit_run_id }),
        headers: { 'Content-Type': 'application/json' },
      }))

      return new Response(JSON.stringify({
        audit_run_id: body.audit_run_id,
        status: 'started',
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('AuditEngine v1.0', { status: 200 })
  },
}
