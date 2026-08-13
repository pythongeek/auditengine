import { DurableObject } from 'cloudflare:workers'
import type { Env, KnowledgeLedgerEntry } from '../types/index'

interface WriteRequest {
  tenant_id: string
  audit_run_id: string
  agent_id: string
  agent_type: string
  file_path: string
  finding_id: string | null
  knowledge_type: string
  content: string
}

interface ReadRequest {
  tenant_id: string
  audit_run_id: string
  file_path?: string
  agent_id?: string
}

export class SharedMemoryDurableObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const url = new URL(request.url)
    const body = await request.json() as WriteRequest | ReadRequest

    if (url.pathname === '/write') {
      return this.handleWrite(body as WriteRequest)
    }

    if (url.pathname === '/read') {
      return this.handleRead(body as ReadRequest)
    }

    return new Response('Not found', { status: 404 })
  }

  private async handleWrite(req: WriteRequest): Promise<Response> {
    const id = crypto.randomUUID()
    await this.env.DB
      .prepare(`
        INSERT INTO knowledge_ledger (
          id, tenant_id, audit_run_id, agent_id, agent_type, file_path,
          finding_id, knowledge_type, content, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `)
      .bind(
        id,
        req.tenant_id,
        req.audit_run_id,
        req.agent_id,
        req.agent_type,
        req.file_path,
        req.finding_id,
        req.knowledge_type,
        req.content
      )
      .run()

    return new Response(JSON.stringify({ ok: true, id }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  private async handleRead(req: ReadRequest): Promise<Response> {
    let sql = `
      SELECT id, tenant_id, audit_run_id, agent_id, agent_type, file_path,
             finding_id, knowledge_type, content, created_at
      FROM knowledge_ledger
      WHERE tenant_id = ? AND audit_run_id = ?
    `
    const params: (string | number)[] = [req.tenant_id, req.audit_run_id]

    if (req.file_path) {
      sql += ' AND file_path = ?'
      params.push(req.file_path)
    }

    if (req.agent_id) {
      sql += ' AND agent_id != ?'
      params.push(req.agent_id)
    }

    sql += ' ORDER BY created_at DESC LIMIT 200'

    const rows = await this.env.DB.prepare(sql).bind(...params).all<KnowledgeLedgerEntry>()

    return new Response(JSON.stringify({ entries: rows.results ?? [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
