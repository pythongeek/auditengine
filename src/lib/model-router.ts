import type { TaskType, Model, Provider, AgentConfig, AgentType } from '../types/index'

export interface RouteDecision {
  model:     Model
  provider:  Provider
  maxTokens: number
  budget:    number
  taskType?: TaskType
}

const VALID_MODELS = new Set<Model>(['kimi-k3', 'kimi-k2.6', 'minimax-m3'])

/**
 * Pure routing decision based on the documented Build-Guide rules.
 * Returns the provider, model, per-call max completion tokens, and total
 * call budget (input + output) for the given task type, agent type, and
 * estimated input token count.
 */
export function getRoutingConfig(
  taskType: TaskType,
  agentType: AgentType,
  inputTokenCount: number
): RouteDecision {
  // Size override: any input over 100K tokens is forced to Kimi K2.6 130K.
  if (inputTokenCount > 100_000) {
    return {
      model: 'kimi-k2.6',
      provider: 'kimi',
      maxTokens: 130_000,
      budget: 130_000,
      taskType,
    }
  }

  switch (taskType) {
    case 'deep_audit': {
      if (agentType === 'architecture') {
        return { model: 'kimi-k3', provider: 'kimi', maxTokens: 200_000, budget: 200_000, taskType }
      }
      if (agentType === 'security') {
        return { model: 'kimi-k3', provider: 'kimi', maxTokens: 150_000, budget: 150_000, taskType }
      }
      if (agentType === 'api') {
        return { model: 'kimi-k2.6', provider: 'kimi', maxTokens: 80_000, budget: 80_000, taskType }
      }
      if (agentType === 'database') {
        return { model: 'kimi-k2.6', provider: 'kimi', maxTokens: 60_000, budget: 60_000, taskType }
      }
      // Default for any other deep_audit specialist: K2.6 with a 60K budget.
      return { model: 'kimi-k2.6', provider: 'kimi', maxTokens: 60_000, budget: 60_000, taskType }
    }

    case 'salvation_research':
      return { model: 'kimi-k3', provider: 'kimi', maxTokens: 80_000, budget: 80_000, taskType }

    case 'verification':
      return { model: 'kimi-k2.6', provider: 'kimi', maxTokens: 40_000, budget: 40_000, taskType }

    case 'gate_retry':
      return { model: 'minimax-m3', provider: 'minimax', maxTokens: 8_000, budget: 8_000, taskType }

    case 'dedup':
      return { model: 'minimax-m3', provider: 'minimax', maxTokens: 12_000, budget: 12_000, taskType }

    case 'task_description':
      return { model: 'minimax-m3', provider: 'minimax', maxTokens: 6_000, budget: 6_000, taskType }

    case 'remediation_plan':
      return { model: 'kimi-k2.6', provider: 'kimi', maxTokens: 20_000, budget: 20_000, taskType }

    case 'code_fix':
      return { model: 'kimi-k2.6', provider: 'kimi', maxTokens: 60_000, budget: 60_000, taskType }

    case 'qa_script_gen':
    case 'visual_qa_script':
      return { model: 'minimax-m3', provider: 'minimax', maxTokens: 16_000, budget: 16_000, taskType }

    case 'log_summary':
      return { model: 'minimax-m3', provider: 'minimax', maxTokens: 10_000, budget: 10_000, taskType }

    case 'simple_analysis':
    case 'cross_read_summary':
    case 'trace_analysis':
    case 'conflict_resolution':
    case 'fallback':
    default:
      return { model: 'minimax-m3', provider: 'minimax', maxTokens: 20_000, budget: 20_000, taskType }
  }
}

export function routeToModel(
  taskType: TaskType,
  agentConfig?: Partial<AgentConfig>,
  agentType?: AgentType,
  inputTokenCount?: number
): RouteDecision {
  const decision = getRoutingConfig(
    taskType,
    agentType ?? 'security',
    inputTokenCount ?? 0
  )

  // Agent config can override model and max_tokens if the model is permitted
  const configModel = agentConfig?.model_name as Model | undefined
  if (configModel && VALID_MODELS.has(configModel)) {
    const provider: Provider = configModel.startsWith('kimi') ? 'kimi' : 'minimax'
    decision.model = configModel
    decision.provider = provider
  }

  if (agentConfig?.max_tokens) {
    decision.maxTokens = agentConfig.max_tokens
    decision.budget = agentConfig.max_tokens
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
