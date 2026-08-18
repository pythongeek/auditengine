import { describe, it, expect, vi } from 'vitest'
import { runLoadTest } from '../scripts/load-test'

if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

class MockWebSocket {
  static CONNECTED: MockWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((ev: { code: number }) => void) | null = null
  private closed = false

  constructor() {
    MockWebSocket.CONNECTED.push(this)
    setTimeout(() => {
      if (this.onopen) this.onopen()
      if (this.onmessage) this.onmessage({ data: JSON.stringify({ type: 'test' }) })
      setTimeout(() => this.close(1000), 5)
    }, 1)
  }

  close(code = 1000) {
    if (this.closed) return
    this.closed = true
    if (this.onclose) this.onclose({ code })
  }
}

describe('load-test harness', () => {
  it('reports success for mocked audit starts and websockets', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'started' }),
      text: async () => 'ok',
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('WebSocket', MockWebSocket)
    MockWebSocket.CONNECTED.length = 0

    const report = await runLoadTest({
      stagingUrl: 'https://staging.example.com',
      jwtSecret: 'test-secret',
      tenantCount: 3,
      wsPerTenant: 2,
      durationSec: 0,
    })

    expect(report.audits).toHaveLength(3)
    expect(report.audits.every(a => a.ok)).toBe(true)
    expect(report.websockets).toHaveLength(6)
    expect(report.websockets.every(w => w.ok)).toBe(true)
    expect(report.errorRate).toBe(0)
    expect(report.wsErrorRate).toBe(0)
    expect(report.p95StartLatencyMs).toBeGreaterThanOrEqual(0)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const callUrl = fetchMock.mock.calls[0][0] as string
    expect(callUrl).toContain('/audit/start')

    vi.unstubAllGlobals()
  })
})
