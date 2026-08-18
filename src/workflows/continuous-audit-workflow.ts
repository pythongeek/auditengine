import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import type { Env, AgentType, Finding, Severity } from '../types/index'
import { recalcProductionScore, escalateSeverityValue } from '../workers/verification'
import { writeAuditLog } from '../agents/base-agent'
import { parseRepoUrl } from '../lib/github'
import { getLatestCommit, getChangedFilesSince, fetchRawFile, type ChangedFile } from '../lib/git-diff'
import { processRepoFile, upsertFiles, tagDomain } from '../workers/ingestion'
import { spawnAgent } from '../workers/coordinator'
import { DOMAIN_MAP } from '../agents/base-agent'

export class ContinuousAuditWorkflow extends WorkflowEntrypoint<Env, { auditRunId: string; tenantId: string }> {
  async run(event: Readonly<WorkflowEvent<{ auditRunId: string; tenantId: string }>>, step: WorkflowStep): Promise<void> {
    const { auditRunId, tenantId } = event.payload

    const session = await step.do('fetch-audit-session', async () => {
      return await this.env.DB
        .prepare('SELECT repo_url, repo_branch, last_commit_sha FROM audit_sessions WHERE id = ? AND tenant_id = ?')
        .bind(auditRunId, tenantId)
        .first<{ repo_url: string; repo_branch: string; last_commit_sha: string | null }>()
    })

    if (!session || !session.repo_url) {
      await step.do('log-missing-session', async () => {
        await writeAuditLog(
          this.env.DB,
          tenantId,
          auditRunId,
          null,
          'continuous_audit_error',
          { reason: 'missing session or repo_url' }
        )
      })
      return
    }

    const parsed = parseRepoUrl(session.repo_url, session.repo_branch)
    if (!parsed) {
      await step.do('log-unparseable-url', async () => {
        await writeAuditLog(
          this.env.DB,
          tenantId,
          auditRunId,
          null,
          'continuous_audit_error',
          { reason: 'unparseable repo_url', repo_url: session.repo_url }
        )
      })
      return
    }

    const latestCommit = await step.do('fetch-latest-commit', async () => {
      return await getLatestCommit(parsed.owner, parsed.repo, parsed.ref, this.env.GITHUB_TOKEN)
    })

    if (!latestCommit) {
      await step.do('log-latest-commit-error', async () => {
        await writeAuditLog(
          this.env.DB,
          tenantId,
          auditRunId,
          null,
          'continuous_audit_error',
          { reason: 'could not fetch latest commit', branch: parsed.ref }
        )
      })
      return
    }

    if (latestCommit === session.last_commit_sha) {
      await step.do('log-no-changes', async () => {
        await writeAuditLog(
          this.env.DB,
          tenantId,
          auditRunId,
          null,
          'continuous_audit_no_changes',
          { commit_sha: latestCommit }
        )
      })
      return
    }

    const baseSha = session.last_commit_sha ?? latestCommit
    const changedFiles = await step.do('fetch-changed-files', async () => {
      return await getChangedFilesSince(parsed.owner, parsed.repo, baseSha, latestCommit, this.env.GITHUB_TOKEN)
    })

    if (changedFiles.length === 0) {
      await step.do('update-last-commit-no-changes', async () => {
        await this.env.DB
          .prepare('UPDATE audit_sessions SET last_commit_sha = ? WHERE id = ? AND tenant_id = ?')
          .bind(latestCommit, auditRunId, tenantId)
          .run()
      })
      return
    }

    await step.do('re-ingest-changed-files', async () => {
      const entries = []
      for (const file of changedFiles) {
        if (file.status === 'removed' || file.new_content === null) continue
        const entry = await processRepoFile(
          tenantId,
          auditRunId,
          { path: file.path, content: file.new_content, lastModified: Date.now() },
          this.env.R2
        )
        entries.push(entry)
      }
      await upsertFiles(tenantId, auditRunId, entries, this.env.DB)
    })

    await step.do('delete-removed-files', async () => {
      for (const file of changedFiles) {
        if (file.status !== 'removed') continue
        await this.env.DB
          .prepare('DELETE FROM files WHERE tenant_id = ? AND audit_run_id = ? AND path = ?')
          .bind(tenantId, auditRunId, file.path)
          .run()
      }
    })

    await step.do('spawn-reanalysis', async () => {
      const modifiedFiles = changedFiles.filter(f => f.status !== 'removed')
      const filePaths = modifiedFiles.map(f => f.path)
      if (filePaths.length === 0) return

      const agentsToSpawn = new Set<AgentType>()
      for (const agentType of Object.keys(DOMAIN_MAP) as AgentType[]) {
        const domain = DOMAIN_MAP[agentType]
        const hasMatchingFile = filePaths.some(path => domain === 'all' || tagDomain(path) === domain)
        if (hasMatchingFile) agentsToSpawn.add(agentType)
      }

      for (const agentType of agentsToSpawn) {
        const domain = DOMAIN_MAP[agentType]
        const filesForAgent = filePaths.filter(path => domain === 'all' || tagDomain(path) === domain)
        await spawnAgent(agentType, 5, tenantId, auditRunId, this.env, filesForAgent)
      }
    })

    await step.do('regression-check', async () => {
      const modifiedPaths = changedFiles.filter(f => f.status !== 'removed').map(f => f.path)
      if (modifiedPaths.length === 0) return

      const placeholders = modifiedPaths.map(() => '?').join(',')
      const resolvedFindings = await this.env.DB
        .prepare(`SELECT * FROM findings WHERE audit_run_id = ? AND status = 'resolved' AND file IN (${placeholders})`)
        .bind(auditRunId, ...modifiedPaths)
        .all<Finding>()

      for (const finding of resolvedFindings.results ?? []) {
        const content = await fetchRawFile(parsed.owner, parsed.repo, finding.file, latestCommit, this.env.GITHUB_TOKEN)
        if (content === null) continue
        if (content.includes(finding.evidence_quote.trim())) {
          await createRegressionFinding(this.env.DB, tenantId, auditRunId, finding, latestCommit)
        }
      }
    })

    await step.do('trigger-consumer-audits', async () => {
      const changedPaths = changedFiles.filter(f => f.status !== 'removed').map(f => f.path)
      if (changedPaths.length === 0) return

      const placeholders = changedPaths.map(() => '?').join(',')
      const consumerDeps = await this.env.DB
        .prepare(`SELECT DISTINCT consumer_run_id, tenant_id FROM repo_dependencies WHERE provider_run_id = ? AND dependency_path IN (${placeholders})`)
        .bind(auditRunId, ...changedPaths)
        .all<{ consumer_run_id: string; tenant_id: string }>()

      for (const dep of consumerDeps.results ?? []) {
        await this.env.CONTINUOUS_AUDIT_WORKFLOW.create({
          id: `continuous-audit-consumer-${dep.consumer_run_id}-${Date.now()}`,
          params: { auditRunId: dep.consumer_run_id, tenantId: dep.tenant_id },
        })
      }
    })

    await step.do('recalculate-score', async () => {
      await recalcProductionScore(auditRunId, this.env.DB)
    })

    await step.do('update-last-commit', async () => {
      await this.env.DB
        .prepare('UPDATE audit_sessions SET last_commit_sha = ? WHERE id = ? AND tenant_id = ?')
        .bind(latestCommit, auditRunId, tenantId)
        .run()
      await writeAuditLog(
        this.env.DB,
        tenantId,
        auditRunId,
        null,
        'continuous_audit_complete',
        {
          commit_sha: latestCommit,
          changed_files: changedFiles.map(f => f.path),
        }
      )
    })
  }
}

