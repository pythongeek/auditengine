import { describe, it, expect } from 'vitest'
import { routeToModel, applyBudgetOverride, getRoutingConfig, type RouteDecision } from '../src/lib/model-router'
import type { TaskType, AgentType } from '../src/types/index'

describe('model-router', () => {
  describe('getRoutingConfig', () => {
    it('routes deep_audit for architecture to kimi-k3 with 200K budget', () => {
      const decision = getRoutingConfig('deep_audit', 'architecture', 0)
      expect(decision).toEqual({
        model: 'kimi-k3',
        provider: 'kimi',
        maxTokens: 200_000,
        budget: 200_000,
        taskType: 'deep_audit',
      })
    })

    it('routes deep_audit for security to kimi-k3 with 150K budget', () => {
      const decision = getRoutingConfig('deep_audit', 'security', 0)
      expect(decision).toEqual({
        model: 'kimi-k3',
        provider: 'kimi',
        maxTokens: 150_000,
        budget: 150_000,
        taskType: 'deep_audit',
      })
    })

    it('routes deep_audit for api to kimi-k2.6 with 80K budget', () => {
      const decision = getRoutingConfig('deep_audit', 'api', 0)
      expect(decision).toEqual({
        model: 'kimi-k2.6',
        provider: 'kimi',
        maxTokens: 80_000,
        budget: 80_000,
        taskType: 'deep_audit',
      })
    })

    it('routes deep_audit for database to kimi-k2.6 with 60K budget', () => {
      const decision = getRoutingConfig('deep_audit', 'database', 0)
      expect(decision).toEqual({
        model: 'kimi-k2.6',
        provider: 'kimi',
        maxTokens: 60_000,
        budget: 60_000,
        taskType: 'deep_audit',
      })
    })

    it('routes deep_audit for other agents to kimi-k2.6 with 60K budget', () => {
      const decision = getRoutingConfig('deep_audit', 'frontend', 0)
      expect(decision).toEqual({
        model: 'kimi-k2.6',
        provider: 'kimi',
        maxTokens: 60_000,
        budget: 60_000,
        taskType: 'deep_audit',
      })
    })

    it('routes salvation_research to kimi-k3 with 80K budget', () => {
      const decision = getRoutingConfig('salvation_research', 'security', 0)
      expect(decision).toEqual({
        model: 'kimi-k3',
        provider: 'kimi',
        maxTokens: 80_000,
        budget: 80_000,
        taskType: 'salvation_research',
      })
    })

    it('routes verification to kimi-k2.6 with 40K budget', () => {
      const decision = getRoutingConfig('verification', 'security', 0)
      expect(decision).toEqual({
        model: 'kimi-k2.6',
        provider: 'kimi',
        maxTokens: 40_000,
        budget: 40_000,
        taskType: 'verification',
      })
    })

    it('routes gate_retry to minimax-m3 with 8K budget', () => {
      const decision = getRoutingConfig('gate_retry', 'security', 0)
      expect(decision).toEqual({
        model: 'minimax-m3',
        provider: 'minimax',
        maxTokens: 8_000,
        budget: 8_000,
        taskType: 'gate_retry',
      })
    })

    it('routes dedup to minimax-m3 with 12K budget', () => {
      const decision = getRoutingConfig('dedup', 'security', 0)
      expect(decision).toEqual({
        model: 'minimax-m3',
        provider: 'minimax',
        maxTokens: 12_000,
        budget: 12_000,
        taskType: 'dedup',
      })
    })

    it('routes task_description to minimax-m3 with 6K budget', () => {
      const decision = getRoutingConfig('task_description', 'security', 0)
      expect(decision).toEqual({
        model: 'minimax-m3',
        provider: 'minimax',
        maxTokens: 6_000,
        budget: 6_000,
        taskType: 'task_description',
      })
    })

    it('routes visual_qa_script to minimax-m3 with 16K budget', () => {
      const decision = getRoutingConfig('visual_qa_script', 'visual_qa', 0)
      expect(decision).toEqual({
        model: 'minimax-m3',
        provider: 'minimax',
        maxTokens: 16_000,
        budget: 16_000,
        taskType: 'visual_qa_script',
      })
    })

    it('routes log_summary to minimax-m3 with 10K budget', () => {
      const decision = getRoutingConfig('log_summary', 'logging', 0)
      expect(decision).toEqual({
        model: 'minimax-m3',
        provider: 'minimax',
        maxTokens: 10_000,
        budget: 10_000,
        taskType: 'log_summary',
      })
    })

    it('routes fallback to minimax-m3 with 20K budget', () => {
      const decision = getRoutingConfig('fallback' as TaskType, 'security', 0)
      expect(decision).toEqual({
        model: 'minimax-m3',
        provider: 'minimax',
        maxTokens: 20_000,
        budget: 20_000,
        taskType: 'fallback',
      })
    })

    it('overrides any task to kimi-k2.6 130K when input exceeds 100K tokens', () => {
      const decision = getRoutingConfig('deep_audit', 'architecture', 120_000)
      expect(decision).toEqual({
        model: 'kimi-k2.6',
        provider: 'kimi',
        maxTokens: 130_000,
        budget: 130_000,
        taskType: 'deep_audit',
      })
    })
  })

  describe('routeToModel', () => {
    it('honors agent_config model override', () => {
      const decision = routeToModel('deep_audit', { model_name: 'minimax-m3' }, 'security', 0)
      expect(decision.model).toBe('minimax-m3')
      expect(decision.provider).toBe('minimax')
    })

    it('ignores invalid agent_config model names', () => {
      const decision = routeToModel('deep_audit', { model_name: 'gpt-4o' }, 'security', 0)
      expect(decision.model).toBe('kimi-k3')
    })

    it('honors agent_config max_tokens override', () => {
      const decision = routeToModel('deep_audit', { max_tokens: 2048 }, 'security', 0)
      expect(decision.maxTokens).toBe(2048)
      expect(decision.budget).toBe(2048)
    })
  })

  describe('applyBudgetOverride', () => {
    it('downgrades kimi-k3 at 80% spend', () => {
      const decision: RouteDecision = {
        model: 'kimi-k3',
        provider: 'kimi',
        maxTokens: 150_000,
        budget: 150_000,
        taskType: 'deep_audit',
      }
      const result = applyBudgetOverride(decision, 0.82)
      expect(result.model).toBe('kimi-k2.6')
      expect(result.provider).toBe('kimi')
    })

    it('does NOT downgrade salvation_research', () => {
      const decision = getRoutingConfig('salvation_research', 'security', 0)
      const result = applyBudgetOverride(decision, 0.90)
      expect(result.model).toBe('kimi-k3')
    })

    it('does NOT downgrade trace_analysis', () => {
      const decision = getRoutingConfig('trace_analysis', 'security', 0)
      const result = applyBudgetOverride(decision, 0.90)
      expect(result.model).toBe('minimax-m3')
    })

    it('does not trigger below 80%', () => {
      const decision: RouteDecision = {
        model: 'kimi-k3',
        provider: 'kimi',
        maxTokens: 150_000,
        budget: 150_000,
        taskType: 'deep_audit',
      }
      const result = applyBudgetOverride(decision, 0.75)
      expect(result.model).toBe('kimi-k3')
    })
  })
})
