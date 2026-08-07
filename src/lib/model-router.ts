import type { TaskType, Model, Provider } from '../types/index'

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

export function routeToModel(taskType: TaskType, fileLineCount?: number): RouteDecision {
  const decision = TASK_ROUTE_MAP[taskType] ?? { model: 'kimi-k2.6', provider: 'kimi', maxTokens: 16_000, taskType }

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
