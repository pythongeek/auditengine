import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import type { Env } from '../types/index'
import ingestionWorker from '../workers/ingestion'

interface AuditStartPayload {
  audit_run_id: string
  tenant_id: string
  files?: Array<{ path: string; content: string }>
  repo_url?: string
  branch?: string
  commit_sha?: string
  repo_group_id?: string
  selected_paths?: string[]
  github_token_override?: string
}

async function markAuditFailed(
  env: Env,
  tenantId: string,
  auditRunId: string,
  reason: string,
  phase: string
): Promise<void> {
  try {
    // Ensure the session row exists before updating it, because ingestion may
    // have failed before it created the row.
    await env.DB.prepare(`
      INSERT OR IGNORE INTO audit_sessions (
        id, tenant_id, status, total_files, repo_url, repo_branch, last_commit_sha, created_at
      ) VALUES (?, ?, 'failed', 0, '', 'main', NULL, unixepoch())
    `).bind(auditRunId, tenantId).run()

    await env.DB.prepare(`
      UPDATE audit_sessions SET status = 'failed' WHERE id = ? AND tenant_id = ?
    `).bind(auditRunId, tenantId).run()

    await env.DB.prepare(`
      INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      tenantId,
      auditRunId,
      null,
      'workflow_failed',
      JSON.stringify({ phase, reason })
    ).run()

    await env.DB.prepare(`
      INSERT INTO agent_errors (tenant_id, audit_run_id, agent_id, error_type, error_msg, file_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      tenantId,
      auditRunId,
      'audit-start-workflow',
      'workflow_failed',
      reason,
      ''
    ).run()
  } catch {
    // If the D1 write itself fails, swallow it so the original workflow error still propagates.
  }
}

export class AuditStartWorkflow extends WorkflowEntrypoint<Env, AuditStartPayload> {
  async run(event: Readonly<WorkflowEvent<AuditStartPayload>>, step: WorkflowStep): Promise<void> {
    const { audit_run_id, tenant_id, files, repo_url, branch, commit_sha, repo_group_id, selected_paths, github_token_override } = event.payload

    let phase = 'ingestion'
    try {
      await step.do('ingest-files', async () => {
        const ingestRequest = new Request('https://localhost/ingest', {
          method: 'POST',
          body: JSON.stringify({
            audit_run_id,
            files,
            repo_url,
            branch,
            commit_sha,
            repo_group_id,
            selected_paths,
            github_token_override,
          }),
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-Id': tenant_id,
          },
        })

        const ingestResponse = await ingestionWorker.fetch(ingestRequest, this.env)
        if (!ingestResponse.ok) {
          let detail = 'Ingestion failed'
          try {
            const data = await ingestResponse.json() as { error?: string }
            if (data.error) detail = data.error
          } catch {
            // ignore
          }
          throw new Error(detail)
        }
      })

      phase = 'coordinator'
      await step.do('start-coordinator', async () => {
        const coordinatorId = this.env.COORDINATOR_DO.idFromName('coordinator-' + audit_run_id)
        const coordinatorStub = this.env.COORDINATOR_DO.get(coordinatorId)
        await coordinatorStub.fetch(new Request('https://coordinator/start', {
          method: 'POST',
          body: JSON.stringify({ audit_run_id, tenant_id }),
          headers: { 'Content-Type': 'application/json' },
        }))
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Audit workflow failed'
      await markAuditFailed(this.env, tenant_id, audit_run_id, reason, phase)
      throw err
    }
  }
}
