import { DurableObject } from 'cloudflare:workers'
import type { Env, AgentPersistentState, AgentType, GateContext,
  DashboardEvent, Message, ValidatedFinding, CrossAgentFinding } from '../types/index'
import { llmCall } from '../lib/llm-gateway'
import { runGate } from '../lib/gate'
import { getChunk } from '../lib/r2-storage'
import { isCriticalAgentType } from '../lib/agent-config'
import { LRUCache } from '../lib/cache'

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
  visual_qa:     "all",
  backend:       "backend",
  dependency:    "all",
  a11y:          "frontend",
  i18n:          "all",
  logging:       "all",
  code_quality:  "all",
  error_handling:"all",
  configuration: "config",
  refactoring:   "all",
}

function constitutionFileName(agentType: AgentType): string {
  return agentType === 'visual_qa' ? 'visual-qa.md' : `${agentType}.md`
}

export async function tick(
  state: AgentPersistentState,
  env: Env,
  broadcast: (event: DashboardEvent) => void,
  chunkCache?: LRUCache<string, string>
): Promise<AgentPersistentState> {

  // ALWAYS: check budget before switching
  const budgetRow = await env.DB
    .prepare('SELECT paused, throttled FROM run_budget WHERE audit_run_id = ?')
    .bind(state.auditRunId)
    .first<{ paused: number; throttled: number }>()
  if (budgetRow?.paused === 1 && state.state !== 'paused') {
    return { ...state, state: 'paused' }
  }
  if (budgetRow?.throttled === 1 && !isCriticalAgentType(state.agentType) && state.state !== 'paused') {
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
        await writeAuditLog(
          env.DB,
          state.tenantId ?? '',
          state.auditRunId,
          state.agentId,
          'error',
          { error_type: 'missing_constitution', path: constitutionKey }
        )
      } else {
        constitutionText = await constitutionObj.text()
      }

      const specText = specObj === null ? '' : await specObj.text()

      const domain = DOMAIN_MAP[state.agentType]
      const registryRow = await env.DB
        .prepare('SELECT assigned_files FROM agent_registry WHERE agent_id = ?')
        .bind(state.agentId)
        .first<{ assigned_files: string }>()
      const assignedFiles = registryRow?.assigned_files ? JSON.parse(registryRow.assigned_files) as string[] : []

      const fileQueue = assignedFiles.length > 0
        ? assignedFiles
        : (await env.DB
            .prepare('SELECT path FROM files WHERE tenant_id = ? AND audit_run_id = ? AND domain_tag = ?')
            .bind(state.tenantId ?? '', state.auditRunId, domain)
            .all<{ path: string }>()).results?.map(r => r.path) ?? []

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

      const chunkObj = await getChunk(
        state.tenantId ?? '',
        state.auditRunId,
        state.currentFile,
        0,
        env.R2
      )

      if (chunkObj === null) {
        await logMissingFile(state.currentFile, state.agentId, env.DB)
        await writeAuditLog(
          env.DB,
          state.tenantId ?? '',
          state.auditRunId,
          state.agentId,
          'error',
          { error_type: 'missing_file_chunk', file: state.currentFile }
        )
        return { ...state, state: 'claiming', queueCursor: state.queueCursor + 1 }
      }

      const currentFileContent = await chunkObj.text()
      return { ...state, state: 'cross_reading', currentFileContent }
    }

    case 'cross_reading': {
      const findingsRows = await env.DB
        .prepare(`
          SELECT finding_id, severity, category, file, description, agent_id
          FROM findings
          WHERE audit_run_id = ? AND agent_id != ? AND ts > unixepoch() - 3600
          ORDER BY ts DESC
          LIMIT 50
        `)
        .bind(state.auditRunId, state.agentId)
        .all<{ finding_id: string; severity: string; category: string; file: string; description: string; agent_id: string }>()

      const knowledge = await readSharedMemory(state, env)

      const fromFindings = findingsRows.results?.map(r => ({
        finding_id: r.finding_id,
        severity: r.severity as AgentPersistentState['crossAgentContext'][number]['severity'],
        category: r.category,
        file: r.file,
        description: r.description,
        agent_id: r.agent_id,
      })) ?? []

      const merged = mergeCrossAgentContext(fromFindings, knowledge)

      return {
        ...state,
        state: 'analyzing',
        crossAgentContext: merged,
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

      const ctx = buildGateContext(state, env, chunkCache)
      const gateResult = await runGate(state.lastModelOutput, ctx, env.DB)

      if (gateResult.passed) {
        return { ...state, state: 'writing', validatedFindings: gateResult.findings }
      }

      await writeAuditLog(
        env.DB,
        state.tenantId ?? '',
        state.auditRunId,
        state.agentId,
        'gate_rejected',
        { reason: gateResult.reason, file: state.currentFile }
      )

      const newFailCount = state.gateFailCount + 1
      const newReactIterations = state.reactIterations + 1

      if (newFailCount >= 3) {
        return { ...state, state: 'salvation', gateFailCount: newFailCount, reactIterations: newReactIterations }
      }

      if (newReactIterations >= 5) {
        await writeAuditLog(
          env.DB,
          state.tenantId ?? '',
          state.auditRunId,
          state.agentId,
          'react_bound_exceeded',
          { file: state.currentFile, iterations: newReactIterations }
        )
        return { ...state, state: 'looping', queueCursor: state.queueCursor + 1, reactIterations: newReactIterations }
      }

      return {
        ...state,
        state: 'analyzing',
        gateFailCount: newFailCount,
        reactIterations: newReactIterations,
        gateRejectionReason: gateResult.reason,
        gateRejectionHistory: [...state.gateRejectionHistory, gateResult.reason ?? ''],
      }
    }

    case 'writing': {
      for (const finding of state.validatedFindings) {
        const decision = await deduplicateFinding(finding, state, env)
        if (decision.action === 'skip') {
          await writeAuditLog(
            env.DB,
            state.tenantId ?? '',
            state.auditRunId,
            state.agentId,
            'finding_duplicate_skipped',
            { finding_id: finding.finding_id, file: finding.file, category: finding.category }
          )
          continue
        }

        const finalFinding = decision.finding
        await env.DB
          .prepare(`
            INSERT INTO findings (
              finding_id, audit_run_id, agent_id, agent_type, severity, category,
              file, line_range_start, line_range_end, evidence_quote, description,
              impact, verified_by, source, status, recurrence_count, is_regression, ts, verified_at, screenshot_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            finalFinding.finding_id,
            finalFinding.audit_run_id,
            finalFinding.agent_id,
            finalFinding.agent_type,
            finalFinding.severity,
            finalFinding.category,
            finalFinding.file,
            finalFinding.line_range?.[0] ?? null,
            finalFinding.line_range?.[1] ?? null,
            finalFinding.evidence_quote,
            finalFinding.description,
            finalFinding.impact,
            JSON.stringify(finalFinding.verified_by),
            finalFinding.source,
            finalFinding.status,
            finalFinding.recurrence_count,
            finalFinding.is_regression ? 1 : 0,
            finalFinding.ts,
            finalFinding.verified_at,
            finalFinding.screenshot_id
          )
          .run()

        await writeSharedMemory(finalFinding, state, env)

        broadcast({
          type: 'finding_created',
          audit_run_id: state.auditRunId,
          agent_id: state.agentId,
          payload: { finding: finalFinding },
          ts: Date.now(),
        })
        await writeAuditLog(
          env.DB,
          state.tenantId ?? '',
          state.auditRunId,
          state.agentId,
          'finding_written',
          { finding_id: finalFinding.finding_id, file: finalFinding.file, severity: finalFinding.severity, is_regression: finalFinding.is_regression }
        )
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
        reactIterations: 0,
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
      await env.SALVATION_WORKFLOW.create({
        id: `salvation-${state.agentId}-${Date.now()}`,
        params: state,
      })
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

export async function writeAuditLog(
  db: D1Database,
  tenantId: string,
  auditRunId: string,
  agentId: string | null,
  eventType: string,
  eventData: Record<string, unknown>
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(tenantId, auditRunId, agentId, eventType, JSON.stringify(eventData))
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

export async function readSharedMemory(
  state: AgentPersistentState,
  env: Env
): Promise<CrossAgentFinding[]> {
  if (!state.currentFile || !env.SHARED_MEMORY_DO) return []

  const id = env.SHARED_MEMORY_DO.idFromName(`shared-${state.auditRunId}`)
  const stub = env.SHARED_MEMORY_DO.get(id)

  try {
    const response = await stub.fetch(new Request('https://shared-memory/read', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: state.tenantId ?? '',
        audit_run_id: state.auditRunId,
        file_path: state.currentFile,
        agent_id: state.agentId,
      }),
      headers: { 'Content-Type': 'application/json' },
    }))

    if (!response.ok) return []
    const data = await response.json() as { entries: Array<{
      agent_id: string
      agent_type: string
      file_path: string
      finding_id: string | null
      content: string
    }> }

    return (data.entries ?? []).map(entry => {
      const content = JSON.parse(entry.content) as {
        severity: string
        category: string
        description: string
      }
      return {
        finding_id: entry.finding_id ?? '',
        severity: content.severity as CrossAgentFinding['severity'],
        category: content.category,
        file: entry.file_path,
        description: content.description,
        agent_id: entry.agent_id,
      }
    })
  } catch {
    return []
  }
}

export async function writeSharedMemory(
  finding: ValidatedFinding,
  state: AgentPersistentState,
  env: Env
): Promise<void> {
  if (!env.SHARED_MEMORY_DO) return

  const id = env.SHARED_MEMORY_DO.idFromName(`shared-${state.auditRunId}`)
  const stub = env.SHARED_MEMORY_DO.get(id)

  try {
    await stub.fetch(new Request('https://shared-memory/write', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: state.tenantId ?? '',
        audit_run_id: state.auditRunId,
        agent_id: state.agentId,
        agent_type: state.agentType,
        file_path: finding.file,
        finding_id: finding.finding_id,
        knowledge_type: 'finding',
        content: JSON.stringify({
          severity: finding.severity,
          category: finding.category,
          description: finding.description,
        }),
      }),
      headers: { 'Content-Type': 'application/json' },
    }))
  } catch {
    // Shared memory writes are best-effort; failures should not stop the agent.
  }
}

export async function deduplicateFinding(
  finding: ValidatedFinding,
  state: AgentPersistentState,
  env: Env
): Promise<{ action: 'insert' | 'skip'; finding: ValidatedFinding }> {
  const rows = await env.DB
    .prepare(`
      SELECT finding_id, status, recurrence_count
      FROM findings
      WHERE tenant_id = ? AND audit_run_id = ? AND file = ? AND category = ? AND severity = ?
    `)
    .bind(state.tenantId ?? '', state.auditRunId, finding.file, finding.category, finding.severity)
    .all<{ finding_id: string; status: string; recurrence_count: number }>()

  const existing = rows.results ?? []
  if (existing.length === 0) {
    return { action: 'insert', finding: { ...finding, recurrence_count: 0, is_regression: false } }
  }

  const resolved = existing.find(r => ['resolved', 'closed', 'superseded'].includes(r.status))
  if (resolved) {
    return {
      action: 'insert',
      finding: {
        ...finding,
        recurrence_count: resolved.recurrence_count + 1,
        is_regression: true,
      },
    }
  }

  // Duplicate open finding — keep the original and skip this one.
  return { action: 'skip', finding }
}

export function mergeCrossAgentContext(
  fromFindings: CrossAgentFinding[],
  fromSharedMemory: CrossAgentFinding[]
): CrossAgentFinding[] {
  const seen = new Set<string>()
  const merged: CrossAgentFinding[] = []

  for (const item of [...fromFindings, ...fromSharedMemory]) {
    const key = `${item.agent_id}:${item.finding_id}:${item.category}:${item.file}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(item)
    }
  }

  return merged.slice(0, 50)
}

export function buildGateContext(state: AgentPersistentState, env: Env, chunkCache?: LRUCache<string, string>): GateContext {
  return {
    agentId: state.agentId,
    agentType: state.agentType,
    auditRunId: state.auditRunId,
    tenantId: state.tenantId,
    currentFile: state.currentFile!,
    currentFileContent: state.currentFileContent!,
    r2: env.R2,
    claimLog: new Set(),
    chunkCache,
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
- "evidence_quote": an exact substring from the file content (minimum 10 characters; critical/high findings require at least 50 characters)
- "description": what the issue is and why it matters
- "impact": the concrete negative consequence; required for critical and high severity (minimum 30 characters)
- "verified_by": an array of strings describing verification steps taken

Do NOT include any fields other than these 9. Extra fields cause automatic rejection.
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

export class AgentDurableObject extends DurableObject<Env> {
  private chunkCache = new LRUCache<string, string>(50)

  async fetch(request: Request): Promise<Response> {
    const body = await request.json() as {
      agentId: string
      tenantId?: string
      agentType: AgentType
      auditRunId: string
    }
    const { agentId, tenantId, agentType, auditRunId } = body

    let state: AgentPersistentState = {
      agentId,
      tenantId,
      agentType,
      auditRunId,
      state: 'boot',
      fileQueue: [],
      queueCursor: 0,
      currentFile: null,
      currentFileContent: null,
      gateFailCount: 0,
      reactIterations: 0,
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

    let previousState = state.state
    while (state.state !== 'done' && state.state !== 'paused') {
      state = await tick(state, this.env, broadcast, this.chunkCache)
      if (state.state !== previousState) {
        await writeAuditLog(
          this.env.DB,
          tenantId ?? '',
          auditRunId,
          agentId,
          'state_change',
          { from: previousState, to: state.state }
        )
        previousState = state.state
      }
    }

    return new Response(JSON.stringify({ status: state.state, agentId }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
