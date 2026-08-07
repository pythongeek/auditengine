---
name: auditengine-s05
description: Run AuditEngine build session S05 from the build bible
type: flow
whenToUse: When the user wants to execute S05 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S04 must all be ✅ or stop.
2. Read src/types/index.ts fully before writing any code.
3. Read SPEC-01 (ReAct Agent Loop) from docs/ before writing any code.
4. Do not invent state transitions not in the spec.
5. If unsure about a Cloudflare API: // TODO: VERIFY CLOUDFLARE API — DO NOT GUESS
6. Do not touch files outside this session.
7. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-01 (ReAct Agent Loop) — 11 state transitions

---

TASK — src/agents/base-agent.ts (PART 1: state machine only)

Create this file. Import from '../types/index'. Import llmCall from '../lib/llm-gateway'.
Import runGate from '../lib/gate'. Do NOT write message builder functions yet (those are S06).

DOMAIN MAP — file path domain tagging (needed for boot state):
```typescript
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
```

Implement tick() with these 11 cases. Each case must do EXACTLY what is listed:

CASE "boot":
  - Load constitution from R2: `constitutions/${state.agentType}.md`
  - Load spec from R2: `SYSTEM_SPEC.md`
  - If R2.get() returns null for constitution: log error to agent_errors table, continue with empty string
  - Query repo_manifest for files in this agent's domain
  - Return new state with: constitutionText, specText, fileQueue, queueCursor=0, state="claiming"

CASE "claiming":
  - If queueCursor >= fileQueue.length: return state="done"
  - filePath = fileQueue[queueCursor]
  - INSERT OR IGNORE INTO claims(audit_run_id, agent_id, file_path) VALUES(?,?,?)
  - If changes === 0: another agent claimed it — increment cursor, stay in "claiming"
  - If changes === 1: call persistCursor() BEFORE reading, set state="reading"

CASE "reading":
  - Fetch from R2: `chunks/${state.auditRunId}/${state.currentFile}/0`
  - If null: call logMissingFile(), increment cursor, state="claiming"
  - On success: set currentFileContent, state="cross_reading"

CASE "cross_reading":
  - D1 query: SELECT finding_id, severity, category, file, description, agent_id
    FROM findings WHERE audit_run_id=? AND agent_id!=? AND ts > unixepoch()-3600
    ORDER BY ts DESC LIMIT 50
  - Set crossAgentContext = results, state="analyzing"

CASE "analyzing":
  - Call llmCall() with: agentId, agentType, taskType="deep_audit",
    messages=buildAnalysisMessages(state) [STUB — write as empty array for now],
    auditRunId, db, broadcast
  - Set lastModelOutput=response.text, state="gate_checking"

CASE "gate_checking":
  - Call runGate(state.lastModelOutput, ctx, db)
  - If passed: set validatedFindings=result.findings, state="writing"
  - If not passed:
    - newFailCount = gateFailCount + 1
    - If newFailCount >= 3: state="salvation"
    - Else: add reason to gateRejectionHistory, set gateRejectionReason=result.reason,
      gateFailCount=newFailCount, state="analyzing"

CASE "writing":
  - For each finding in validatedFindings:
    - INSERT INTO findings (all columns) — map from ValidatedFinding to D1 row
    - broadcast({ type:"finding_created", audit_run_id, payload:{ finding } })
  - increment queueCursor, state="looping"

CASE "looping":
  - Call persistCursor()
  - Set currentFile=null, currentFileContent=null, lastModelOutput=null,
    gateRejectionReason=null, gateRejectionHistory=[], gateFailCount=0
  - state="claiming"

CASE "done":
  - UPDATE agent_registry SET status='done', done_at=unixepoch() WHERE agent_id=?
  - broadcast({ type:"agent_state_change", payload:{status:"done"} })
  - Return state unchanged

CASE "paused":
  - UPDATE agent_registry SET status='paused' WHERE agent_id=?
  - Return state unchanged

CASE "salvation":
  - Call runSalvationProtocol(state, env) — write as stub: async function runSalvationProtocol(...) {}
  - Increment queueCursor, state="claiming"

ALWAYS at start of tick() — check budget before switching:
  SELECT paused FROM run_budget WHERE audit_run_id=?
  If paused=1 and current state is not already "paused": return state="paused"

---

HELPER FUNCTIONS to implement in this session:

async function persistCursor(agentId: string, cursor: number, db: D1Database): Promise<void>
  — UPDATE agent_registry SET queue_cursor=? WHERE agent_id=?

async function logMissingFile(filePath: string, agentId: string, db: D1Database): Promise<void>
  — INSERT INTO agent_errors(audit_run_id, agent_id, error_type, error_msg, file_path)

function buildGateContext(state: AgentPersistentState): GateContext
  — construct GateContext from state fields

STUB (implement in S06):
function buildAnalysisMessages(state: AgentPersistentState): Message[]
  — return [] for now, marked with // STUB — implemented in S06

export async function tick(state: AgentPersistentState, env: Env): Promise<AgentPersistentState>

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ tick() handles all 11 states
□ No state transition is missing from the spec
□ buildAnalysisMessages is stubbed and returns []
□ runSalvationProtocol is stubbed

SESSION END:
1. BUILD_STATE.md: base-agent.ts (state machine) ✅
2. SESSION_LOG.md row
3. git commit -m "S05: agent state machine (tick)"
