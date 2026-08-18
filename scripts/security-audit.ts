#!/usr/bin/env tsx
/**
 * AuditEngine static security audit.
 *
 * Scans the src/ TypeScript tree for:
 *   - direct provider fetch() calls outside src/lib/llm-gateway.ts
 *   - hardcoded secret literals
 *   - protected routes in src/index.ts that bypass authentication
 *
 * Usage:
 *   npm run security-audit
 */

import { promises as fs } from 'fs'
import path from 'path'
import { findSecrets } from '../src/lib/secrets'

export interface SecurityFinding {
  file: string
  line: number
  category: 'direct_provider_fetch' | 'hardcoded_secret' | 'missing_auth'
  message: string
  snippet: string
}

export interface SecurityAuditReport {
  findings: SecurityFinding[]
  scannedFiles: number
  ok: boolean
}

const PROVIDER_DOMAINS = ['api.moonshot.cn', 'api.minimax.chat']
const LLM_GATEWAY_FILE = path.normalize('src/lib/llm-gateway.ts')

const PUBLIC_PATHS = new Set([
  '/',
  '/audit/new',
  '/repos',
  '/login',
  '/tenants',
  '/audits',
  '/task-board',
  '/finding',
  '/onboarding',
  '/settings',
  '/dashboard',
  '/api/v1/openapi.json',
  '/auth/github',
  '/auth/github/callback',
  '/auth/gitlab',
  '/auth/gitlab/callback',
  '/auth/bitbucket',
  '/auth/bitbucket/callback',
  '/webhooks/github',
  '/webhooks/gitlab',
  '/webhooks/bitbucket',
])

const PUBLIC_REGEX_SOURCES = new Set([
  '^\\/auth\\/github$',
  '^\\/auth\\/github\\/callback$',
  '^\\/auth\\/gitlab$',
  '^\\/auth\\/gitlab\\/callback$',
  '^\\/auth\\/bitbucket$',
  '^\\/auth\\/bitbucket\\/callback$',
  '^\\/webhooks\\/github$',
  '^\\/webhooks\\/gitlab$',
  '^\\/webhooks\\/bitbucket$',
])

const EXCLUDED_SECRET_FILES = new Set([
  path.normalize('src/lib/secrets.ts'),
])

function isPublicRoute(routePath: string): boolean {
  if (PUBLIC_PATHS.has(routePath)) return true
  if (routePath.startsWith('/') && routePath.endsWith('/')) {
    const source = routePath.slice(1, -1)
    if (PUBLIC_REGEX_SOURCES.has(source)) return true
  }
  return false
}

export async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(full)))
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(full)
    }
  }
  return files
}

function lineNumber(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

function lineAt(content: string, index: number): string {
  const before = content.slice(0, index)
  const after = content.slice(index)
  const lineStart = before.lastIndexOf('\n') + 1
  const lineEnd = after.indexOf('\n')
  return content.slice(lineStart, lineEnd === -1 ? undefined : lineStart + lineEnd).trim()
}

function isVariableReference(value: string): boolean {
  const trimmed = value.trim()
  const refs = [
    'env.',
    'process.env.',
    'url.',
    'request.',
    'response.',
    'localStorage.',
    'JSON.stringify',
    'new ',
    'await ',
    'crypto.',
    'Math.',
    'Date.',
    'Array.',
    'Object.',
    'String.',
    'Number.',
    'Boolean.',
    'Promise.',
    'console.',
    'globalThis.',
    '${',
  ]
  return refs.some(r => trimmed.startsWith(r)) || trimmed.includes('${')
}

const COMMON_PLACEHOLDERS = new Set([
  'token', 'JWT', 'Bearer ', 'bearer', 'password', 'secret', 'apikey',
  'api_key', 'api-key', 'client_id', 'client_secret', 'app_secret',
  'access_token', 'auth_token', 'api_token', 'private_key', 'conn_string',
  'connection_string', 'database_url', 'db_url',
])

function rhsValue(value: string): string {
  const m = value.match(/[:=]\s*(.+?)$/)
  return m ? m[1].trim() : value.trim()
}

function isQuotedLiteral(value: string): boolean {
  const v = value.trim()
  return (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith('`') && v.endsWith('`'))
  )
}

