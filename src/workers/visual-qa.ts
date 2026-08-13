import puppeteer from '@cloudflare/puppeteer'
import type { Env, Finding, QAStep, StepResult, RouteInfo } from '../types/index'
import { llmCall } from '../lib/llm-gateway'

export async function discoverRoutes(auditRunId: string, db: D1Database): Promise<RouteInfo[]> {
  const rows = await db
    .prepare('SELECT file_path FROM repo_manifest WHERE audit_run_id = ?')
    .bind(auditRunId)
    .all<{ file_path: string }>()

  const routes: RouteInfo[] = []

  for (const { file_path } of rows.results ?? []) {
    const fp = file_path
    const lower = fp.toLowerCase()

    // Skip manual-review route files for now
    if (/\b(router|routes)\.(ts|js)$/.test(fp)) {
      continue
    }

    // Log frameworks we cannot auto-discover
    if (lower.includes('express()') || lower.includes('new hono()')) {
      continue
    }

    // Next.js app router
    const appMatch = fp.match(/app\/(.+)\/page\.(tsx|jsx|ts|js)$/)
    if (appMatch) {
      const path = '/' + appMatch[1].replace(/\[(.+?)\]/g, ':$1')
      routes.push({
        path,
        source_file: fp,
        is_admin: path.startsWith('/admin'),
        requires_auth: true,
      })
      continue
    }

    // Next.js pages router
    const pagesMatch = fp.match(/pages\/(.+)\.(tsx|jsx|ts|js)$/)
    if (pagesMatch) {
      const base = pagesMatch[1]
      if (base === '_app' || base === '_document') continue
      const path = '/' + base.replace(/\[(.+?)\]/g, ':$1').replace(/\/index$/, '')
      routes.push({
        path: path === '/' ? '/' : path,
        source_file: fp,
        is_admin: path.startsWith('/admin'),
        requires_auth: true,
      })
    }
  }

  return routes
}

export function buildQAScriptPrompt(route: RouteInfo, stagingUrl: string): string {
  return `## VISUAL QA SCRIPT GENERATION

Route: ${route.path}
Source file: ${route.source_file}
Staging URL base: ${stagingUrl}
Is admin route: ${route.is_admin}
Requires auth: ${route.requires_auth}

Generate a JSON array of QA steps. Each step must be an object with:
- "step_number": integer starting at 1
- "action": one of "navigate", "click", "fill", "submit", "wait", "assert"
- "selector": CSS selector or null
- "value": string value or null
- "url": full URL or null
- "assert_type": one of "http_status", "dom_visible", "dom_text", "network_request", "no_console_error" or null
- "assert_expected": expected string or null
- "screenshot": boolean

Rules:
1. First step must be "navigate" to the route URL.
2. If auth is required, include fill steps for credentials before submitting.
3. Add an "assert" step after every action.
4. After every form submit, add a "network_request" assert.
5. The final step must be a "no_console_error" assert.
6. Take screenshots on critical steps (first load, after submit, on errors).

Output ONLY the JSON array. No prose.
`
}

