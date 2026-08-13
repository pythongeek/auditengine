import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import type { Env } from '../types/index'
import { runPriorityResolver } from '../workers/priority-resolver'

export class PriorityResolverWorkflow extends WorkflowEntrypoint<Env, { auditRunId: string }> {
  async run(event: Readonly<WorkflowEvent<{ auditRunId: string }>>, step: WorkflowStep): Promise<void> {
    const { auditRunId } = event.payload

    await step.do('resolve-priorities', async () => {
      await runPriorityResolver(auditRunId, this.env)
    })
  }
}
