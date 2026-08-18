import { describe, it, expect } from 'vitest'
import { fixBranchName, buildFixMessages, extractFileContent } from '../src/workers/fix-agent'
import type { Finding } from '../src/types/index'

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    finding_id: 'F-1',
    audit_run_id: 'run-1',
    agent_id: 'agent-1',
    agent_type: 'security',
    severity: 'high',
    category: 'injection',
    file: 'src/db.ts',
    line_range: [5, 8],
    evidence_quote: 'db.query("SELECT * FROM u WHERE id=" + id)',
    description: 'SQL injection via string concatenation',
    impact: 'Attacker reads or modifies arbitrary rows',
    verified_by: '[]',
    source: 'agent',
    status: 'open',
    recurrence_count: 0,
    is_regression: false,
    ts: 0,
    verified_at: null,
    screenshot_id: null,
    ...overrides,
  } as Finding
}

describe('fixBranchName', () => {
  it('builds a safe, bounded branch name', () => {
    expect(fixBranchName('abc123def456')).toBe('auditengine/fix-abc123def456')
    const long = fixBranchName('x'.repeat(100))
    expect(long.length).toBeLessThanOrEqual('auditengine/fix-'.length + 12)
  })

  it('strips characters that are invalid in branch names', () => {
    expect(fixBranchName('id/with spaces!')).toBe('auditengine/fix-idwithspaces')
  })
})

describe('buildFixMessages', () => {
  it('embeds file content, findings, and the plan', () => {
    const messages = buildFixMessages('src/db.ts', 'const q = 1', [makeFinding()], 'Step 1: parameterize')
    const user = messages.find(m => m.role === 'user')!
    expect(user.content).toContain('src/db.ts')
    expect(user.content).toContain('const q = 1')
    expect(user.content).toContain('SQL injection')
    expect(user.content).toContain('Step 1: parameterize')
    expect(user.content).toContain('COMPLETE corrected file content only')
  })
})

describe('extractFileContent', () => {
  it('unwraps a fenced code block', () => {
    expect(extractFileContent('```ts\nconst a = 1\n```')).toBe('const a = 1')
  })

  it('returns raw content unchanged when unfenced', () => {
    expect(extractFileContent('const a = 1\n')).toBe('const a = 1')
  })
})
