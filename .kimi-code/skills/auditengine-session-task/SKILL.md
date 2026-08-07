---
name: auditengine-session-task
description: Run a planned AuditEngine build session from the build bible
type: flow
whenToUse: When the user wants to execute a specific S00-S15 session from AUDITENGINE_BUILD_BIBLE.md
arguments:
  - session
---

Run session $session now.
Copy the prompt exactly from AUDITENGINE_BUILD_BIBLE.md for that session and execute it.
Do not start until you have read BUILD_STATE.md and src/types/index.ts.