function looksLikeLiteralSecret(name: string, value: string): boolean {
  if (name === 'private_key' || name === 'aws_access_key') return true

  const raw = rhsValue(value)
  const trimmed = raw.replace(/^["']|["']$/g, '')

  if (trimmed.length < 8) return false
  if (COMMON_PLACEHOLDERS.has(trimmed)) return false
  if (isVariableReference(raw)) return false

  if (name === 'connection_string') {
    // Allow unquoted URLs, but skip plain code expressions.
    if (!isQuotedLiteral(raw) && !raw.includes('://')) return false
  } else if (name === 'assignment_secret') {
    // Real hardcoded secrets are almost always quoted literals.
    if (!isQuotedLiteral(raw)) return false
  }

  // Require some entropy: at least one digit or symbol beyond simple word chars.
  return /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(trimmed)
}

function findDirectProviderFetches(filePath: string, content: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  const normalized = path.normalize(filePath)
  if (normalized === LLM_GATEWAY_FILE) return findings

  const domainPattern = new RegExp(
    `https?://(?:${PROVIDER_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|')})\\b`,
    'g'
  )

  let match: RegExpExecArray | null
  while ((match = domainPattern.exec(content)) !== null) {
    const line = lineNumber(content, match.index)
    findings.push({
      file: filePath,
      line,
      category: 'direct_provider_fetch',
      message: `Direct provider URL found outside ${LLM_GATEWAY_FILE}`,
      snippet: lineAt(content, match.index),
    })
  }
  return findings
}

function findHardcodedSecrets(filePath: string, content: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  const normalized = path.normalize(filePath)
  if (EXCLUDED_SECRET_FILES.has(normalized)) return findings

  const matches = findSecrets(content)
  for (const m of matches) {
    if (!looksLikeLiteralSecret(m.name, m.value)) continue
    findings.push({
      file: filePath,
      line: lineNumber(content, m.index),
      category: 'hardcoded_secret',
      message: `Possible hardcoded secret (${m.name})`,
      snippet: lineAt(content, m.index),
    })
  }
  return findings
}

function findMissingAuth(filePath: string, content: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  const normalized = path.normalize(filePath)
  if (path.basename(normalized) !== 'index.ts') return findings

  const fetchStart = content.indexOf('async fetch(')
  const queueStart = content.indexOf('async queue(')
  if (fetchStart === -1 || queueStart === -1 || queueStart <= fetchStart) return findings

  const region = content.slice(fetchStart, queueStart)
  const lines = region.split('\n')

  interface RouteDef {
    lineIndex: number
    path: string
  }

  const routes: RouteDef[] = []
  for (let i = 0; i < lines.length; i++) {
    const exact = lines[i].match(/url\.pathname\s*===\s*['"]([^'"]+)['"]/)
    if (exact) {
      routes.push({ lineIndex: i, path: exact[1] })
      continue
    }
    const regex = lines[i].match(/url\.pathname\.match\(\s*(\/.*?\/)\s*\)/)
    if (regex) {
      routes.push({ lineIndex: i, path: regex[1] })
    }
  }

  routes.push({ lineIndex: lines.length, path: '' })

  for (let i = 0; i < routes.length - 1; i++) {
    const route = routes[i]
    if (isPublicRoute(route.path)) continue

    const block = lines.slice(route.lineIndex, routes[i + 1].lineIndex).join('\n')
    if (!block.includes('handleProtectedRoute') && !block.includes('isAdmin')) {
      findings.push({
        file: filePath,
        line: lineNumber(region, region.indexOf(lines[route.lineIndex])),
        category: 'missing_auth',
        message: `Route ${route.path} in fetch() does not call handleProtectedRoute or isAdmin`,
        snippet: lines[route.lineIndex].trim(),
      })
    }
  }

  return findings
}

export function scanFiles(files: { path: string; content: string }[]): SecurityAuditReport {
  const findings: SecurityFinding[] = []
  for (const file of files) {
    findings.push(...findDirectProviderFetches(file.path, file.content))
    findings.push(...findHardcodedSecrets(file.path, file.content))
    findings.push(...findMissingAuth(file.path, file.content))
  }
  return { findings, scannedFiles: files.length, ok: findings.length === 0 }
}

export async function auditProject(srcRoot: string): Promise<SecurityAuditReport> {
  const files = await collectTsFiles(srcRoot)
  const entries = await Promise.all(
    files.map(async (p) => ({ path: path.relative(process.cwd(), p), content: await fs.readFile(p, 'utf-8') }))
  )
  return scanFiles(entries)
}

export function printReport(report: SecurityAuditReport): void {
  console.log('=== AuditEngine Security Audit ===')
  console.log(`Scanned files: ${report.scannedFiles}`)
  console.log(`Findings: ${report.findings.length}`)
  for (const f of report.findings) {
    console.log(`\n[${f.category}] ${f.file}:${f.line}`)
    console.log(`  ${f.message}`)
    console.log(`  ${f.snippet}`)
  }
  console.log(report.ok ? '\nNo security issues found.' : '\nSecurity issues detected.')
}

async function main(): Promise<void> {
  const srcRoot = process.argv[2] || 'src'
  const report = await auditProject(srcRoot)
  printReport(report)
  process.exit(report.ok ? 0 : 1)
}

if (require.main === module) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
