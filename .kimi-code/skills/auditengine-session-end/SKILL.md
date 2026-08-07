---
name: auditengine-session-end
description: End an AuditEngine session cleanly with type check, diff, and BUILD_STATE update
type: flow
whenToUse: When the session task is complete and the user wants to close the session
---

Session ending. Before we close:
1. Run npx tsc --noEmit — show me the result
2. Run git diff --name-only — show me every file changed this session
3. Update BUILD_STATE.md:
   - Mark ✅ DONE for every file completed this session
   - Mark ⚠️ PARTIAL for anything started but not finished, with a note on what's missing
   - Add a row to the SESSION LOG table: session number, date, what was done, files changed
4. Report: "Ready to commit. Changed files: [list]. Type check: [PASS / FAIL]"

I will review and run the commit myself.
