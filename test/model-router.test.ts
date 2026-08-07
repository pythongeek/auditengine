import { describe, it, expect } from 'vitest'
import { routeToModel, applyBudgetOverride } from '../src/lib/model-router'
import type { RouteDecision, TaskType } from '../src/types/index'

describe('model-router', () => {
  it('routes deep_audit to kimi-k3', () => {
    const decision = routeToModel('deep_audit' as TaskType)
    expect(decision).toEqual({ model: 'kimi-k3', provider: 'kimi', maxTokens: 100000, taskType: 'deep_audit' })
  })

  it('routes visual_qa_script to minimax-m3', () => {
    const decision = routeToModel('visual_qa_script' as TaskType)
    expect(decision).toEqual({ model: 'minimax-m3', provider: 'minimax', maxTokens: 8000, taskType: 'visual_qa_script' })
  })

  it('applyBudgetOverride downgrades at 80%', () => {
    const decision: RouteDecision = { model: 'kimi-k3', provider: 'kimi', maxTokens: 100000, taskType: 'deep_audit' }
    const result = applyBudgetOverride(decision, 0.82)
    expect(result.model).toBe('kimi-k2.6')
  })

  it('applyBudgetOverride does NOT downgrade salvation_research', () => {
    const decision = routeToModel('salvation_research' as TaskType)
    expect(decision.model).toBe('kimi-k3')
    const result = applyBudgetOverride(decision, 0.90)
    expect(result.model).toBe('kimi-k3')
  })

  it('applyBudgetOverride does not trigger below 80%', () => {
    const decision: RouteDecision = { model: 'kimi-k3', provider: 'kimi', maxTokens: 100000, taskType: 'deep_audit' }
    const result = applyBudgetOverride(decision, 0.75)
    expect(result.model).toBe('kimi-k3')
  })
})
