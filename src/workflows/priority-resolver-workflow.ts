import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import type { Env } from '../types/index'
import { runPriorityResolver } from '../workers/priority-resolver'
import { generatePlansForRun } from '../workers/planner'

export class PriorityResolverWorkflow extends WorkflowEntrypoint<Env, { auditRunId: string }> {
  async run(event: Readonly<WorkflowEvent<{ auditRunId: string }>>, step: WorkflowStep): Promise<void> {
    const { auditRunId } = event.payload

    await step.do('resolve-priorities', async () => {
      await runPriorityResolver(auditRunId, this.env)
    })

    // Generate AI remediation plans for the freshly created tasks (top 20 by
    // priority). Plan failures are isolated per task and never block the audit.
    await step.do('generate-remediation-plans', async () => {
      await generatePlansForRun(auditRunId, this.env)
    })
  }
}
