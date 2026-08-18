import type { Env, AgentPersistentState, SalvationReport, Message, DashboardEvent, SalvationResearchSource } from '../types/index'
import { llmCall } from '../lib/llm-gateway'
import { researchSalvation } from '../lib/external-research'

export function buildSalvationPrompt(
  state: AgentPersistentState,
  researchSources: SalvationResearchSource[]
): Message[] {
  const history = state.gateRejectionHistory.length > 0
    ? state.gateRejectionHistory.map((reason, i) => `${i + 1}. ${reason}`).join('\n')
    : '(none recorded)'

  const sourceBlock = researchSources.length > 0
    ? researchSources
        .map(
          (s, i) =>
            `${i + 1}. [${s.source_type}] ${s.url}\n   Relevant finding: ${s.relevant_finding}\n   Proposed solution: ${s.proposed_solution}`
        )
        .join('\n')
    : 'No authoritative external sources were found for this query.'

  const userContent = `## SALVATION PROTOCOL ACTIVATED

File: ${state.currentFile}

Previous gate rejections:
${history}

## REAL RESEARCH SOURCES
${sourceBlock}

You are in salvation mode. The agent's previous attempts to analyze this file failed the verification gate three times. Your job is to produce a structured research report that explains the issue and provides a safe path forward.

Research instructions:
1. Use the real research sources above wherever possible; include their source_type, url, relevant_finding, and proposed_solution verbatim.
2. If fewer than 2 real sources are available, you MUST also include at least one source with source_type "framework_docs" and url "https://llm-generated" to mark it as LLM-generated context. In that source, clearly state that no authoritative external source was found and that the content is model-generated.
3. Reference OWASP guidance where relevant to the issue.
4. Propose a concrete remediation path that a human reviewer can follow.

Output ONLY a JSON object matching this exact schema. No prose. No markdown outside the JSON.

{
  "salvation_id": "string",
  "finding_id": "string or best-guess identifier",
  "attempts": [
    {
      "attempt_number": 1,
      "what_was_tried": "string",
      "why_it_failed": "string"
    }
  ],
  "research_sources": [
    {
      "source_type": "owasp | nvd | github_issue | stackoverflow | framework_docs",
      "url": "string",
      "relevant_finding": "string",
      "proposed_solution": "string"
    }
  ],
  "human_recommendation": "string",
  "estimated_effort": "S | M | L | XL",
  "blocking_task_ids": ["string"],
  "broadcast_message": "string"
}
`

  return [
    { role: 'system', content: state.constitutionText },
    { role: 'system', content: state.specText },
    { role: 'user', content: userContent },
  ]
}

export function parseSalvationReport(text: string): SalvationReport | null {
  try {
    const cleaned = text
      .replace(/^```json\s*/m, '')
      .replace(/^```\s*/m, '')
      .trim()

    const parsed = JSON.parse(cleaned) as SalvationReport

    if (
      typeof parsed.salvation_id !== 'string' ||
      typeof parsed.finding_id !== 'string' ||
      !Array.isArray(parsed.attempts) ||
      !Array.isArray(parsed.research_sources) ||
      typeof parsed.human_recommendation !== 'string' ||
      !['S', 'M', 'L', 'XL'].includes(parsed.estimated_effort) ||
      !Array.isArray(parsed.blocking_task_ids) ||
      typeof parsed.broadcast_message !== 'string'
    ) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export async function runSalvationProtocol(
  state: AgentPersistentState,
  env: Env
): Promise<void> {
  const db = env.DB
  const broadcast = (event: DashboardEvent): void => {
    const id = env.DASHBOARD_DO.idFromName('dashboard-' + state.auditRunId)
    const stub = env.DASHBOARD_DO.get(id)
    stub.fetch(new Request('https://dashboard/broadcast', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: { 'Content-Type': 'application/json' },
    })).catch(() => {})
  }

  try {
    const researchSources = await researchSalvation(state, env, db)

    const fallbackSource: SalvationResearchSource = {
      source_type: 'framework_docs',
      url: 'https://llm-generated',
      relevant_finding: '[LLM-generated] No authoritative external source was found for this query; using model-generated guidance.',
      proposed_solution: 'Use the remediation path proposed by the model and verify it against the project-specific context and tests.',
    }
    const promptSources = researchSources.length >= 2 ? researchSources : [...researchSources, fallbackSource]

    const response = await llmCall({
      agentId: state.agentId,
      agentType: state.agentType,
      taskType: 'salvation_research',
      messages: buildSalvationPrompt(state, promptSources),
      auditRunId: state.auditRunId,
      db,
      broadcast,
    }, env)

    const report = parseSalvationReport(response.text)

    if (!report) {
      await db
        .prepare(`
          INSERT INTO agent_errors (audit_run_id, agent_id, error_type, error_msg, file_path)
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(state.auditRunId, state.agentId, 'salvation_parse_error', 'Failed to parse salvation report', state.currentFile ?? '')
        .run()

      broadcast({
        type: 'salvation_activated',
        audit_run_id: state.auditRunId,
        agent_id: state.agentId,
        payload: { error: true, reason: 'Failed to parse salvation report' },
        ts: Date.now(),
      })
      return
    }

    await db
      .prepare(`
        INSERT INTO salvation_reports (
          salvation_id, audit_run_id, agent_id, finding_id, attempts_json,
          research_sources, human_recommendation, estimated_effort,
          blocking_task_ids, broadcast_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        report.salvation_id,
        state.auditRunId,
        state.agentId,
        report.finding_id,
        JSON.stringify(report.attempts),
        JSON.stringify(report.research_sources),
        report.human_recommendation,
        report.estimated_effort,
        JSON.stringify(report.blocking_task_ids),
        report.broadcast_message
      )
      .run()

    broadcast({
      type: 'salvation_complete',
      audit_run_id: state.auditRunId,
      agent_id: state.agentId,
      payload: {
        salvation_id: report.salvation_id,
        finding_id: report.finding_id,
        broadcast_message: report.broadcast_message,
      },
      ts: Date.now(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    await db
      .prepare(`
        INSERT INTO agent_errors (audit_run_id, agent_id, error_type, error_msg, file_path)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(state.auditRunId, state.agentId, 'salvation_error', msg, state.currentFile ?? '')
      .run()
  }

  await db
    .prepare("UPDATE agent_registry SET status = 'running' WHERE agent_id = ?")
    .bind(state.agentId)
    .run()
}
