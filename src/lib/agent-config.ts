import type { AgentConfig, AgentType } from '../types/index'

export const ALL_AGENT_TYPES: AgentType[] = [
  'architecture', 'security', 'api', 'database', 'performance', 'testing',
  'frontend', 'devops', 'documentation', 'visual_qa',
  'backend', 'dependency', 'a11y', 'i18n', 'logging',
  'code_quality', 'error_handling', 'configuration', 'refactoring',
]

export const DEFAULT_AGENT_CONFIG: Omit<AgentConfig, 'id' | 'tenant_id' | 'agent_id' | 'created_at' | 'updated_at'> = {
  model_provider: 'kimi',
  model_name: 'kimi-k3',
  temperature: 0.1,
  top_p: 0.85,
  max_tokens: 4096,
  evidence_required: true,
  max_retries: 3,
  llm_calls_per_minute: 10,
}

export async function getAgentConfig(
  db: D1Database,
  tenantId: string,
  agentType: AgentType
): Promise<AgentConfig> {
  const row = await db
    .prepare('SELECT * FROM agent_config WHERE tenant_id = ? AND agent_id = ? LIMIT 1')
    .bind(tenantId, agentType)
    .first<AgentConfig>()

  if (row) return row

  return {
    id: '',
    tenant_id: tenantId,
    agent_id: agentType,
    ...DEFAULT_AGENT_CONFIG,
    created_at: 0,
    updated_at: 0,
  }
}

export async function ensureDefaultAgentConfig(
  db: D1Database,
  tenantId: string,
  agentType: AgentType
): Promise<void> {
  const defaults = DEFAULT_AGENT_CONFIG
  await db
    .prepare(`
      INSERT OR IGNORE INTO agent_config (
        tenant_id, agent_id, model_provider, model_name, temperature, top_p,
        max_tokens, evidence_required, max_retries, llm_calls_per_minute, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
    `)
    .bind(
      tenantId,
      agentType,
      defaults.model_provider,
      defaults.model_name,
      defaults.temperature,
      defaults.top_p,
      defaults.max_tokens,
      defaults.evidence_required ? 1 : 0,
      defaults.max_retries,
      defaults.llm_calls_per_minute
    )
    .run()
}

export async function setAgentConfig(
  db: D1Database,
  tenantId: string,
  agentType: AgentType,
  updates: Partial<Omit<AgentConfig, 'id' | 'tenant_id' | 'agent_id' | 'created_at' | 'updated_at'>>
): Promise<AgentConfig> {
  const current = await getAgentConfig(db, tenantId, agentType)

  const merged: AgentConfig = {
    ...current,
    ...updates,
    tenant_id: tenantId,
    agent_id: agentType,
    updated_at: Date.now(),
  }

  await db
    .prepare(`
      INSERT INTO agent_config (
        tenant_id, agent_id, model_provider, model_name, temperature, top_p,
        max_tokens, evidence_required, max_retries, llm_calls_per_minute, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
      ON CONFLICT(tenant_id, agent_id) DO UPDATE SET
        model_provider = excluded.model_provider,
        model_name     = excluded.model_name,
        temperature    = excluded.temperature,
        top_p          = excluded.top_p,
        max_tokens     = excluded.max_tokens,
        evidence_required = excluded.evidence_required,
        max_retries    = excluded.max_retries,
        llm_calls_per_minute = excluded.llm_calls_per_minute,
        updated_at     = excluded.updated_at
    `)
    .bind(
      merged.tenant_id,
      merged.agent_id,
      merged.model_provider,
      merged.model_name,
      merged.temperature,
      merged.top_p,
      merged.max_tokens,
      merged.evidence_required ? 1 : 0,
      merged.max_retries,
      merged.llm_calls_per_minute
    )
    .run()

  return merged
}

export async function listAgentConfigs(
  db: D1Database,
  tenantId: string
): Promise<AgentConfig[]> {
  const rows = await db
    .prepare('SELECT * FROM agent_config WHERE tenant_id = ? ORDER BY agent_id')
    .bind(tenantId)
    .all<AgentConfig>()

  return rows.results ?? []
}
