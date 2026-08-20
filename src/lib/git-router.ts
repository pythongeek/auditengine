import type { Env } from '../types/index'
import type { RepoFile } from './zip'
import * as github from './github'
import * as gitlab from './gitlab'
import * as bitbucket from './bitbucket'

export type GitProvider = 'github' | 'gitlab' | 'bitbucket'

export async function listRepoFiles(
  repoUrl: string,
  branch: string | undefined,
  tenantId: string,
  env: Env,
  tokenOverride?: string
): Promise<Array<{ path: string; type: string }>> {
  const provider = getProvider(repoUrl)
  if (!provider) {
    throw new Error(`Unsupported git provider URL: ${repoUrl}`)
  }

  switch (provider) {
    case 'github': {
      const token = tokenOverride ?? await github.getTokenForTenant(env.DB, tenantId, env)
      return github.listRepoFiles(repoUrl, branch, token)
    }
    case 'gitlab': {
      const token = tokenOverride ?? await gitlab.getTokenForTenant(env.DB, tenantId, env)
      return gitlab.listRepoFiles(repoUrl, branch, token)
    }
    case 'bitbucket': {
      const token = tokenOverride ?? await bitbucket.getTokenForTenant(env.DB, tenantId, env)
      return bitbucket.listRepoFiles(repoUrl, branch, token)
    }
  }
}

export function getProvider(repoUrl: string): GitProvider | null {
  if (repoUrl.includes('github.com')) return 'github'
  if (repoUrl.includes('gitlab.com')) return 'gitlab'
  if (repoUrl.includes('bitbucket.org')) return 'bitbucket'
  return null
}

export async function getRepoFiles(
  repoUrl: string,
  branch: string | undefined,
  tenantId: string,
  env: Env,
  tokenOverride?: string
): Promise<RepoFile[]> {
  const provider = getProvider(repoUrl)
  if (!provider) {
    throw new Error(`Unsupported git provider URL: ${repoUrl}`)
  }
  switch (provider) {
    case 'github': {
      const token = tokenOverride ?? await github.getTokenForTenant(env.DB, tenantId, env)
      return github.fetchRepoFiles(repoUrl, branch, token)
    }
    case 'gitlab': {
      const token = tokenOverride ?? await gitlab.getTokenForTenant(env.DB, tenantId, env)
      return gitlab.fetchRepoFiles(repoUrl, branch, token)
    }
    case 'bitbucket': {
      const token = tokenOverride ?? await bitbucket.getTokenForTenant(env.DB, tenantId, env)
      return bitbucket.fetchRepoFiles(repoUrl, branch, token)
    }
  }
}

export interface RepoUrlParts {
  owner: string
  repo: string
  ref: string
}

export function parseRepoUrl(repoUrl: string, branch?: string): RepoUrlParts | null {
  const provider = getProvider(repoUrl)
  if (!provider) return null
  switch (provider) {
    case 'github': return github.parseRepoUrl(repoUrl, branch)
    case 'gitlab': return gitlab.parseRepoUrl(repoUrl, branch)
    case 'bitbucket': return bitbucket.parseRepoUrl(repoUrl, branch)
  }
}

export async function fetchFileContent(
  repoUrl: string,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  tenantId: string,
  env: Env
): Promise<string | null> {
  const provider = getProvider(repoUrl)
  if (!provider) return null
  switch (provider) {
    case 'github': {
      const token = await github.getTokenForTenant(env.DB, tenantId, env)
      return github.fetchFileContent(owner, repo, path, ref, token)
    }
    case 'gitlab': {
      const token = await gitlab.getTokenForTenant(env.DB, tenantId, env)
      return gitlab.fetchFileContent(owner, repo, path, ref, token)
    }
    case 'bitbucket': {
      const token = await bitbucket.getTokenForTenant(env.DB, tenantId, env)
      return bitbucket.fetchFileContent(owner, repo, path, ref, token)
    }
  }
}

export async function fetchDiff(
  repoUrl: string,
  owner: string,
  repo: string,
  commitSha: string,
  tenantId: string,
  env: Env
): Promise<Array<{ filename: string; patch?: string }> | null> {
  const provider = getProvider(repoUrl)
  if (!provider) return null
  switch (provider) {
    case 'github': {
      const token = await github.getTokenForTenant(env.DB, tenantId, env)
      const diff = await github.fetchDiff(owner, repo, commitSha, token) as {
        files?: Array<{ filename: string; patch?: string }>
      } | null
      return diff?.files ?? null
    }
    case 'gitlab': {
      const token = await gitlab.getTokenForTenant(env.DB, tenantId, env)
      const diff = await gitlab.fetchDiff(owner, repo, commitSha, token)
      return gitlab.diffToFiles(diff)
    }
    case 'bitbucket': {
      const token = await bitbucket.getTokenForTenant(env.DB, tenantId, env)
      const diff = await bitbucket.fetchDiff(owner, repo, commitSha, token)
      return bitbucket.diffToFiles(diff)
    }
  }
}
