---
name: auditengine-hard-stop
description: Halt an AuditEngine session that has gone off the rails with wrong APIs, model names, or schema changes
type: flow
whenToUse: When the agent uses wrong APIs, invented model names, renames D1 columns, or calls LLMs directly outside the gateway
---

Stop immediately. Do not write any more code.
Run: git diff HEAD
Show me the full diff output.
Do not explain or justify anything — just show the diff.
I will tell you what to revert.
