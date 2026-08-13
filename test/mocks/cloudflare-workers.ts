export class DurableObject<T = unknown> {
  ctx: T
  env: T
  constructor(state: unknown, env: T) {
    this.ctx = state as T
    this.env = env
  }
}

export abstract class WorkflowEntrypoint<Env = unknown, Params = unknown> {
  protected ctx: unknown
  protected env: Env
  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx
    this.env = env
  }
  abstract run(event: Readonly<{ payload: Params }>, step: unknown): Promise<unknown>
}
