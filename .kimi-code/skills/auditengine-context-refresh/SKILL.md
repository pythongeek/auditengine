---
name: auditengine-context-refresh
description: Refresh agent context mid-session to prevent drift or repetition
type: flow
whenToUse: When a session is running long and the agent seems to be forgetting earlier context, repeating work, or drifting from spec
arguments:
  - current_file
---

Context refresh.
Read these files again right now before continuing:
- BUILD_STATE.md
- src/types/index.ts
- $current_file
Summarize in 3 bullet points what we are doing this session and what is left.
Then continue.
