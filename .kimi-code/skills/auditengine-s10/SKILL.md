---
name: auditengine-s10
description: Run AuditEngine build session S10 from the build bible
type: flow
whenToUse: When the user wants to execute S10 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S09 must all be ✅.
2. Read src/types/index.ts before writing any code.
3. Read SPEC-10 (Verification Agent) from docs/.
4. GitHub API used: GET /repos/{owner}/{repo}/commits/{sha} — this is the real endpoint.
   Do not invent other GitHub endpoints.
5. Do not touch files outside this session.
6. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-10 (Verification Agent — Diff Check Algorithm)

---

TASK — src/workers/verification.ts

IMPLEMENT fetchDiff(commitSha, githubToken):
  URL: https://api.github.com/repos/{owner}/{repo}/commits/{sha}
  Wait — the owner and repo must come from somewhere. Use SYSTEM_SPEC.md fields.
  For now: accept owner and repo as function parameters.
  Headers: Authorization: Bearer {token}, Accept: application/vnd.github.v3+json
  Return the parsed JSON response (commits endpoint returns diff in files[].patch)
  If response.status !== 200: return null

IMPLEMENT verifyTask(task, env) — 6 steps from spec:
  Step 1: fetchDiff(task.commit_sha, env.GITHUB_TOKEN)
  Step 2: Load all findings linked to task.finding_ids (parse JSON array from D1 tasks row)
  Step 3: For each finding:
    - Find its file in diff.files by filename match
    - If file not in diff: resolved=false, reason="File not modified in commit diff"
    - Check if evidence_quote still appears in the AFTER state:
      lines starting with "+" in the patch that include the evidence_quote.trim()
    - resolved = evidence_quote NOT present in after state
  Step 4: Determine taskResult:
    - All resolved → "resolved"
    - None resolved → "failed_verification"
    - Mixed → "needs_revision"
  Step 5: If "resolved": call scheduleRegressionScan() — stub for now
  Step 6: If "failed_verification": escalateSeverity() for each finding
           escalateSeverity: critical stays critical, others go up one level

IMPLEMENT recalcProductionScore(auditRunId, db):
  Formula: (count of critical+high findings with status='resolved' AND verified_at IS NOT NULL)
         / (total count of critical+high findings) × 100
  Clamp to 0–100
  UPDATE run_budget SET production_score=? WHERE audit_run_id=?

IMPLEMENT escalateSeverity(findingId, db):
  Severity ladder: info→low→medium→high→critical
  UPDATE findings SET severity=[next level] WHERE finding_id=?

Export: verifyTask, recalcProductionScore

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ verifyTask() returns "resolved" when evidence_quote not in diff after-state
□ verifyTask() returns "failed_verification" when evidence_quote still in after-state
□ escalateSeverity() moves medium → high

SESSION END:
1. BUILD_STATE.md: verification.ts ✅
2. SESSION_LOG.md
3. git commit -m "S10: verification agent"
