import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import type { Env, AgentPersistentState } from '../types/index'
import { runSalvationProtocol } from '../workers/salvation'

export class SalvationWorkflow extends WorkflowEntrypoint<Env, AgentPersistentState> {
  async run(event: Readonly<WorkflowEvent<AgentPersistentState>>, step: WorkflowStep): Promise<void> {
    const state = event.payload

    await step.do('salvation-research', async () => {
      await runSalvationProtocol(state, this.env)
    })
  }
}
