import { describe, it, expect } from 'vitest'
import { getAgentConfig, setAgentConfig, ensureDefaultAgentConfig, listAgentConfigs, ALL_AGENT_TYPES } from '../src/lib/agent-config'

type AgentType = 'security' | 'api' | 'frontend' | 'database' | 'architecture' | 'testing' | 'performance' | 'devops' | 'documentation' | 'visual_qa'

function makeMockD1() {
  const configs: Array<Record<string, unknown>> = []

  const db = {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        first: () => {
          if (sql.toLowerCase().includes('select * from agent_config')) {
            const [tenantId, agentId] = params
            const row = configs.find(c => c.tenant_id === tenantId && c.agent_id === agentId)
            return Promise.resolve(row ?? null)
          }
          return Promise.resolve(null)
        },
        all: () => {
          if (sql.toLowerCase().includes('select * from agent_config')) {
            const [tenantId] = params
            const rows = configs.filter(c => c.tenant_id === tenantId)
            return Promise.resolve({ results: rows })
          }
          return Promise.resolve({ results: [] })
        },
        run: () => {
          if (sql.toLowerCase().includes('insert or ignore into agent_config')) {
            const [
              tenantId, agentId, modelProvider, modelName, temperature, topP,
              maxTokens, evidenceRequired, maxRetries, llmCallsPerMinute
            ] = params
            if (!configs.find(c => c.tenant_id === tenantId && c.agent_id === agentId)) {
              configs.push({
                tenant_id: tenantId,
                agent_id: agentId,
                model_provider: modelProvider,
                model_name: modelName,
                temperature,
                top_p: topP,
                max_tokens: maxTokens,
                evidence_required: evidenceRequired,
                max_retries: maxRetries,
                llm_calls_per_minute: llmCallsPerMinute,
              })
            }
          } else if (sql.toLowerCase().includes('insert into agent_config')) {
            const [
              tenantId, agentId, modelProvider, modelName, temperature, topP,
              maxTokens, evidenceRequired, maxRetries, llmCallsPerMinute
            ] = params
            const idx = configs.findIndex(c => c.tenant_id === tenantId && c.agent_id === agentId)
            const row = {
              tenant_id: tenantId,
              agent_id: agentId,
              model_provider: modelProvider,
              model_name: modelName,
              temperature,
              top_p: topP,
              max_tokens: maxTokens,
              evidence_required: evidenceRequired,
              max_retries: maxRetries,
              llm_calls_per_minute: llmCallsPerMinute,
            }
            if (idx >= 0) configs[idx] = row
            else configs.push(row)
          }
          return Promise.resolve({ changes: 1, meta: {} })
        },
      }),
    }),
    batch: () => Promise.resolve([]),
  } as unknown as D1Database

  return { db, configs }
}

describe('agent-config', () => {
  it('returns defaults when no config row exists', async () => {
    const { db } = makeMockD1()
    const config = await getAgentConfig(db, 'tenant-1', 'security' as AgentType)
    expect(config.tenant_id).toBe('tenant-1')
    expect(config.agent_id).toBe('security')
    expect(config.temperature).toBe(0.1)
    expect(config.max_tokens).toBe(4096)
    expect(config.evidence_required).toBe(true)
  })

  it('seeds default config with ensureDefaultAgentConfig', async () => {
    const { db, configs } = makeMockD1()
    await ensureDefaultAgentConfig(db, 'tenant-1', 'security' as AgentType)
    expect(configs.length).toBe(1)
    expect(configs[0].tenant_id).toBe('tenant-1')
    expect(configs[0].agent_id).toBe('security')
    expect(configs[0].temperature).toBe(0.1)
  })

  it('updates an existing config via setAgentConfig', async () => {
    const { db, configs } = makeMockD1()
    await ensureDefaultAgentConfig(db, 'tenant-1', 'security' as AgentType)
    const updated = await setAgentConfig(db, 'tenant-1', 'security' as AgentType, { temperature: 0.05, max_tokens: 2048 })
    expect(updated.temperature).toBe(0.05)
    expect(updated.max_tokens).toBe(2048)
    expect(configs[0].temperature).toBe(0.05)
  })

  it('exposes all 19 specialist agent types and can seed each one', async () => {
    expect(ALL_AGENT_TYPES.length).toBe(19)
    const { db, configs } = makeMockD1()
    for (const agentType of ALL_AGENT_TYPES) {
      await ensureDefaultAgentConfig(db, 'tenant-19', agentType as AgentType)
    }
    expect(configs.length).toBe(19)
    expect(new Set(configs.map(c => c.agent_id)).size).toBe(19)
  })
})
