import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import type { Env } from '../types/index'
import { recalcProductionScore } from '../workers/verification'
import { writeAuditLog } from '../agents/base-agent'

export class ContinuousAuditWorkflow extends WorkflowEntrypoint<Env, { auditRunId: string; tenantId: string }> {
  async run(event: Readonly<WorkflowEvent<{ auditRunId: string; tenantId: string }>>, step: WorkflowStep): Promise<void> {
    const { auditRunId, tenantId } = event.payload

    await step.do('recalculate-production-score', async () => {
      await recalcProductionScore(auditRunId, this.env.DB)
      await writeAuditLog(
        this.env.DB,
        tenantId,
        auditRunId,
        null,
        'continuous_audit_tick',
        { phase: 'score_recalculation' }
      )
    })

    // Phase 6 will add a second step here that fetches the latest Git diff,
    // compares it against stored findings, and creates regression findings.
  }
}