export async function generateQAScript(route: RouteInfo, env: Env): Promise<QAStep[]> {
  const db = env.DB
  const prompt = buildQAScriptPrompt(route, env.STAGING_URL)

  const response = await llmCall({
    agentId: `visual-qa-${route.path}`,
    agentType: 'visual_qa',
    taskType: 'visual_qa_script',
    messages: [{ role: 'user', content: prompt }],
    auditRunId: 'visual-qa',
    db,
    broadcast: () => {},
  }, env)

  try {
    const cleaned = response.text
      .replace(/^```json\s*/m, '')
      .replace(/^```\s*/m, '')
      .trim()
    const steps = JSON.parse(cleaned) as QAStep[]
    if (!Array.isArray(steps)) throw new Error('QA script is not an array')
    return steps
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'parse error'
    await db
      .prepare(`
        INSERT INTO agent_errors (audit_run_id, agent_id, error_type, error_msg, file_path)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind('visual-qa', 'visual-qa-agent', 'qa_script_parse_error', msg, route.source_file)
      .run()
    return []
  }
}

export async function executeQAScript(
  steps: QAStep[],
  stagingUrl: string,
  browser: Fetcher
): Promise<StepResult[]> {
  const b = await puppeteer.launch(browser)
  const page = await b.newPage()

  const consoleErrors: string[] = []
  page.on('console', (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  const results: StepResult[] = []
  let lastResponse: { status: () => number } | null = null

  for (const step of steps) {
    let passed = true
    let failure_type: string | null = null
    let actual: string | null = null
    let description = `Step ${step.step_number}: ${step.action}`
    let impact = ''
    let screenshotId: string | null = null

    try {
      switch (step.action) {
        case 'navigate': {
          const url = step.url ?? `${stagingUrl}${step.url ?? '/'}`
          lastResponse = await page.goto(url, { waitUntil: 'networkidle2' })
          description = `Navigated to ${url}`
          break
        }
        case 'click': {
          if (step.selector) {
            await page.click(step.selector)
            description = `Clicked ${step.selector}`
          }
          break
        }
        case 'fill': {
          if (step.selector && step.value !== null) {
            await page.type(step.selector, step.value)
            description = `Filled ${step.selector}`
          }
          break
        }
        case 'submit': {
          if (step.selector) {
            await page.click(step.selector)
            description = `Submitted ${step.selector}`
          }
          break
        }
        case 'wait': {
          await page.waitForTimeout(2000)
          description = 'Waited 2000ms'
          break
        }
        case 'assert': {
          description = `Assert ${step.assert_type} = ${step.assert_expected}`
          switch (step.assert_type) {
            case 'http_status': {
              const status = lastResponse?.status() ?? 0
              actual = String(status)
              if (step.assert_expected && status !== parseInt(step.assert_expected, 10)) {
                passed = false
                failure_type = 'http_status'
                impact = `Expected HTTP ${step.assert_expected}, got ${status}`
              }
              break
            }
            case 'dom_visible': {
              if (step.selector) {
                const elements = await page.$$(step.selector)
                actual = String(elements.length)
                if (elements.length === 0) {
                  passed = false
                  failure_type = 'dom_visible'
                  impact = `Element ${step.selector} not found`
                }
              }
              break
            }
            case 'dom_text': {
              if (step.selector) {
                const text = await page.$eval(step.selector, (el: Element) => (el as HTMLElement).textContent)
                actual = text
                if (step.assert_expected && text !== step.assert_expected) {
                  passed = false
                  failure_type = 'dom_text'
                  impact = `Expected "${step.assert_expected}", got "${text}"`
                }
              }
              break
            }
            case 'network_request': {
              if (step.assert_expected) {
                try {
                  await page.waitForResponse(step.assert_expected, { timeout: 5000 })
                } catch {
                  passed = false
                  failure_type = 'no_network_request_on_submit'
                  impact = `Expected network request matching ${step.assert_expected}`
                }
              }
              break
            }
            case 'no_console_error': {
              actual = JSON.stringify(consoleErrors)
              if (consoleErrors.length > 0) {
                passed = false
                failure_type = 'console_error'
                impact = `Console errors: ${consoleErrors.join('; ')}`
              }
              consoleErrors.length = 0
              break
            }
          }
          break
        }
      }

      if (step.screenshot) {
        screenshotId = `visual-qa/${Date.now()}-${step.step_number}.png`
      }
    } catch (err) {
      passed = false
      failure_type = step.action
      actual = err instanceof Error ? err.message : 'unknown error'
      impact = actual
      if (step.action === 'navigate') {
        failure_type = 'blank_page_on_error'
      }
    }

    results.push({
      passed,
      failure_type,
      actual,
      description,
      impact: impact || (passed ? '' : 'Step failed'),
      screenshot_id: screenshotId,
    })
  }

  await b.close()
  return results
}

export function qaStepToFinding(step: QAStep, result: StepResult, route: RouteInfo): Finding {
  const severityMap: Record<string, Finding['severity']> = {
    no_network_request_on_submit: 'critical',
    http_500: 'critical',
    blank_page_on_error: 'critical',
    privilege_ui_visible: 'high',
    stale_ui_after_action: 'medium',
    console_error: 'medium',
  }

  return {
    finding_id: `visual-qa-${route.path}-${step.step_number}-${Date.now()}`,
    audit_run_id: 'visual-qa',
    agent_id: 'visual-qa-agent',
    agent_type: 'visual_qa',
    severity: severityMap[result.failure_type ?? ''] ?? 'low',
    category: result.failure_type ?? 'visual_qa_failure',
    file: route.source_file,
    line_range: null,
    evidence_quote: `${step.action}: ${result.description}`,
    description: result.description,
    impact: result.impact,
    verified_by: [],
    source: 'visual_qa',
    status: 'open',
    recurrence_count: 0,
    is_regression: false,
    ts: Date.now(),
    verified_at: null,
    screenshot_id: result.screenshot_id,
  }
}

export async function runVisualQA(auditRunId: string, env: Env): Promise<void> {
  const db = env.DB
  const routes = await discoverRoutes(auditRunId, db)

  for (const route of routes) {
    const steps = await generateQAScript(route, env)
    if (steps.length === 0) continue

    const results = await executeQAScript(steps, env.STAGING_URL, env.BROWSER)

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (!result.passed) {
        const finding = qaStepToFinding(steps[i], result, route)
        await db
          .prepare(`
            INSERT INTO findings (
              finding_id, audit_run_id, agent_id, agent_type, severity, category,
              file, line_range_start, line_range_end, evidence_quote, description,
              impact, verified_by, source, status, recurrence_count, ts, verified_at, screenshot_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            finding.finding_id,
            finding.audit_run_id,
            finding.agent_id,
            finding.agent_type,
            finding.severity,
            finding.category,
            finding.file,
            null,
            null,
            finding.evidence_quote,
            finding.description,
            finding.impact,
            JSON.stringify(finding.verified_by),
            finding.source,
            finding.status,
            finding.recurrence_count,
            finding.ts,
            finding.verified_at,
            finding.screenshot_id
          )
          .run()
      }
    }
  }
}
