---
name: auditengine-revert
description: Revert specific incorrect changes in an AuditEngine session
type: flow
whenToUse: When only a specific block or function needs to be rolled back, not the entire session
arguments:
  - file
  - change
  - restore
---

Revert these specific changes:
File: $file
Change to revert: $change
Restore it to: $restore
Do not change anything else.
