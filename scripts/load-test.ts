#!/usr/bin/env tsx
/**
 * AuditEngine load-test harness.
 *
 * Runs against a staging deployment (never production) and reports:
 * - P95 latency for audit-start requests
 * - WebSocket error/close rates
 * - overall error rate
 *
 * Usage:
 *   STAGING_URL=https://auditengine-staging.tsnion.workers.dev \
 *   JWT_SECRET=test-secret \
 *     npx tsx scripts/load-test.ts --tenants 10 --ws 10 --duration 60
 */

import { createToken } from '../src/lib/auth'

interface Config {
  stagingUrl: string
  jwtSecret: string
  tenantCount: number
  wsPerTenant: number
  durationSec: number
}

interface AuditResult {
  tenantId: string
  auditRunId: string
  startLatencyMs: number
  ok: boolean
  error?: string
}

interface WsResult {
  tenantId: string
  auditRunId: string
  messages: number
  closeCode: number
  ok: boolean
}

interface Report {
  config: Config
  audits: AuditResult[]
  websockets: WsResult[]
  p95StartLatencyMs: number
  errorRate: number
  wsErrorRate: number
}

function envOrThrow(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }
  return value
}

function parseArgs(argv: string[]): Partial<Config> {
  const args: Partial<Config> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--tenants') args.tenantCount = parseInt(argv[++i], 10)
    if (arg === '--ws') args.wsPerTenant = parseInt(argv[++i], 10)
    if (arg === '--duration') args.durationSec = parseInt(argv[++i], 10)
  }
  return args
}

function getConfig(): Config {
  const args = parseArgs(process.argv.slice(2))
  return {
    stagingUrl: envOrThrow('STAGING_URL').replace(/\/$/, ''),
    jwtSecret: envOrThrow('JWT_SECRET'),
    tenantCount: args.tenantCount ?? 10,
    wsPerTenant: args.wsPerTenant ?? 10,
    durationSec: args.durationSec ?? 60,
  }
}

async function generateTenantToken(tenantId: string, jwtSecret: string): Promise<string> {
  return createToken(tenantId, jwtSecret, 'free', 3600)
}

async function startAudit(stagingUrl: string, token: string, tenantId: string): Promise<AuditResult> {
  const auditRunId = `load-${tenantId}-${Date.now()}`
  const body = JSON.stringify({
    audit_run_id: auditRunId,
    files: [{ path: 'src/index.ts', content: 'const x = 1\n' }],
    repo_url: 'https://github.com/example/load-test',
    branch: 'main',
  })

  const start = performance.now()
  try {
    const res = await fetch(`${stagingUrl}/audit/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    })
    const latencyMs = performance.now() - start
    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown')
      return { tenantId, auditRunId, startLatencyMs: latencyMs, ok: false, error: `${res.status} ${text}` }
    }
    return { tenantId, auditRunId, startLatencyMs: latencyMs, ok: true }
  } catch (err) {
    const latencyMs = performance.now() - start
    return { tenantId, auditRunId, startLatencyMs: latencyMs, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function openWebsocket(stagingUrl: string, token: string, auditRunId: string, durationMs: number): Promise<WsResult> {
  return new Promise((resolve) => {
    if (typeof WebSocket === 'undefined') {
      resolve({ tenantId: '', auditRunId, messages: 0, closeCode: -1, ok: false })
      return
    }
    const wsUrl = stagingUrl.replace(/^http/, 'ws') + `/dashboard/ws?token=${encodeURIComponent(token)}&audit_run_id=${encodeURIComponent(auditRunId)}`
    const ws = new WebSocket(wsUrl)
    let messages = 0
    let closed = false

    const timeout = setTimeout(() => {
      if (!closed) {
        ws.close(1000)
      }
    }, durationMs)

    ws.onopen = () => {
      // no-op: connected
    }
    ws.onmessage = () => {
      messages++
    }
    ws.onerror = () => {
      clearTimeout(timeout)
      closed = true
      resolve({ tenantId: '', auditRunId, messages, closeCode: -1, ok: false })
    }
    ws.onclose = (ev) => {
      clearTimeout(timeout)
      closed = true
      resolve({ tenantId: '', auditRunId, messages, closeCode: ev.code, ok: ev.code === 1000 || ev.code === 1001 })
    }
  })
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

function buildReport(config: Config, audits: AuditResult[], websockets: WsResult[]): Report {
  const latencies = audits.filter(a => a.ok).map(a => a.startLatencyMs).sort((a, b) => a - b)
  const errors = audits.filter(a => !a.ok).length
  const wsErrors = websockets.filter(w => !w.ok).length
  return {
    config,
    audits,
    websockets,
    p95StartLatencyMs: percentile(latencies, 95),
    errorRate: config.tenantCount === 0 ? 0 : errors / config.tenantCount,
    wsErrorRate: config.tenantCount * config.wsPerTenant === 0 ? 0 : wsErrors / (config.tenantCount * config.wsPerTenant),
  }
}

export async function runLoadTest(config: Config): Promise<Report> {
  // Ensure crypto is available for token signing.
  if (typeof globalThis.crypto === 'undefined') {
    const { webcrypto } = await import('node:crypto')
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
  }

  const auditPromises: Promise<AuditResult>[] = []
  for (let i = 0; i < config.tenantCount; i++) {
    const tenantId = `load-tenant-${i}-${Date.now()}`
    auditPromises.push(
      generateTenantToken(tenantId, config.jwtSecret)
        .then(token => startAudit(config.stagingUrl, token, tenantId))
    )
  }
  const audits = await Promise.all(auditPromises)

  const wsPromises: Promise<WsResult>[] = []
  for (const audit of audits.filter(a => a.ok)) {
    for (let i = 0; i < config.wsPerTenant; i++) {
      wsPromises.push(
        generateTenantToken(audit.tenantId, config.jwtSecret)
          .then(token => openWebsocket(config.stagingUrl, token, audit.auditRunId, config.durationSec * 1000))
          .then(result => ({ ...result, tenantId: audit.tenantId }))
      )
    }
  }
  const websockets = await Promise.all(wsPromises)

  return buildReport(config, audits, websockets)
}

export function printReport(report: Report): void {
  console.log('=== AuditEngine Load Test Report ===')
  console.log(`Tenants: ${report.config.tenantCount}`)
  console.log(`WebSockets per tenant: ${report.config.wsPerTenant}`)
  console.log(`Duration: ${report.config.durationSec}s`)
  console.log(`Audit-start P95 latency: ${report.p95StartLatencyMs.toFixed(2)}ms`)
  console.log(`Audit-start error rate: ${(report.errorRate * 100).toFixed(2)}%`)
  console.log(`WebSocket error rate: ${(report.wsErrorRate * 100).toFixed(2)}%`)
  console.log(`Total dashboard messages received: ${report.websockets.reduce((sum, w) => sum + w.messages, 0)}`)
  const errors = report.audits.filter(a => !a.ok).map(a => `  ${a.tenantId}: ${a.error}`)
  if (errors.length > 0) {
    console.log('Audit errors:')
    errors.forEach(e => console.log(e))
  }
  const wsErrors = report.websockets.filter(w => !w.ok).map(w => `  ${w.auditRunId}: closeCode=${w.closeCode}`)
  if (wsErrors.length > 0) {
    console.log('WebSocket errors:')
    wsErrors.forEach(e => console.log(e))
  }
}

async function main(): Promise<void> {
  const config = getConfig()
  const report = await runLoadTest(config)
  printReport(report)
  process.exit(report.errorRate > 0.5 || report.wsErrorRate > 0.5 ? 1 : 0)
}

if (require.main === module) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
