import type { GateContext } from '../src/types/index'

export function mockD1(findingExists = false): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: () => Promise.resolve(findingExists ? { finding_id: 'F-0001' } : null),
        run: () => Promise.resolve({ changes: 1, meta: {} }),
        all: () => Promise.resolve({ results: [] }),
      }),
    }),
    batch: () => Promise.resolve([]),
    dump: () => Promise.resolve(new ArrayBuffer(0)),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database
}

export function makeGateContext(overrides: Partial<GateContext> = {}): GateContext {
  return {
    agentId: 'agent-001',
    agentType: 'security',
    auditRunId: 'run-001',
    currentFile: 'src/auth.ts',
    currentFileContent: 'const token = req.headers.authorization',
    claimLog: new Set(),
    ...overrides,
  }
}
