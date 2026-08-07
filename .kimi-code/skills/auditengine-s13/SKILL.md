---
name: auditengine-s13
description: Run AuditEngine build session S13 from the build bible
type: flow
whenToUse: When the user wants to execute S13 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S12 must all be ✅.
2. Read src/types/index.ts. Specifically DashboardEvent, DashboardEventType (12 event types).
3. Do not invent WebSocket APIs. Cloudflare DO WebSocket uses:
   this.ctx.acceptWebSocket(request) — returns WebSocket object
   this.ctx.getWebSockets() — returns WebSocket[]
   ws.send(string) — send message
   Do NOT use ws.on('message') — Durable Objects use webSocketMessage() method instead.
4. Do not touch files outside this session.
5. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-12 Phase E checklist

---

TASK 1 — src/dashboard/dashboard-do.ts

```typescript
import { DurableObject } from 'cloudflare:workers'
import type { Env, DashboardEvent } from '../types/index'

export class DashboardDurableObject extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  async fetch(request: Request): Promise<Response>
  // If Upgrade: websocket → accept WebSocket connection
  // If POST with JSON body → treat as broadcast event, distribute to all connected clients
  // Else → return 400

  broadcast(event: DashboardEvent): void
  // this.ctx.getWebSockets().forEach(ws => ws.send(JSON.stringify(event)))

  // Durable Object WebSocket event handlers:
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>
  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void>
  async webSocketError(ws: WebSocket, error: unknown): Promise<void>
}
```

TASK 2 — src/dashboard/index.html

Single HTML file with inline CSS and JS. No external dependencies.
Must handle all 12 DashboardEventType values:
  agent_spawned, agent_state_change, finding_created, gate_rejected, gate_passed,
  salvation_activated, salvation_complete, task_created, task_status_change,
  budget_alert, token_usage, audit_complete

Build these panels:
  PANEL 1: Agent Status Grid
    - One card per agent type (10 agents)
    - Show: current state, files processed, findings count
    - Updates on: agent_spawned, agent_state_change

  PANEL 2: Findings Feed (live scroll)
    - Shows last 50 findings as they arrive
    - Color-coded by severity: critical=red, high=orange, medium=yellow, low=blue, info=gray
    - Updates on: finding_created

  PANEL 3: Task Board (Kanban — 4 columns)
    - Backlog | In Progress | In Review | Done
    - Cards show: priority score, finding count, conflict flag (red badge if conflict)
    - Updates on: task_created, task_status_change

  PANEL 4: Budget Tracker
    - Progress bar: spent / total USD
    - Color: green → yellow at 50% → orange at 80% → red at 95%
    - Token usage table: model | calls | tokens | cost
    - Updates on: token_usage, budget_alert

  PANEL 5: Salvation Reports (collapsible)
    - Shows each salvation: file, attempts, research sources, human recommendation
    - Updates on: salvation_activated, salvation_complete

WebSocket connection logic:
  const ws = new WebSocket(location.href.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws')
  ws.onmessage = (e) => { const event = JSON.parse(e.data); handleEvent(event) }
  Reconnect on close: setTimeout(() => reconnect(), 3000)

UI rules:
  - No frameworks, no build step — plain HTML/CSS/JS only
  - Dark theme (background #111, text #e5e5e5)
  - Must work in browser without any bundling
  - Critical findings: red border flash animation on finding_created
  - budget_alert at 95%: full-screen overlay warning

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes for dashboard-do.ts
□ DashboardDurableObject extends DurableObject
□ broadcast() calls this.ctx.getWebSockets().forEach(ws => ws.send(...))
□ webSocketMessage() handler exists
□ index.html handles all 12 event types
□ index.html connects via WebSocket on page load

SESSION END:
1. BUILD_STATE.md: dashboard-do.ts ✅, index.html ✅
2. SESSION_LOG.md
3. git commit -m "S13: dashboard DO + frontend"
