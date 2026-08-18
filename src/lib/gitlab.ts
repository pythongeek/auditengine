import { extractZipFiles, type RepoFile } from './zip'
import type { Env } from '../types/index'
import { getTenantProviderToken, type ProviderName } from './token-crypto'
import { getGitProviderToken } from './settings'

const PROVIDER: ProviderName = 'gitlab'

export interface RepoUrlParts {
  owner: string
  repo: string
  ref: string
}

export function parseRepoUrl(repoUrl: string, branch?: string): RepoUrlParts | null {
  const normalized = repoUrl.replace(/\.git$/, '')
  const treeMatch = normalized.match(/gitlab\.com[:/]([^/]+)\/([^/]+)\/-\/tree\/([^/]+)\/?$/)
  if (treeMatch) {
    return { owner: treeMatch[1], repo: treeMatch[2], ref: treeMatch[3] }
  }
  const match = normalized.match(/gitlab\.com[:/]([^/]+)\/([^/]+)\/?$/)
  if (!match) return null
  return { owner: match[1], repo: match[2], ref: branch || 'HEAD' }
}

export async function getTokenForTenant(db: D1Database, tenantId: string, env: Env): Promise<string> {
  const tenantToken = await getTenantProviderToken(db, tenantId, PROVIDER, env.ENCRYPTION_KEY)
  if (tenantToken) return tenantToken
  return (await getGitProviderToken(db, PROVIDER, env.ENCRYPTION_KEY, env.GITLAB_TOKEN)) ?? ''
}

export async function fetchRepoFiles(
  repoUrl: string,
  branch: string | undefined,
  gitlabToken: string
): Promise<RepoFile[]> {
  const parsed = parseRepoUrl(repoUrl)
  if (!parsed) {
    throw new Error(`Unsupported GitLab repo URL: ${repoUrl}`)
  }

  const ref = branch || parsed.ref
  const project = encodeURIComponent(`${parsed.owner}/${parsed.repo}`)
  const url = `https://gitlab.com/api/v4/projects/${project}/repository/archive.zip?sha=${encodeURIComponent(ref)}`

  const res = await fetch(url, {
    headers: {
      'PRIVATE-TOKEN': gitlabToken,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new Error(`GitLab fetch failed: ${res.status} ${text}`)
  }

  const buffer = await res.arrayBuffer()
  const files = await extractZipFiles(buffer)

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
  gitlabToken: string
): Promise<string | null> {
  const project = encodeURIComponent(`${owner}/${repo}`)
  const encodedPath = encodeURIComponent(path)
  const url = `https://gitlab.com/api/v4/projects/${project}/repository/files/${encodedPath}/raw?ref=${encodeURIComponent(ref)}`
  const res = await fetch(url, {
    headers: {
      'PRIVATE-TOKEN': gitlabToken,
    },
  })

  if (res.status !== 200) return null
  return res.text()
}

export async function fetchDiff(
  owner: string,
  repo: string,
  commitSha: string,
  gitlabToken: string
): Promise<unknown> {
  const project = encodeURIComponent(`${owner}/${repo}`)
  const url = `https://gitlab.com/api/v4/projects/${project}/repository/commits/${encodeURIComponent(commitSha)}/diff`
  const res = await fetch(url, {
    headers: {
      'PRIVATE-TOKEN': gitlabToken,
    },
  })

  if (res.status !== 200) return null
  return res.json()
}

export function diffToFiles(diff: unknown): Array<{ filename: string; patch?: string }> {
  if (!Array.isArray(diff)) return []
  return diff.map((entry: { old_path?: string; new_path?: string; diff?: string }) => ({
    filename: entry.new_path || entry.old_path || '',
    patch: entry.diff || '',
  }))
}
