import { extractZipFiles, type RepoFile } from './zip'
import type { Env } from '../types/index'
import { getTenantProviderToken, type ProviderName } from './token-crypto'
import { getGitProviderToken } from './settings'

const PROVIDER: ProviderName = 'bitbucket'

export interface RepoUrlParts {
  owner: string
  repo: string
  ref: string
}

export function parseRepoUrl(repoUrl: string, branch?: string): RepoUrlParts | null {
  const normalized = repoUrl.replace(/\.git$/, '')
  const branchMatch = normalized.match(/bitbucket\.org\/([^/]+)\/([^/]+)\/src\/([^/]+)\/?/)
  if (branchMatch) {
    return { owner: branchMatch[1], repo: branchMatch[2], ref: branchMatch[3] }
  }
  const match = normalized.match(/bitbucket\.org\/([^/]+)\/([^/]+)\/?$/)
  if (!match) return null
  return { owner: match[1], repo: match[2], ref: branch || 'HEAD' }
}

export async function getTokenForTenant(db: D1Database, tenantId: string, env: Env): Promise<string> {
  const tenantToken = await getTenantProviderToken(db, tenantId, PROVIDER, env.ENCRYPTION_KEY)
  if (tenantToken) return tenantToken
  return (await getGitProviderToken(db, PROVIDER, env.ENCRYPTION_KEY, env.BITBUCKET_TOKEN)) ?? ''
}

export async function fetchRepoFiles(
  repoUrl: string,
  branch: string | undefined,
  bitbucketToken: string
): Promise<RepoFile[]> {
  const parsed = parseRepoUrl(repoUrl)
  if (!parsed) {
    throw new Error(`Unsupported Bitbucket repo URL: ${repoUrl}`)
  }

  const ref = branch || parsed.ref
  const url = `https://bitbucket.org/${parsed.owner}/${parsed.repo}/get/${encodeURIComponent(ref)}.zip`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bitbucketToken}`,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new Error(`Bitbucket fetch failed: ${res.status} ${text}`)
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
  bitbucketToken: string
): Promise<string | null> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/src/${encodeURIComponent(ref)}/${encodedPath}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bitbucketToken}`,
    },
  })

  if (res.status !== 200) return null
  return res.text()
}

export async function fetchCommit(
  owner: string,
  repo: string,
  commitSha: string,
  bitbucketToken: string
): Promise<{ parents: Array<{ hash: string }> } | null> {
  const url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/commit/${encodeURIComponent(commitSha)}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bitbucketToken}`,
    },
  })

  if (res.status !== 200) return null
  return (await res.json()) as { parents: Array<{ hash: string }> }
}

export async function fetchDiff(
  owner: string,
  repo: string,
  commitSha: string,
  bitbucketToken: string
): Promise<unknown> {
  const commit = await fetchCommit(owner, repo, commitSha, bitbucketToken)
  if (!commit || commit.parents.length === 0) return null

  const parent = commit.parents[0].hash
  const url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/diff/${parent}:${commitSha}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bitbucketToken}`,
    },
  })

  if (res.status !== 200) return null
  return res.text()
}

export function diffToFiles(diff: unknown): Array<{ filename: string; patch?: string }> {
  if (typeof diff !== 'string') return []
  const lines = diff.split('\n')
  const files: Array<{ filename: string; patch: string }> = []
  let current: { filename: string; patch: string[] } | null = null
  for (const line of lines) {
    const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/)
    if (fileMatch) {
      if (current) {
        files.push({ filename: current.filename, patch: current.patch.join('\n') })
      }
      current = { filename: fileMatch[2], patch: [line] }
    } else if (current) {
      current.patch.push(line)
    }
  }
  if (current) {
    files.push({ filename: current.filename, patch: current.patch.join('\n') })
  }
  return files
}
