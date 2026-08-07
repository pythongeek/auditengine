---
name: auditengine-redirect
description: Bring an AuditEngine session back into scope when it drifts
type: flow
whenToUse: When the agent creates extra files, refactors unasked code, changes types, or writes long explanations instead of code
arguments:
  - files
---

Stop. Revert any changes to files outside the current task scope.
The only file(s) you are allowed to change this session are: $files
Undo everything else and continue with only those files.
Run: git diff --name-only to show me what you've changed.
