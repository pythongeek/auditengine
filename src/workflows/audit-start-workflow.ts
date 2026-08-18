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
}

export class AuditStartWorkflow extends WorkflowEntrypoint<Env, AuditStartPayload> {
  async run(event: Readonly<WorkflowEvent<AuditStartPayload>>, step: WorkflowStep): Promise<void> {
    const { audit_run_id, tenant_id, files, repo_url, branch, commit_sha, repo_group_id, selected_paths } = event.payload

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

    await step.do('start-coordinator', async () => {
      const coordinatorId = this.env.COORDINATOR_DO.idFromName('coordinator-' + audit_run_id)
      const coordinatorStub = this.env.COORDINATOR_DO.get(coordinatorId)
      await coordinatorStub.fetch(new Request('https://coordinator/start', {
        method: 'POST',
        body: JSON.stringify({ audit_run_id, tenant_id }),
        headers: { 'Content-Type': 'application/json' },
      }))
    })
  }
}
