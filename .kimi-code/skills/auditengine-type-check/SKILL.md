---
name: auditengine-type-check
description: Run the TypeScript type check for AuditEngine and fix all errors
type: flow
whenToUse: Whenever the user is unsure whether AuditEngine code compiles, especially before marking files DONE
---

Run: npx tsc --noEmit
Show me the full output.
Fix every error before we continue.
Do not mark any file as ✅ DONE until this passes clean.
