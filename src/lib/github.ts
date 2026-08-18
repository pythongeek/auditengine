import { extractZipFiles, type RepoFile } from './zip'
import { getTenantProviderToken, type ProviderName } from './token-crypto'
import { getGitProviderToken } from './settings'
import type { Env } from '../types/index'

const PROVIDER: ProviderName = 'github'

export interface RepoUrlParts {
  owner: string
  repo: string
  ref: string
}

export function parseRepoUrl(repoUrl: string, branch?: string): RepoUrlParts | null {
  const normalized = repoUrl.replace(/\.git$/, '')
  const treeMatch = normalized.match(/github\.com[:/]([^/]+)\/([^/]+)\/tree\/([^/]+)\/?$/)
  if (treeMatch) {
    return { owner: treeMatch[1], repo: treeMatch[2], ref: treeMatch[3] }
  }
  const match = normalized.match(/github\.com[:/]([^/]+)\/([^/]+)\/?$/)
  if (!match) return null
  return { owner: match[1], repo: match[2], ref: branch || 'HEAD' }
}

export async function fetchRepoFiles(
  repoUrl: string,
  branch: string | undefined,
  githubToken: string
): Promise<RepoFile[]> {
  const parsed = parseRepoUrl(repoUrl)
  if (!parsed) {
    throw new Error(`Unsupported repo URL: ${repoUrl}`)
  }

  const ref = branch || parsed.ref
  const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/zipball/${ref}`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AuditEngine/1.0',
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new Error(`GitHub fetch failed: ${res.status} ${text}`)
  }

  const buffer = await res.arrayBuffer()
  const files = await extractZipFiles(buffer)

  // GitHub zipballs have a top-level folder like owner-repo-refhash/.
  // Strip that prefix to produce repo-relative paths.
  const prefix = findCommonPrefix(files.map(f => f.path))
  return files.map(f => ({
    path: prefix ? f.path.slice(prefix.length) : f.path,
    content: f.content,
    lastModified: f.lastModified,
  }))
}

function findCommonPrefix(paths: string[]): string | null {
  if (paths.length === 0) return null
  const first = paths[0]
  const slashIdx = first.indexOf('/')
  if (slashIdx === -1) return null
  const candidate = first.slice(0, slashIdx + 1)
  if (paths.every(p => p.startsWith(candidate))) return candidate
  return null
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  githubToken: string
): Promise<string | null> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'AuditEngine/1.0',
    },
  })

  if (res.status !== 200) return null
  const data = await res.json() as { content?: string; encoding?: string }
  if (data.encoding === 'base64' && data.content) {
    return atob(data.content.replace(/\n/g, ''))
  }
  return null
}

export async function fetchDiff(
  owner: string,
  repo: string,
  commitSha: string,
  githubToken: string
): Promise<unknown> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'AuditEngine/1.0',
    },
  })

  if (res.status !== 200) return null
  return res.json()
}

export async function getTokenForTenant(db: D1Database, tenantId: string, env: Env): Promise<string> {
  const tenantToken = await getTenantProviderToken(db, tenantId, PROVIDER, env.ENCRYPTION_KEY)
  if (tenantToken) return tenantToken
  return (await getGitProviderToken(db, PROVIDER, env.ENCRYPTION_KEY, env.GITHUB_TOKEN)) ?? ''
}
