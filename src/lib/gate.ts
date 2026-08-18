import type { GateResult, GateContext, ValidatedFinding } from '../types/index'
import { getChunk, makeChunkKey, sha256Hex } from './r2-storage'
import { getAgentConfig } from './agent-config'
import { redactForStorage } from './secrets'

const BANNED_PHRASES = [
  "production ready", "looks good", "should work", "seems correct",
  "appears to", "likely works", "no issues found", "clean code",
  "well structured", "everything looks", "i believe", "i think",
  "in my opinion", "great job", "nicely done", "impressive"
]

const SPECULATIVE_PHRASES = [
  "the code appears to", "it appears to", "appears to be",
  "it seems that", "it seems like", "seems to be",
  "looks like it", "looks as if"
]

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info'])

// Expected fields in an agent-produced finding. Extra fields are rejected by the Schema Gate.
const EXPECTED_AGENT_FIELDS = new Set([
  'finding_id', 'severity', 'category', 'file', 'line_range',
  'evidence_quote', 'description', 'impact', 'verified_by'
])

const MIN_EVIDENCE_LENGTH = 10
const HIGH_SEVERITY_MIN_EVIDENCE_LENGTH = 50
const HIGH_SEVERITY_MIN_IMPACT_LENGTH = 30
const FUZZY_DISTANCE_THRESHOLD = 3

