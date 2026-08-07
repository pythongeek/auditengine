# AuditEngine — Claude Code Standing Orders
# This file is read automatically by Claude Code on every session start.
# Do not delete. Do not move. Keep it in the project root.

## WHAT THIS PROJECT IS
AuditEngine is a multi-agent codebase audit platform running on Cloudflare Workers.
10 specialist AI agents run in parallel Durable Objects, analyze files from R2,
write findings to D1, coordinate through a Coordinator DO, and stream results to
a WebSocket dashboard. Stack: TypeScript + Cloudflare Workers + D1 + R2 + Durable Objects + Browser Run.

## YOUR MANDATORY FIRST ACTIONS — EVERY SESSION, NO EXCEPTIONS
1. Read BUILD_STATE.md — understand what is done, what is in progress, what is pending
2. Read src/types/index.ts — this is the only source of truth for all types and interfaces
3. Read the specific file(s) listed in the task before writing anything to them
Do not write a single line of code before completing steps 1, 2, and 3.

## HARD RULES — NEVER VIOLATE THESE

**Types:** Never add, rename, or remove fields in src/types/index.ts unless
the task explicitly says "update types/index.ts". Changing types breaks every
file that imports them. If you think a type needs changing, stop and ask.

**APIs:** Never invent Cloudflare Workers API methods. The only valid D1 methods are:
  db.prepare(sql).bind(...args).run()
  db.prepare(sql).bind(...args).first()
  db.prepare(sql).bind(...args).all()
  db.batch([...statements])
The only valid R2 methods are: r2.put(key, body), r2.get(key), r2.list({ prefix })
The only valid DO methods are: env.DO_NAME.idFromName(str), env.DO_NAME.get(id), stub.fetch(req)
WebSocket in DOs: ctx.acceptWebSocket(req), ctx.getWebSockets(), webSocketMessage(), webSocketClose()
If you are unsure about any other Cloudflare API: write
  // TODO: VERIFY CLOUDFLARE API — DO NOT GUESS
and leave the line incomplete. Do not guess.

**Models:** The only valid model names in this project are:
  kimi-k3 | kimi-k2.6 | minimax-m3
Do not use claude-*, gpt-*, gemini-*, or any other model name anywhere.

**Scope:** Do not create, modify, or delete any file not listed in the current session task.
If you think another file needs changing to make things work, stop and say:
  SCOPE QUESTION: I think I need to also change [file] because [reason]. Should I?

**Banned output patterns:** Never write these phrases anywhere in code, comments, or findings:
  production ready | looks good | should work | seems correct | appears to |
  likely works | no issues found | clean code | well structured | everything looks

**D1 column names:** Never rename a D1 column. The schema in src/db/schema.sql is
the source of truth. If a column name in your code doesn't match the schema, fix
the code, not the schema.

**LLM calls:** All external model API calls go through src/lib/llm-gateway.ts llmCall()
only. No direct fetch() to any model provider endpoint anywhere else in the codebase.

## WHEN YOU ARE UNCERTAIN
Say one of these — do not guess:
- "SPEC CONFLICT DETECTED: [describe it]" — when this task contradicts the spec
- "SCOPE QUESTION: [describe it]" — when you think another file needs changing
- "VERIFY CLOUDFLARE API: [describe it]" — when you're unsure about a runtime API
- "TYPE QUESTION: [describe it]" — when you think a type in index.ts is wrong or missing

## SESSION END PROTOCOL — ALWAYS DO THESE BEFORE SAYING YOU ARE DONE
1. Run: npx tsc --noEmit — fix all errors before proceeding
2. Update BUILD_STATE.md:
   - Mark completed files as ✅ DONE
   - Mark partial files as ⚠️ PARTIAL with a note on what is missing
   - Add an entry to the SESSION LOG table at the bottom
3. Say: "SESSION COMPLETE. Files changed: [list]. BUILD_STATE.md updated. Ready to commit."
   Do not commit yourself — the human reviews and commits.

## WHAT "DONE" MEANS
A file is ✅ DONE only when ALL of these are true:
- The file exists at the correct path
- npx tsc --noEmit passes with no errors referencing this file
- Every function listed in the session task is implemented (not stubbed, not TODO)
- The success criteria checkboxes in the session prompt are all satisfied
If any of these are false, the status is ⚠️ PARTIAL.
