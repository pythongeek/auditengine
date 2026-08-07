---
name: auditengine-s11
description: Run AuditEngine build session S11 from the build bible
type: flow
whenToUse: When the user wants to execute S11 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S10 must all be ✅.
2. Read src/types/index.ts, src/agents/base-agent.ts before writing.
3. Read SPEC-06 (Salvation Protocol) from docs/.
4. Salvation uses llmCall() — import it. Do not call fetch() directly to any model API.
5. Do not touch files outside this session.
6. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-06 (Salvation Protocol — Full Algorithm)

---

TASK — src/workers/salvation.ts

IMPLEMENT buildSalvationPrompt(state: AgentPersistentState): Message[]
  Returns exactly 3 messages:
  [0] { role:"system", content: state.constitutionText }
  [1] { role:"system", content: state.specText }
  [2] { role:"user",   content: [the salvation prompt template from SPEC-06] }

  The user message must include:
  - "## SALVATION PROTOCOL ACTIVATED"
  - File: {state.currentFile}
  - "Previous gate rejections:" followed by each item in state.gateRejectionHistory
  - The 4 research instructions (known patterns, OWASP, CVEs, remediation path)
  - The exact SalvationReport JSON schema with all fields

IMPLEMENT runSalvationProtocol(state: AgentPersistentState, env: Env): Promise<void>
  1. Call llmCall() with:
     taskType: "salvation_research"
     messages: buildSalvationPrompt(state)
  2. Parse response as SalvationReport JSON
     - Strip markdown fences if present
     - If JSON parse fails: write error to agent_errors + broadcast salvation_activated with error flag
  3. INSERT INTO salvation_reports (all fields from SalvationReport)
  4. broadcast({ type:"salvation_complete", payload:{ salvation_id, finding_id, broadcast_message } })
  5. UPDATE agent_registry SET status='running' — agent continues after salvation

IMPLEMENT parseSalvationReport(text: string): SalvationReport | null
  Strip fences, JSON.parse, validate required fields.
  Return null on any parse failure.

Export: runSalvationProtocol (this replaces the stub in base-agent.ts)

After implementing: update src/agents/base-agent.ts to import and use the real
runSalvationProtocol instead of the empty stub. Only change that one import+call.

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ buildSalvationPrompt returns 3 messages with correct roles
□ parseSalvationReport returns null on invalid JSON
□ runSalvationProtocol writes to salvation_reports table
□ base-agent.ts stub replaced with real import

SESSION END:
1. BUILD_STATE.md: salvation.ts ✅
2. SESSION_LOG.md
3. git commit -m "S11: salvation protocol"
