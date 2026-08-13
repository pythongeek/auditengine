import type { TaskType, Model, Provider, AgentConfig } from '../types/index'

export interface RouteDecision {
  model:     Model
  provider:  Provider
  maxTokens: number
  taskType?: TaskType // required to enforce budget override exceptions
}

// 13 routing rules — exact mappings from spec
const TASK_ROUTE_MAP: Record<TaskType, RouteDecision> = {
  deep_audit:          { model: 'kimi-k3',    provider: 'kimi',    maxTokens: 100_000, taskType: 'deep_audit' },
  simple_analysis:     { model: 'kimi-k2.6',  provider: 'kimi',    maxTokens: 32_000,  taskType: 'simple_analysis' },
  cross_read_summary:  { model: 'kimi-k2.6',  provider: 'kimi',    maxTokens: 16_000,  taskType: 'cross_read_summary' },
  salvation_research:  { model: 'kimi-k3',    provider: 'kimi',    maxTokens: 32_000,  taskType: 'salvation_research' },
  visual_qa_script:    { model: 'minimax-m3', provider: 'minimax', maxTokens: 8_000,   taskType: 'visual_qa_script' },
  verification:        { model: 'kimi-k2.6',  provider: 'kimi',    maxTokens: 32_000,  taskType: 'verification' },
  trace_analysis:      { model: 'kimi-k3',    provider: 'kimi',    maxTokens: 64_000,  taskType: 'trace_analysis' },
  conflict_resolution: { model: 'kimi-k3',    provider: 'kimi',    maxTokens: 32_000,  taskType: 'conflict_resolution' },
}

const VALID_MODELS = new Set<Model>(['kimi-k3', 'kimi-k2.6', 'minimax-m3'])

export function routeToModel(
  taskType: TaskType,
  agentConfig?: Partial<AgentConfig>,
  fileLineCount?: number
): RouteDecision {
  const decision = { ...(TASK_ROUTE_MAP[taskType] ?? { model: 'kimi-k2.6', provider: 'kimi', maxTokens: 16_000, taskType }) }

  // Agent config can override model and max_tokens if the model is permitted
  const configModel = agentConfig?.model_name as Model | undefined
  if (configModel && VALID_MODELS.has(configModel)) {
    const provider: Provider = configModel.startsWith('kimi') ? 'kimi' : 'minimax'
    decision.model = configModel
    decision.provider = provider
  }

  if (agentConfig?.max_tokens) {
    decision.maxTokens = agentConfig.max_tokens
  }

  // Override: large files for deep_audit keep max tokens
  if (taskType === 'deep_audit' && typeof fileLineCount === 'number' && fileLineCount > 400) {
    return { ...decision, maxTokens: 100_000 }
  }

  return decision
}

export function applyBudgetOverride(decision: RouteDecision, spentPct: number): RouteDecision {
  // Never downgrade salvation_research or trace_analysis
  if (decision.taskType === 'salvation_research' || decision.taskType === 'trace_analysis') {
    return decision
  }

  if (spentPct >= 0.80 && decision.model === 'kimi-k3') {
    return { ...decision, model: 'kimi-k2.6', provider: 'kimi' }
  }

  return decision
}