function normalizeEvidence(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function levenshteinWithin(text: string, pattern: string, maxDistance: number): boolean {
  const m = pattern.length
  const n = text.length

  if (m === 0) return true
  if (m > n) return false

  let prev = new Array(m + 1).fill(0)
  for (let i = 0; i <= m; i++) {
    prev[i] = i
  }

  for (let j = 0; j < n; j++) {
    const curr = new Array(m + 1).fill(maxDistance + 1)
    curr[0] = 0
    for (let i = 1; i <= m; i++) {
      const cost = pattern[i - 1] === text[j] ? 0 : 1
      curr[i] = Math.min(
        prev[i] + 1,
        curr[i - 1] + 1,
        prev[i - 1] + cost
      )
    }
    if (curr[m] <= maxDistance) return true
    prev = curr
  }

  return false
}

function looseMatch(text: string, pattern: string): boolean {
  return normalizeEvidence(text).includes(normalizeEvidence(pattern))
}

function fuzzyMatch(text: string, pattern: string): boolean {
  return levenshteinWithin(text, pattern, FUZZY_DISTANCE_THRESHOLD)
}

type EvidenceMatch = false | 'exact' | 'fuzzy'

async function evidenceInR2(
  tenantId: string,
  auditRunId: string,
  filePath: string,
  evidenceQuote: string,
  r2: R2Bucket,
  chunkCache?: Map<string, string>
): Promise<EvidenceMatch> {
  for (let index = 0; index < 100; index++) {
    const filePathHash = await sha256Hex(filePath)
    const key = makeChunkKey(tenantId, auditRunId, filePathHash, index)
    let text: string | null = null
    if (chunkCache?.has(key)) {
      text = chunkCache.get(key) ?? null
    }
    if (text === null) {
      const chunkObj = await getChunk(tenantId, auditRunId, filePath, index, r2)
      if (chunkObj === null) break
      text = await chunkObj.text()
      chunkCache?.set(key, text)
    }
    if (text.includes(evidenceQuote)) return 'exact'
    if (looseMatch(text, evidenceQuote)) return 'fuzzy'
    if (fuzzyMatch(text, evidenceQuote)) return 'fuzzy'
  }
  return false
}

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
  const tenantId = ctx.tenantId ?? ''
  const agentConfig = await getAgentConfig(db, tenantId, ctx.agentType)
  const skipEvidence = !agentConfig.evidence_required

  for (const item of parsed) {
    // ── Schema Gate ────────────────────────────────────────────────────────
    if (typeof item !== 'object' || item === null) {
      return {
        passed: false,
        findings: [],
        reason: 'Schema Gate: finding is not an object.',
        rejected_phrases: [],
      }
    }

    const f = item as Record<string, unknown>

    const missing = Array.from(EXPECTED_AGENT_FIELDS).filter(field => f[field] === undefined)
    if (missing.length > 0) {
      return {
        passed: false,
        findings: [],
        reason: `Schema Gate: missing required field(s): ${missing.join(', ')}.`,
        rejected_phrases: [],
      }
    }

    const extraFields = Object.keys(f).filter(key => !EXPECTED_AGENT_FIELDS.has(key))
    if (extraFields.length > 0) {
      return {
        passed: false,
        findings: [],
        reason: `Schema Gate: unexpected field(s): ${extraFields.join(', ')}.`,
        rejected_phrases: [],
      }
    }

    const severity = String(f.severity)
    if (!VALID_SEVERITIES.has(severity)) {
      return {
        passed: false,
        findings: [],
        reason: `Schema Gate: invalid severity: ${severity}.`,
        rejected_phrases: [],
      }
    }

    // ── Evidence Gate ──────────────────────────────────────────────────────
    const evidenceQuote = String(f.evidence_quote)
    let evidenceMatch: EvidenceMatch = false

    if (!skipEvidence) {
      if (evidenceQuote.length === 0) {
        return {
          passed: false,
          findings: [],
          reason: 'Evidence Gate: evidence_quote is empty.',
          rejected_phrases: [],
        }
      }

      if (evidenceQuote.length < MIN_EVIDENCE_LENGTH) {
        return {
          passed: false,
          findings: [],
          reason: `Evidence Gate: evidence_quote must be at least ${MIN_EVIDENCE_LENGTH} characters (got ${evidenceQuote.length}).`,
          rejected_phrases: [],
        }
      }

      const evidenceLower = evidenceQuote.toLowerCase()
      const speculativeHit = SPECULATIVE_PHRASES.find(p => evidenceLower.includes(p.toLowerCase()))
      if (speculativeHit) {
        return {
          passed: false,
          findings: [],
          reason: `Evidence Gate: evidence_quote contains speculative phrasing "${speculativeHit}".`,
          rejected_phrases: [speculativeHit],
        }
      }

      evidenceMatch = await evidenceInR2(tenantId, ctx.auditRunId, ctx.currentFile, evidenceQuote, ctx.r2, ctx.chunkCache)
      if (!evidenceMatch) {
        return {
          passed: false,
          findings: [],
          reason: `Evidence Gate: EVIDENCE_NOT_FOUND — evidence_quote not found in stored R2 chunks for ${ctx.currentFile}.`,
          rejected_phrases: [],
        }
      }
    }

    // ── Severity Gate ──────────────────────────────────────────────────────
    if ((severity === 'critical' || severity === 'high')) {
      if (evidenceQuote.length < HIGH_SEVERITY_MIN_EVIDENCE_LENGTH) {
        return {
          passed: false,
          findings: [],
          reason: `Severity Gate: critical/high evidence_quote must be at least ${HIGH_SEVERITY_MIN_EVIDENCE_LENGTH} characters (got ${evidenceQuote.length}).`,
          rejected_phrases: [],
        }
      }

      const impactLength = String(f.impact ?? '').length
      if (impactLength < HIGH_SEVERITY_MIN_IMPACT_LENGTH) {
        return {
          passed: false,
          findings: [],
          reason: `Severity Gate: impact is required for ${severity} severity and must be at least ${HIGH_SEVERITY_MIN_IMPACT_LENGTH} characters (got ${impactLength}).`,
          rejected_phrases: [],
        }
      }
    }

    // ── Cross-Reference Gate ───────────────────────────────────────────────
    const fileRecord = await db
      .prepare('SELECT 1 FROM files WHERE audit_run_id = ? AND path = ? LIMIT 1')
      .bind(ctx.auditRunId, ctx.currentFile)
      .first()

    if (!fileRecord) {
      return {
        passed: false,
        findings: [],
        reason: `Cross-Reference Gate: file ${ctx.currentFile} is not present in the files table.`,
        rejected_phrases: [],
      }
    }

    const file = String(f.file)
    if (file !== ctx.currentFile) {
      return {
        passed: false,
        findings: [],
        reason: `Cross-Reference Gate: file must match current file. Expected ${ctx.currentFile}, got ${file}.`,
        rejected_phrases: [],
      }
    }

    const lineRange = Array.isArray(f.line_range) && f.line_range.length === 2
      ? [Number(f.line_range[0]), Number(f.line_range[1])] as [number, number]
      : null

    const verifiedBy = Array.isArray(f.verified_by)
      ? f.verified_by.map(v => String(v))
      : []
    if (evidenceMatch) {
      verifiedBy.push(evidenceMatch === 'exact' ? 'evidence_verified:exact' : 'evidence_verified:fuzzy')
    }

    const redactedEvidenceQuote = await redactForStorage(evidenceQuote)

    const finding: ValidatedFinding = {
      finding_id:      String(f.finding_id),
      audit_run_id:    ctx.auditRunId,
      agent_id:        ctx.agentId,
      agent_type:      ctx.agentType,
      severity:        severity as ValidatedFinding['severity'],
      category:        String(f.category),
      file:            file,
      line_range:      lineRange,
      evidence_quote:  redactedEvidenceQuote,
      description:     String(f.description),
      impact:          f.impact === undefined || f.impact === null ? null : String(f.impact),
      verified_by:     verifiedBy,
      source:          'agent',
      status:          'open',
      recurrence_count: 0,
      is_regression:   false,
      ts:              Date.now(),
      verified_at:     null,
      screenshot_id:   null,
    }

    // CHECK 5: Duplicate detection
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