async function createRegressionFinding(
  db: D1Database,
  tenantId: string,
  auditRunId: string,
  finding: Finding,
  latestCommit: string
): Promise<void> {
  const newSeverity = escalateSeverityValue(finding.severity)
  const regressionId = `regression-${finding.finding_id}-${Date.now()}`
  await db
    .prepare(`
      INSERT INTO findings (
        finding_id, tenant_id, audit_run_id, agent_id, agent_type, severity, category,
        file, line_range_start, line_range_end, evidence_quote, description,
        impact, verified_by, source, status, recurrence_count, is_regression, ts, verified_at, screenshot_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      regressionId,
      tenantId,
      auditRunId,
      finding.agent_id,
      finding.agent_type,
      newSeverity,
      finding.category,
      finding.file,
      finding.line_range?.[0] ?? null,
      finding.line_range?.[1] ?? null,
      finding.evidence_quote,
      `Regression at ${latestCommit}: ${finding.description}`,
      finding.impact,
      JSON.stringify(finding.verified_by),
      'regression',
      'open',
      (finding.recurrence_count ?? 0) + 1,
      1,
      Date.now(),
      null,
      finding.screenshot_id
    )
    .run()

  await db
    .prepare('INSERT INTO audit_logs (tenant_id, audit_run_id, agent_id, event_type, event_data) VALUES (?, ?, ?, ?, ?)')
    .bind(
      tenantId,
      auditRunId,
      finding.agent_id,
      'regression_found',
      JSON.stringify({
        original_finding_id: finding.finding_id,
        regression_finding_id: regressionId,
        file: finding.file,
        severity: newSeverity,
        commit_sha: latestCommit,
      })
    )
    .run()
}
