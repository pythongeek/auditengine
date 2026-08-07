---
name: auditengine-build-state-sync
description: Audit BUILD_STATE.md for accuracy against the actual codebase state
type: flow
whenToUse: When BUILD_STATE.md may have drifted from reality, e.g. items marked DONE that are broken or incomplete
---

Audit BUILD_STATE.md for accuracy.
For every file marked ✅ DONE:
- Check the file exists at the listed path
- Check npx tsc --noEmit passes for that file
- Check that every function listed in the session task for that file is implemented (not stubbed)
Update BUILD_STATE.md to reflect actual reality.
Report every item you changed the status of and why.
