import { describe, it, expect } from 'vitest'
import { runGate } from '../src/lib/gate'
import { mockD1, makeGateContext } from './helpers'

function makeFinding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    finding_id: 'F-001',
    severity: 'high',
    category: 'auth',
    file: 'src/auth.ts',
    line_range: [1, 5],
    evidence_quote: 'req.headers.authorization',
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

  it('rejects finding with missing evidence_quote', async () => {
    const ctx = makeGateContext()
    const input = JSON.stringify([makeFinding({ evidence_quote: '' })])
    const result = await runGate(input, ctx, mockD1())
    expect(result.passed).toBe(false)
  })

  it('rejects evidence_quote not in file content', async () => {
    const ctx = makeGateContext()
    const input = JSON.stringify([makeFinding({ evidence_quote: 'this text is not in the file' })])
    const result = await runGate(input, ctx, mockD1())
    expect(result.passed).toBe(false)
    expect(result.reason).toMatch(/not found in file content/i)
  })

  it('passes valid finding with evidence in file', async () => {
    const ctx = makeGateContext({
      currentFileContent: 'const token = req.headers.authorization',
    })
    const input = JSON.stringify([makeFinding({ evidence_quote: 'req.headers.authorization' })])
    const result = await runGate(input, ctx, mockD1())
    expect(result.passed).toBe(true)
    expect(result.findings.length).toBe(1)
  })

  it('requires impact for critical severity', async () => {
    const ctx = makeGateContext()
    const input = JSON.stringify([makeFinding({ severity: 'critical', impact: '' })])
    const result = await runGate(input, ctx, mockD1())
    expect(result.passed).toBe(false)
  })

  it('strips markdown fences before parsing', async () => {
    const ctx = makeGateContext()
    const result = await runGate('```json\n[]\n```', ctx, mockD1())
    expect(result.passed).toBe(true)
  })
})
