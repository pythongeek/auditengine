/**
 * Unified git write interface for all supported providers.
 * Agents use this to create branches, commit changes, and open PRs/MRs.
 */

import type { Env } from '../types/index'
import { getProvider, type GitProvider } from './git-router'
import { getTokenForTenant as getGitHubTokenForTenant } from './github'
import { getTokenForTenant as getGitLabTokenForTenant } from './gitlab'
import { getTokenForTenant as getBitbucketTokenForTenant } from './bitbucket'
import * as githubWrite from './github-write'
import * as gitlabWrite from './gitlab-write'
import * as bitbucketWrite from './bitbucket-write'
import { parseRepoUrl } from './git-router'

export interface RepoFileChange {
  path: string
  content: string | null // null = delete
  mode?: string
}

export interface RepoCommitResult {
  sha: string
  url: string
}

export interface RepoPullRequestResult {
  id: number
  url: string
}

async function getToken(provider: GitProvider, db: D1Database, tenantId: string, env: Env): Promise<string> {
  switch (provider) {
    case 'github':
      return getGitHubTokenForTenant(db, tenantId, env)
    case 'gitlab':
      return getGitLabTokenForTenant(db, tenantId, env)
    case 'bitbucket':
      return getBitbucketTokenForTenant(db, tenantId, env)
  }
}

export async function createBranch(
  repoUrl: string,
  branch: string,
  fromBranchOrSha: string,
  tenantId: string,
  env: Env
): Promise<void> {
  const provider = getProvider(repoUrl)
  if (!provider) {
    throw new Error(`Unsupported git provider URL: ${repoUrl}`)
  }
  const parsed = parseRepoUrl(repoUrl)
  if (!parsed) {
    throw new Error(`Cannot parse repo URL: ${repoUrl}`)
  }
  const token = await getToken(provider, env.DB, tenantId, env)

  switch (provider) {
    case 'github': {
      let sha = fromBranchOrSha
      if (!fromBranchOrSha.match(/^[0-9a-f]{40}$/i)) {
        sha = await githubWrite.getBranchSha(parsed.owner, parsed.repo, fromBranchOrSha, token)
      }
      await githubWrite.createBranch(parsed.owner, parsed.repo, branch, sha, token)
      break
    }
    case 'gitlab': {
      await gitlabWrite.createBranch(`${parsed.owner}/${parsed.repo}`, branch, fromBranchOrSha, token)
      break
    }
    case 'bitbucket': {
      // Bitbucket branches require a commit hash. Try resolving branch name.
      let sha = fromBranchOrSha
      if (!fromBranchOrSha.match(/^[0-9a-f]{12,64}$/i)) {
        const res = await fetch(
          `https://api.bitbucket.org/2.0/repositories/${parsed.owner}/${parsed.repo}/refs/branches/${encodeURIComponent(fromBranchOrSha)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!res.ok) throw new Error(`Failed to resolve Bitbucket branch: ${res.status}`)
        const data = await res.json() as { target: { hash: string } }
        sha = data.target.hash
      }
      await bitbucketWrite.createBranch(parsed.owner, parsed.repo, branch, sha, token)
      break
    }
  }
}

export async function commitFiles(
  repoUrl: string,
  branch: string,
  changes: RepoFileChange[],
  message: string,
  tenantId: string,
  env: Env,
  author?: { name: string; email: string }
): Promise<RepoCommitResult> {
  const provider = getProvider(repoUrl)
  if (!provider) {
    throw new Error(`Unsupported git provider URL: ${repoUrl}`)
  }
  const parsed = parseRepoUrl(repoUrl)
  if (!parsed) {
    throw new Error(`Cannot parse repo URL: ${repoUrl}`)
  }
  const token = await getToken(provider, env.DB, tenantId, env)

  switch (provider) {
    case 'github': {
      const githubChanges = changes.map(c => ({
        path: c.path,
        content: c.content,
        mode: (c.mode as githubWrite.GitHubFileChange['mode']) || '100644',
      }))
      const result = await githubWrite.commitFiles(parsed.owner, parsed.repo, branch, githubChanges, message, token, author)
      return { sha: result.sha, url: result.html_url }
    }
    case 'gitlab': {
      const result = await gitlabWrite.commitFiles(`${parsed.owner}/${parsed.repo}`, branch, changes, message, token, author)
      return { sha: result.id, url: result.web_url }
    }
    case 'bitbucket': {
      const result = await bitbucketWrite.commitFiles(parsed.owner, parsed.repo, branch, changes, message, token, author)
      return { sha: result.hash, url: result.links.html.href }
    }
  }
}

export async function createPullRequest(
  repoUrl: string,
  head: string,
  base: string,
  title: string,
  body: string,
  tenantId: string,
  env: Env
): Promise<RepoPullRequestResult> {
  const provider = getProvider(repoUrl)
  if (!provider) {
    throw new Error(`Unsupported git provider URL: ${repoUrl}`)
  }
  const parsed = parseRepoUrl(repoUrl)
  if (!parsed) {
    throw new Error(`Cannot parse repo URL: ${repoUrl}`)
  }
  const token = await getToken(provider, env.DB, tenantId, env)

  switch (provider) {
    case 'github': {
      const result = await githubWrite.createPullRequest(parsed.owner, parsed.repo, head, base, title, body, token)
      return { id: result.number, url: result.html_url }
    }
    case 'gitlab': {
      const result = await gitlabWrite.createMergeRequest(`${parsed.owner}/${parsed.repo}`, head, base, title, body, token)
      return { id: result.iid, url: result.web_url }
    }
    case 'bitbucket': {
      const result = await bitbucketWrite.createPullRequest(parsed.owner, parsed.repo, head, base, title, body, token)
      return { id: result.id, url: result.links.html.href }
    }
  }
}

export async function applyChangesToRepo(
  auditRunId: string,
  branch: string,
  changes: RepoFileChange[],
  message: string,
  tenantId: string,
  env: Env,
  author?: { name: string; email: string }
): Promise<RepoCommitResult> {
  const session = await env.DB
    .prepare('SELECT repo_url, repo_branch FROM audit_sessions WHERE id = ? AND tenant_id = ?')
    .bind(auditRunId, tenantId)
    .first<{ repo_url: string; repo_branch: string }>()

  if (!session || !session.repo_url) {
    throw new Error('Missing repo_url for audit run')
  }

  return commitFiles(session.repo_url, branch || session.repo_branch, changes, message, tenantId, env, author)
}
