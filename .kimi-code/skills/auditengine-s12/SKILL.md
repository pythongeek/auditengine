---
name: auditengine-s12
description: Run AuditEngine build session S12 from the build bible
type: flow
whenToUse: When the user wants to execute S12 of the AuditEngine build plan
---

ANTI-HALLUCINATION CONTRACT:
1. Read BUILD_STATE.md FIRST. S01-S11 must all be ✅.
2. Read src/types/index.ts fully before writing.
3. Read SPEC-08 (Visual QA Agent) from docs/.
4. Cloudflare Browser Run uses puppeteer from 'puppeteer-core'. Import:
   import puppeteer from "@cloudflare/puppeteer"
   This is the only browser automation import allowed.
   Do NOT import playwright, selenium, or any other browser library.
5. Visual QA Agent NEVER reads source files. It only tests the live staging URL.
6. Do not touch files outside this session.
7. Update BUILD_STATE.md after completing.

---

PROJECT: AuditEngine
SPEC REFERENCE: SPEC-08 (Visual QA Agent — Browser Test Algorithm)

---

TASK — src/workers/visual-qa.ts

Add to wrangler.toml if not present:
browser = { binding = "BROWSER" }
Add BROWSER: Fetcher to Env interface in src/types/index.ts

IMPLEMENT discoverRoutes(auditRunId, db): Promise<RouteInfo[]>
  4 discovery rules in priority order:
  1. repo_manifest files matching /app\/(.+)\/page\.(tsx|jsx|ts|js)$/ → Next.js app router
  2. repo_manifest files matching /pages\/(.+)\.(tsx|jsx|ts|js)$/ → Next.js pages router
  3. Files named router.ts/router.js/routes.ts/routes.js → mark for manual review (skip for now)
  4. Files containing "express()" or "new Hono()" → skip for now (log as info finding)

  For discovered routes:
  - path = "/" + match group 1 (replace [param] with :param)
  - is_admin = path starts with "/admin"
  - requires_auth = true (default — assume auth unless spec says otherwise)

IMPLEMENT buildQAScriptPrompt(route: RouteInfo, stagingUrl: string): string
  Template from SPEC-08 section 8.2 — exact output format.
  The prompt must include all RULES FOR SCRIPT GENERATION from the spec:
  - First step = navigate
  - Auth fill steps if auth_required
  - Assert after every action
  - Network request assert after every form submit
  - no_console_error assert at end

IMPLEMENT generateQAScript(route: RouteInfo, env: Env): Promise<QAStep[]>
  Call llmCall() with taskType:"visual_qa_script", messages with the script prompt
  Parse response as QAStep[] JSON
  Return empty array on parse failure + log error

IMPLEMENT executeQAScript(steps: QAStep[], stagingUrl: string, browser: Fetcher): Promise<StepResult[]>
  Launch puppeteer browser:
    const b = await puppeteer.launch(browser)
    const page = await b.newPage()
  For each step:
    "navigate" → page.goto(url)
    "click" → page.click(selector)
    "fill" → page.type(selector, value)
    "wait" → page.waitForTimeout(2000)
    "assert" → run the assert_type check:
      "http_status" → check page.url() and response code
      "dom_visible" → page.$$(selector).length > 0
      "dom_text" → check element text content
      "network_request" → page.waitForResponse() with URL pattern match
      "no_console_error" → check collected console errors
    If step.screenshot: await page.screenshot() → store in R2 as screenshots/{auditRunId}/{routePath}/{stepNumber}.png
  Collect StepResult for each step
  Close browser after all steps

IMPLEMENT qaStepToFinding(step, result, route): Finding
  Exact severity map from SPEC-08 section 8.3:
  no_network_request_on_submit → critical
  http_500 → critical
  blank_page_on_error → critical
  privilege_ui_visible → high
  stale_ui_after_action → medium
  console_error → medium
  default → low

IMPLEMENT runVisualQA(auditRunId: string, env: Env): Promise<void>
  1. discoverRoutes()
  2. For each route: generateQAScript() → executeQAScript()
  3. For each failed step: qaStepToFinding() → INSERT INTO findings

Update coordinator.ts: replace spawnVisualQA stub with import of runVisualQA.

---

SUCCESS CRITERIA:
□ npx tsc --noEmit passes
□ discoverRoutes parses Next.js app router paths correctly
□ qaStepToFinding maps no_network_request_on_submit to "critical"
□ Browser launched with puppeteer.launch(env.BROWSER)

SESSION END:
1. BUILD_STATE.md: visual-qa.ts ✅
2. SESSION_LOG.md
3. git commit -m "S12: visual QA agent"
