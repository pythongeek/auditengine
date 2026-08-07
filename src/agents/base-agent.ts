import type { Env, AgentPersistentState, AgentType, GateContext,
  DashboardEvent, Message } from '../types/index'
import { llmCall } from '../lib/llm-gateway'
import { runGate } from '../lib/gate'

export const DOMAIN_MAP: Record<AgentType, string> = {
  security:      "backend",
  api:           "backend",
  frontend:      "frontend",
  database:      "database",
  architecture:  "all",
  testing:       "test",
  performance:   "all",
  devops:        "config",
  documentation: "docs",
  visual_qa:     "all"
}

function constitutionFileName(agentType: AgentType): string {
  return agentType === 'visual_qa' ? 'visual-qa.md' : `${agentType}.md`
}

export async function tick(
  state: AgentPersistentState,
  env: Env,
  broadcast: (event: DashboardEvent) => void
): Promise<AgentPersistentState> {

  // ALWAYS: check budget before switching
  const budgetRow = await env.DB
    .prepare('SELECT paused FROM run_budget WHERE audit_run_id = ?')
    .bind(state.auditRunId)
    .first<{ paused: number }>()
  if (budgetRow?.paused === 1 && state.state !== 'paused') {
    return { ...state, state: 'paused' }
  }

  switch (state.state) {
    case 'boot': {
      const constitutionKey = `constitutions/${constitutionFileName(state.agentType)}`
      const specKey = 'SYSTEM_SPEC.md'

      const constitutionObj = await env.R2.get(constitutionKey)
      const specObj = await env.R2.get(specKey)

      let constitutionText = ''
      if (constitutionObj === null) {
        await env.DB
          .prepare(`
            INSERT INTO agent_errors (audit_run_id, agent_id, error_type, error_path, file_path)
            VALUES (?, ?, ?, ?, ?)
          `)
          .bind(state.auditRunId, state.agentId, 'missing_constitution', `Missing ${constitutionKey}`, constitutionKey)
          .run()
      } else {
        constitutionText = await constitutionObj.text()
      }

      const specText = specObj === null ? '' : await specObj.text()

      const domain = DOMAIN_MAP[state.agentType]
      const rows = await env.DB
        .prepare('SELECT file_path FROM repo_manifest WHERE audit_run_id = ? AND domain = ?')
        .bind(state.auditRunId, domain)
        .all<{ file_path: string }>()
      const fileQueue = rows.results?.map(r => r.file_path) ?? []

      return {
        ...state,
        state: 'claiming',
        constitutionText,
        specText,
        fileQueue,
        queueCursor: 0,
      }
    }

    case 'claiming': {
      if (state.queueCursor >= state.fileQueue.length) {
        return { ...state, state: 'done' }
      }

      const filePath = state.fileQueue[state.queueCursor]
      const claimResult = await env.DB
        .prepare('INSERT OR IGNORE INTO claims (audit_run_id, agent_id, file_path) VALUES (?, ?, ?)')
        .bind(state.auditRunId, state.agentId, filePath)
        .run()

      if (claimResult.meta?.changes === 0) {
        return { ...state, queueCursor: state.queueCursor + 1 }
      }

      await persistCursor(state.agentId, state.queueCursor, env.DB)
      return { ...state, state: 'reading', currentFile: filePath }
    }

    case 'reading': {
      if (!state.currentFile) {
        return { ...state, state: 'claiming', queueCursor: state.queueCursor + 1 }
      }

      const chunkKey = `chunks/${state.auditRunId}/${state.currentFile}/0`
      const chunkObj = await env.R2.get(chunkKey)

      if (chunkObj === null) {
        await logMissingFile(state.currentFile, state.agentId, env.DB)
        return { ...state, state: 'claiming', queueCursor: state.queueCursor + 1 }
      }

      const currentFileContent = await chunkObj.text()
      return { ...state, state: 'cross_reading', currentFileContent }
    }

    case 'cross_reading': {
      const rows = await env.DB
        .prepare(`
          SELECT finding_id, severity, category, file, description, agent_id
          FROM findings
          WHERE audit_run_id = ? AND agent_id != ? AND ts > unixepoch() - 3600
          ORDER BY ts DESC
          LIMIT 50
        `)
        .bind(state.auditRunId, state.agentId)
        .all<{ finding_id: string; severity: string; category: string; file: string; description: string; agent_id: string }>()

      return {
        ...state,
        state: 'analyzing',
        crossAgentContext: rows.results?.map(r => ({
          finding_id: r.finding_id,
          severity: r.severity as AgentPersistentState['crossAgentContext'][number]['severity'],
          category: r.category,
          file: r.file,
          description: r.description,
          agent_id: r.agent_id,
        })) ?? [],
      }
    }

    case 'analyzing': {
      const response = await llmCall({
        agentId: state.agentId,
        agentType: state.agentType,
        taskType: 'deep_audit',
        messages: buildAnalysisMessages(state),
        auditRunId: state.auditRunId,
        db: env.DB,
        broadcast,
      }, env)

      return { ...state, state: 'gate_checking', lastModelOutput: response.text }
    }

    case 'gate_checking': {
      if (!state.currentFile || !state.currentFileContent || !state.lastModelOutput) {
        return { ...state, state: 'looping' }
      }

      const ctx = buildGateContext(state)
      const gateResult = await runGate(state.lastModelOutput, ctx, env.DB)

      if (gateResult.passed) {
        return { ...state, state: 'writing', validatedFindings: gateResult.findings }
      }

      const newFailCount = state.gateFailCount + 1
      if (newFailCount >= 3) {
        return { ...state, state: 'salvation', gateFailCount: newFailCount }
      }

      return {
        ...state,
        state: 'analyzing',
        gateFailCount: newFailCount,
        gateRejectionReason: gateResult.reason,
        gateRejectionHistory: [...state.gateRejectionHistory, gateResult.reason ?? ''],
      }
    }

    case 'writing': {
      for (const finding of state.validatedFindings) {
        await env.DB
          .prepare(`
            INSERT INTO findings (
              finding_id, audit_run_id, agent_id, agent_type, severity, category,
              file, line_range_start, line_range_end, evidence_quote, description,
              impact, verified_by, source, status, recurrence_count, ts, verified_at, screenshot_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            finding.finding_id,
            finding.audit_run_id,
            finding.agent_id,
            finding.agent_type,
            finding.severity,
            finding.category,
            finding.file,
            finding.line_range?.[0] ?? null,
            finding.line_range?.[1] ?? null,
            finding.evidence_quote,
            finding.description,
            finding.impact,
            JSON.stringify(finding.verified_by),
            finding.source,
            finding.status,
            finding.recurrence_count,
            finding.ts,
            finding.verified_at,
            finding.screenshot_id
          )
          .run()

        broadcast({
          type: 'finding_created',
          audit_run_id: state.auditRunId,
          agent_id: state.agentId,
          payload: { finding },
          ts: Date.now(),
        })
      }

      return { ...state, state: 'looping', queueCursor: state.queueCursor + 1 }
    }

    case 'looping': {
      await persistCursor(state.agentId, state.queueCursor, env.DB)
      return {
        ...state,
        state: 'claiming',
        currentFile: null,
        currentFileContent: null,
        lastModelOutput: null,
        gateRejectionReason: null,
        gateRejectionHistory: [],
        gateFailCount: 0,
        validatedFindings: [],
      }
    }

    case 'done': {
      await env.DB
        .prepare("UPDATE agent_registry SET status = 'done', done_at = unixepoch() WHERE agent_id = ?")
        .bind(state.agentId)
        .run()

      broadcast({
        type: 'agent_state_change',
        audit_run_id: state.auditRunId,
        agent_id: state.agentId,
        payload: { status: 'done' },
        ts: Date.now(),
      })

      return state
    }

    case 'paused': {
      await env.DB
        .prepare("UPDATE agent_registry SET status = 'paused' WHERE agent_id = ?")
        .bind(state.agentId)
        .run()

      return state
    }

    case 'salvation': {
      await runSalvationProtocol(state, env)
      return { ...state, state: 'claiming', queueCursor: state.queueCursor + 1 }
    }

    default:
      return state
  }
}

export async function persistCursor(agentId: string, cursor: number, db: D1Database): Promise<void> {
  await db
    .prepare('UPDATE agent_registry SET queue_cursor = ? WHERE agent_id = ?')
    .bind(cursor, agentId)
    .run()
}

export async function logMissingFile(filePath: string, agentId: string, db: D1Database): Promise<void> {
  // audit_run_id is unknown here; use empty string to satisfy schema and log agent context
  await db
    .prepare(`
      INSERT INTO agent_errors (audit_run_id, agent_id, error_type, error_msg, file_path)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind('', agentId, 'missing_file_chunk', `Missing chunk for ${filePath}`, filePath)
    .run()
}

export function buildGateContext(state: AgentPersistentState): GateContext {
  return {
    agentId: state.agentId,
    agentType: state.agentType,
    auditRunId: state.auditRunId,
    currentFile: state.currentFile!,
    currentFileContent: state.currentFileContent!,
    claimLog: new Set(),
  }
}

// STUB — implemented in S06
export function buildAnalysisMessages(state: AgentPersistentState): Message[] {
  return []
}

// STUB — implemented in S11
async function runSalvationProtocol(state: AgentPersistentState, env: Env): Promise<void> {
  // no-op stub
}
