---
name: auditengine-s06
description: Run AuditEngine build session S06 from the build bible
type: flow
whenToUse: When the user wants to execute S06 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S05 must be ✅.
2. Read src/types/index.ts fully.
3. Read src/agents/base-agent.ts fully before touching it.
4. Read SPEC-02 (Prompt Construction) and SPEC-03 (Execution Trace) from docs/.
5. Do not change the tick() function or any state logic from S05.
6. Do not touch other files.
7. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-02 (Prompt Construction), SPEC-03 (Execution Trace)

---

TASK — Replace stubs in src/agents/base-agent.ts

DO NOT MODIFY ANYTHING EXCEPT:
- Replace the buildAnalysisMessages stub
- Add the new builder functions below

IMPLEMENT THESE 4 FUNCTIONS:

1. buildAnalysisMessages(state: AgentPersistentState): Message[]
   Message slot order is FIXED (changing it breaks Kimi prompt caching):
   Slot 0 — role:"system" — content: state.constitutionText
   Slot 1 — role:"system" — content: "## PROJECT SPECIFICATION\n" + state.specText
   Slot 2 — role:"user"   — content: buildCrossAgentBlock(state.crossAgentContext)
             ONLY added if crossAgentContext.length > 0
   Slot 3 — role:"user"   — content: gate rejection message
             ONLY added if state.gateRejectionReason is not null
             Exact format:
             "## GATE REJECTION — YOUR PREVIOUS OUTPUT WAS REJECTED\n" +
             "Reason: {reason}\n" +
             "You must resubmit your analysis without the rejected content.\n" +
             "Do NOT use banned phrases. Do NOT omit evidence_quote.\n" +
             "Every finding must follow the exact JSON schema below."
   Slot 4 — role:"user"   — content: buildFileAnalysisBlock(state)

2. buildFileAnalysisBlock(state: AgentPersistentState): string
   The exact template (copy from SPEC-02 section 2.2):
   - Header: "## FILE UNDER ANALYSIS\nPath: {file}\nAudit run: {auditRunId}\nYour agent type: {agentType}"
   - File content wrapped in triple backticks
   - Task instructions
   - Required output format (the JSON schema with all 9 fields)
   - Execution trace requirement block
   - Banned phrases list (all 10 phrases)
   All literal text must match spec exactly — AI agents reading constitutions must see identical format.

3. buildCrossAgentBlock(findings: CrossAgentFinding[]): string
   Format per finding:
   "[SEVERITY] category — file\n  description\n"
   Header: "## FINDINGS FROM OTHER AGENTS (read before analyzing)\n..."
   Footer: "END OF CROSS-AGENT CONTEXT"

4. buildTracePrompt(category: string, state: AgentPersistentState): string
   Only inject for these categories (from SPEC-03 trace trigger table):
   auth_bypass, injection, xss, missing_event_handler, broken_api_contract
   For these: return the full trace prompt (DOM → handler → API → middleware → DB → response → UI)
   For all others: return empty string ""

---

DO NOT:
- Change tick() logic
- Change state types
- Rename existing functions

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ buildAnalysisMessages returns messages in slot 0-4 order
□ Slot 2 and Slot 3 are conditional (only present when their data exists)
□ buildTracePrompt returns empty string for "missing_index" category
□ buildTracePrompt returns non-empty string for "auth_bypass" category

SESSION END:
1. BUILD_STATE.md: base-agent.ts (message builders) ✅
2. SESSION_LOG.md
3. git commit -m "S06: agent message builders"
