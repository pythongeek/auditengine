import type { GateResult, GateContext, ValidatedFinding } from '../types/index'

const BANNED_PHRASES = [
  "production ready", "looks good", "should work", "seems correct",
  "appears to", "likely works", "no issues found", "clean code",
  "well structured", "everything looks", "i believe", "i think",
  "in my opinion", "great job", "nicely done", "impressive"
]

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info'])

export async function runGate(
  rawOutput: string,
  ctx: GateContext,
  db: D1Database
): Promise<GateResult> {

  // CHECK 1: Banned phrase scan
  const lower = rawOutput.toLowerCase()
  const rejected = BANNED_PHRASES.filter(phrase => lower.includes(phrase.toLowerCase()))
  if (rejected.length > 0) {
    const list = rejected.map(p => `"${p}"`).join(', ')
    return {
      passed: false,
      findings: [],
      reason: `Banned phrase(s) detected: ${list}. Remove and resubmit.`,
      rejected_phrases: rejected,
    }
  }

  // CHECK 2: JSON parsability
  const cleaned = rawOutput
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return {
      passed: false,
      findings: [],
      reason: 'Output is not valid JSON.',
      rejected_phrases: [],
    }
  }

  if (!Array.isArray(parsed)) {
    return {
      passed: false,
      findings: [],
      reason: 'Parsed JSON is not a JSON array.',
      rejected_phrases: [],
    }
  }

  if (parsed.length === 0) {
    return { passed: true, findings: [], reason: null, rejected_phrases: [] }
  }

  const validated: ValidatedFinding[] = []

  for (const item of parsed) {
    // CHECK 3: Schema validation
    if (typeof item !== 'object' || item === null) {
      return {
        passed: false,
        findings: [],
        reason: 'Finding is not an object.',
        rejected_phrases: [],
      }
    }

    const f = item as Record<string, unknown>

    const requiredFields = ['finding_id', 'severity', 'category', 'file', 'evidence_quote', 'description', 'verified_by']
    const missing = requiredFields.filter(field => f[field] === undefined)
    if (missing.length > 0) {
      return {
        passed: false,
        findings: [],
        reason: `Missing required field(s): ${missing.join(', ')}.`,
        rejected_phrases: [],
      }
    }

    const severity = String(f.severity)
    if (!VALID_SEVERITIES.has(severity)) {
      return {
        passed: false,
        findings: [],
        reason: `Invalid severity: ${severity}.`,
        rejected_phrases: [],
      }
    }

    const evidenceQuote = String(f.evidence_quote)
    if (evidenceQuote.length < 8) {
      return {
        passed: false,
        findings: [],
        reason: 'evidence_quote must be at least 8 characters.',
        rejected_phrases: [],
      }
    }

    if (!ctx.currentFileContent.includes(evidenceQuote)) {
      return {
        passed: false,
        findings: [],
        reason: `evidence_quote not found in file content: ${evidenceQuote.slice(0, 50)}...`,
        rejected_phrases: [],
      }
    }

    const file = String(f.file)
    if (file !== ctx.currentFile) {
      return {
        passed: false,
        findings: [],
        reason: `file must match current file. Expected ${ctx.currentFile}, got ${file}.`,
        rejected_phrases: [],
      }
    }

    if ((severity === 'critical' || severity === 'high') && String(f.impact ?? '').length < 20) {
      return {
        passed: false,
        findings: [],
        reason: `impact is required for ${severity} severity and must be at least 20 characters.`,
        rejected_phrases: [],
      }
    }

    const lineRange = Array.isArray(f.line_range) && f.line_range.length === 2
      ? [Number(f.line_range[0]), Number(f.line_range[1])] as [number, number]
      : null

    const verifiedBy = Array.isArray(f.verified_by)
      ? f.verified_by.map(v => String(v))
      : []

    const finding: ValidatedFinding = {
      finding_id:      String(f.finding_id),
      audit_run_id:    ctx.auditRunId,
      agent_id:        ctx.agentId,
      agent_type:      ctx.agentType,
      severity:        severity as ValidatedFinding['severity'],
      category:        String(f.category),
      file:            file,
      line_range:      lineRange,
      evidence_quote:  evidenceQuote,
      description:     String(f.description),
      impact:          f.impact === undefined || f.impact === null ? null : String(f.impact),
      verified_by:     verifiedBy,
      source:          (f.source as ValidatedFinding['source']) ?? 'agent',
      status:          (f.status as ValidatedFinding['status']) ?? 'open',
      recurrence_count: Number(f.recurrence_count ?? 0),
      ts:              Number(f.ts ?? Date.now()),
      verified_at:     f.verified_at === undefined || f.verified_at === null ? null : Number(f.verified_at),
      screenshot_id:   f.screenshot_id === undefined || f.screenshot_id === null ? null : String(f.screenshot_id),
    }

    // CHECK 4: Duplicate detection
    const duplicate = await db
      .prepare('SELECT finding_id FROM findings WHERE audit_run_id = ? AND file = ? AND evidence_quote = ?')
      .bind(ctx.auditRunId, finding.file, finding.evidence_quote)
      .first<{ finding_id: string }>()

    if (duplicate) {
      await db
        .prepare('UPDATE findings SET recurrence_count = recurrence_count + 1 WHERE finding_id = ?')
        .bind(duplicate.finding_id)
        .run()
      continue
    }

    validated.push(finding)
  }

  return { passed: true, findings: validated, reason: null, rejected_phrases: [] }
}
