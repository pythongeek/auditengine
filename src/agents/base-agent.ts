import { DurableObject } from 'cloudflare:workers'
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

const BANNED_PHRASES_LIST = [
  "production ready", "looks good", "should work", "seems correct", "appears to",
  "likely works", "no issues found", "clean code", "well structured", "everything looks"
]

const TRACE_CATEGORIES = new Set([
  'auth_bypass', 'injection', 'xss', 'missing_event_handler', 'broken_api_contract'
])

export function buildAnalysisMessages(state: AgentPersistentState): Message[] {
  const messages: Message[] = []

  // Slot 0
  messages.push({ role: 'system', content: state.constitutionText })

  // Slot 1
  messages.push({ role: 'system', content: "## PROJECT SPECIFICATION\n" + state.specText })

  // Slot 2 — only if cross-agent context exists
  if (state.crossAgentContext.length > 0) {
    messages.push({ role: 'user', content: buildCrossAgentBlock(state.crossAgentContext) })
  }

  // Slot 3 — only if previous output was rejected
  if (state.gateRejectionReason !== null) {
    messages.push({
      role: 'user',
      content:
        "## GATE REJECTION — YOUR PREVIOUS OUTPUT WAS REJECTED\n" +
        `Reason: ${state.gateRejectionReason}\n` +
        "You must resubmit your analysis without the rejected content.\n" +
        "Do NOT use banned phrases. Do NOT omit evidence_quote.\n" +
        "Every finding must follow the exact JSON schema below."
    })
  }

  // Slot 4
  messages.push({ role: 'user', content: buildFileAnalysisBlock(state) })

  return messages
}

export function buildFileAnalysisBlock(state: AgentPersistentState): string {
  const header = `## FILE UNDER ANALYSIS\nPath: ${state.currentFile}\nAudit run: ${state.auditRunId}\nYour agent type: ${state.agentType}`
  const fileBlock = "```\n" + (state.currentFileContent ?? '') + "\n```"

  const taskInstructions = `
## TASK
Analyze the file above for issues matching your mandate and categories.
Use only the evidence that appears in the file.
Output ONLY a JSON array of findings. No prose. No markdown outside the JSON.
If there are no issues, output [].
`

  const outputSchema = `
## REQUIRED OUTPUT FORMAT
Each finding must be an object with exactly these 9 fields:
- "finding_id": a unique string ID for this finding
- "severity": one of "critical", "high", "medium", "low", "info"
- "category": one of the category strings from your constitution
- "file": the file path shown above
- "line_range": either [startLine, endLine] or null
- "evidence_quote": an exact substring from the file content (minimum 8 characters)
- "description": what the issue is and why it matters
- "impact": the concrete negative consequence; required for critical and high severity (minimum 20 characters)
- "verified_by": an array of strings describing verification steps taken
`

  const traceBlock = `
## EXECUTION TRACE REQUIREMENT
For findings in these categories, you must include a full execution trace in the description:
auth_bypass, injection, xss, missing_event_handler, broken_api_contract.
The trace must cover: DOM → handler → API → middleware → DB → response → UI.
If the handler is missing, state that explicitly and show what should have been called.
`

  const bannedBlock = `
## BANNED PHRASES
Never use any of these phrases in your output:
${BANNED_PHRASES_LIST.map(p => `- ${p}`).join('\n')}
`

  return [header, fileBlock, taskInstructions, outputSchema, traceBlock, bannedBlock].join('\n')
}

export function buildCrossAgentBlock(findings: AgentPersistentState['crossAgentContext']): string {
  if (findings.length === 0) return ''

  const lines = findings.map(f => `[${f.severity}] ${f.category} — ${f.file}\n  ${f.description}`)
  return "## FINDINGS FROM OTHER AGENTS (read before analyzing)\n" +
    lines.join('\n\n') +
    "\nEND OF CROSS-AGENT CONTEXT"
}

export function buildTracePrompt(category: string, state: AgentPersistentState): string {
  if (!TRACE_CATEGORIES.has(category)) return ''

  return `
## EXECUTION TRACE REQUIRED
Category: ${category}
File: ${state.currentFile}
Provide a full execution trace: DOM → handler → API → middleware → DB → response → UI.
If any layer is missing or bypassed, explain exactly what is missing and how it breaks the chain.
`
}

// STUB — implemented in S11
async function runSalvationProtocol(state: AgentPersistentState, env: Env): Promise<void> {
  // no-op stub
}

export class AgentDurableObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const body = await request.json() as {
      agentId: string
      agentType: AgentType
      auditRunId: string
    }
    const { agentId, agentType, auditRunId } = body

    let state: AgentPersistentState = {
      agentId,
      agentType,
      auditRunId,
      state: 'boot',
      fileQueue: [],
      queueCursor: 0,
      currentFile: null,
      currentFileContent: null,
      gateFailCount: 0,
      currentFindingId: null,
      constitutionText: '',
      specText: '',
      lastModelOutput: null,
      gateRejectionReason: null,
      gateRejectionHistory: [],
      crossAgentContext: [],
      validatedFindings: [],
    }

    const broadcast = (event: DashboardEvent): void => {
      const id = this.env.DASHBOARD_DO.idFromName('dashboard-' + auditRunId)
      const stub = this.env.DASHBOARD_DO.get(id)
      stub.fetch(new Request('https://dashboard/broadcast', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'Content-Type': 'application/json' },
      })).catch(() => {
        // broadcast failures are non-fatal
      })
    }

    while (state.state !== 'done' && state.state !== 'paused') {
      state = await tick(state, this.env, broadcast)
    }

    return new Response(JSON.stringify({ status: state.state, agentId }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
