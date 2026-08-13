import { describe, it, expect } from 'vitest'
import { runGate } from '../src/lib/gate'
import { mockD1, makeGateContext } from './helpers'

function makeFinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    finding_id: 'F-001',
    severity: 'medium',
    category: 'auth',
    file: 'src/auth.ts',
    line_range: [1, 5],
    evidence_quote: 'const token = req.headers.authorization',
    description: 'Authorization header is read but not validated.',
    impact: 'An attacker could send arbitrary tokens and bypass authentication checks.',
    verified_by: [],
    ...overrides,
  }
}

describe('runGate', () => {
  it('rejects banned phrase "production ready"', async () => {
    const ctx = makeGateContext()
    const result = await runGate('production ready code here', ctx, mockD1())
    expect(result.passed).toBe(false)
    expect(result.rejected_phrases).toContain('production ready')
  })

  it('passes empty JSON array', async () => {
    const ctx = makeGateContext()
    const result = await runGate('[]', ctx, mockD1())
    expect(result.passed).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('rejects non-array JSON', async () => {
    const ctx = makeGateContext()
    const result = await runGate('{"finding": "x"}', ctx, mockD1())
    expect(result.passed).toBe(false)
    expect(result.reason).toMatch(/not a JSON array/i)
  })

  it('strips markdown fences before parsing', async () => {
    const ctx = makeGateContext()
    const result = await runGate('```json\n[]\n```', ctx, mockD1())
    expect(result.passed).toBe(true)
  })

  describe('Schema Gate', () => {
    it('rejects finding with missing required field', async () => {
      const ctx = makeGateContext()
      const input = JSON.stringify([{ ...makeFinding(), evidence_quote: undefined }])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(false)
      expect(result.reason).toMatch(/Schema Gate/i)
    })

    it('rejects finding with extra fields', async () => {
      const ctx = makeGateContext()
      const input = JSON.stringify([makeFinding({ extra_field: 'not allowed' })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(false)
      expect(result.reason).toMatch(/unexpected field/i)
    })

    it('rejects invalid severity', async () => {
      const ctx = makeGateContext()
      const input = JSON.stringify([makeFinding({ severity: 'urgent' })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(false)
      expect(result.reason).toMatch(/invalid severity/i)
    })
  })

  describe('Evidence Gate', () => {
    it('rejects empty evidence_quote', async () => {
      const ctx = makeGateContext()
      const input = JSON.stringify([makeFinding({ evidence_quote: '' })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(false)
      expect(result.reason).toMatch(/evidence_quote is empty/i)
    })

    it('rejects evidence_quote shorter than 10 characters', async () => {
      const ctx = makeGateContext()
      const input = JSON.stringify([makeFinding({ evidence_quote: 'short' })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(false)
      expect(result.reason).toMatch(/at least 10 characters/i)
    })

    it('rejects speculative phrasing in evidence_quote', async () => {
      const ctx = makeGateContext()
      const input = JSON.stringify([makeFinding({
        evidence_quote: 'it seems that the token is missing'
      })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(false)
      expect(result.reason).toMatch(/speculative phrasing/i)
    })

    it('rejects evidence_quote not found in R2 chunks', async () => {
      const ctx = makeGateContext({
        currentFileContent: 'const token = req.headers.authorization',
      })
      const input = JSON.stringify([makeFinding({ evidence_quote: 'this text is not in the file' })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(false)
      expect(result.reason).toMatch(/not found in stored R2 chunks/i)
    })

    it('passes valid finding with evidence in R2', async () => {
      const ctx = makeGateContext({
        currentFileContent: 'const token = req.headers.authorization',
      })
      const input = JSON.stringify([makeFinding()])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(true)
      expect(result.findings.length).toBe(1)
    })

    it('passes finding with evidence matching loosely (whitespace differences)', async () => {
      const content = 'const  token = req.headers.authorization'
      const ctx = makeGateContext({ currentFileContent: content })
      const input = JSON.stringify([makeFinding({ evidence_quote: 'const token = req.headers.authorization' })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(true)
      expect(result.findings[0]?.verified_by).toContain('evidence_verified:fuzzy')
    })

    it('passes finding with evidence within Levenshtein distance 3', async () => {
      const content = 'const token = req.headers.authorization'
      const ctx = makeGateContext({ currentFileContent: content })
      const input = JSON.stringify([makeFinding({
        evidence_quote: 'const tokex = req.headers.authorization',
      })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(true)
      expect(result.findings[0]?.verified_by).toContain('evidence_verified:fuzzy')
    })

    it('tags exact match with evidence_verified:exact', async () => {
      const content = 'const token = req.headers.authorization'
      const ctx = makeGateContext({ currentFileContent: content })
      const input = JSON.stringify([makeFinding({ evidence_quote: content })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(true)
      expect(result.findings[0]?.verified_by).toContain('evidence_verified:exact')
    })

    it('returns EVIDENCE_NOT_FOUND code when evidence is missing', async () => {
      const ctx = makeGateContext({
        currentFileContent: 'const token = req.headers.authorization',
      })
      const input = JSON.stringify([makeFinding({ evidence_quote: 'this text is nowhere in the file content' })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(false)
      expect(result.reason).toMatch(/EVIDENCE_NOT_FOUND/)
    })

    it('redacts secrets in stored evidence_quote', async () => {
      const secret = 'api_key = "sk_live_51Hx9J3ExampleValueForTestingOnly"'
      const ctx = makeGateContext({ currentFileContent: secret })
      const input = JSON.stringify([makeFinding({ evidence_quote: secret })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(true)
      const stored = result.findings[0]?.evidence_quote ?? ''
      expect(stored).not.toContain('sk_live_51Hx9J3ExampleValueForTestingOnly')
      expect(stored).toMatch(/\[REDACTED:[a-f0-9]{64}\]/)
    })
  })

  describe('Severity Gate', () => {
    it('rejects high severity with short evidence_quote', async () => {
      const ctx = makeGateContext()
      const input = JSON.stringify([makeFinding({
        severity: 'high',
        evidence_quote: 'const token = req.headers.authorization',
        impact: 'A'.repeat(35),
      })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(false)
      expect(result.reason).toMatch(/at least 50 characters/i)
    })

    it('rejects critical severity with short impact', async () => {
      const longQuote = 'const token = req.headers.authorization and this is extra text to exceed fifty characters'
      const ctx = makeGateContext({ currentFileContent: longQuote })
      const input = JSON.stringify([makeFinding({
        severity: 'critical',
        evidence_quote: longQuote,
        impact: 'short',
      })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(false)
      expect(result.reason).toMatch(/at least 30 characters/i)
    })

    it('passes high severity with long evidence_quote and impact', async () => {
      const ctx = makeGateContext({
        currentFileContent: 'const token = req.headers.authorization and additional context to make the quote long enough for high severity findings',
      })
      const longQuote = 'const token = req.headers.authorization and additional context to make the quote long enough for high severity findings'
      const input = JSON.stringify([makeFinding({
        severity: 'high',
        evidence_quote: longQuote,
        impact: 'A'.repeat(35),
      })])
      const result = await runGate(input, ctx, mockD1())
      expect(result.passed).toBe(true)
      expect(result.findings.length).toBe(1)
    })
  })

  describe('Cross-Reference Gate', () => {
    it('rejects when current file is missing from files table', async () => {
      const db = mockD1(false, { fileExists: false })
      const ctx = makeGateContext()
      const input = JSON.stringify([makeFinding()])
      const result = await runGate(input, ctx, db)
      expect(result.passed).toBe(false)
      expect(result.reason).toMatch(/Cross-Reference Gate/i)
    })
  })
})
