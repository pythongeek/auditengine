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

const MAX_RETRIES = 3
const INITIAL_DELAY_MS = 100

function makeHeaders(token: string, includeApiVersion = true): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'AuditEngine/1.0',
  }
  if (includeApiVersion) {
    headers['X-GitHub-Api-Version'] = '2022-11-28'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 403 || status >= 500
}

function isApiZipballTransient(status: number): boolean {
  // GitHub may return 403, 404, or 429 for rate limits / transient blocks from shared IPs.
  return status === 429 || status === 403 || status === 404 || status >= 500
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  isTransient: (status: number) => boolean,
  retries = MAX_RETRIES,
  delay = INITIAL_DELAY_MS
): Promise<Response> {
  let lastError: Error | undefined
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, init)
      if (!isTransient(res.status) || i === retries) {
        return res
      }
      const retryAfter = res.headers.get('Retry-After')
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay * (2 ** i)
      await sleep(waitMs)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (i === retries) break
      await sleep(delay * (2 ** i))
    }
  }
  throw lastError ?? new Error(`Fetch failed after ${retries} retries: ${url}`)
}

async function extractAndNormalizeZipball(res: Response): Promise<RepoFile[]> {
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
  const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/zipball/${ref}`
  const headers = makeHeaders(githubToken)

  // Primary path: GitHub API zipball (fastest, one request for the whole repo).
  let apiError: Error | undefined
  try {
    const res = await fetchWithRetry(apiUrl, { headers }, isApiZipballTransient)
    if (res.ok) {
      return await extractAndNormalizeZipball(res)
    }
    const text = await res.text().catch(() => 'unknown error')
    apiError = new Error(`GitHub API zipball failed: ${res.status} ${text}`)
  } catch (err) {
    apiError = err instanceof Error ? err : new Error(String(err))
  }

  // Fallback path: web archive URL for public repos. This bypasses the GitHub
  // API rate limits that shared Cloudflare egress IPs hit on api.github.com.
  if (!githubToken) {
    try {
      const webUrl = `https://github.com/${parsed.owner}/${parsed.repo}/archive/${encodeURIComponent(ref)}.zip`
      const webRes = await fetchWithRetry(webUrl, { headers: makeHeaders('', false) }, isTransientStatus)
      if (webRes.ok) {
        return await extractAndNormalizeZipball(webRes)
      }
    } catch {
      // fall through to final error
    }
  }

  const hint = githubToken
    ? 'Check that your GitHub token has access to this repository and ref.'
    : 'GitHub API rate limit likely exceeded from Cloudflare egress IPs. Configure a GitHub token in Settings, or ensure the repository is public and accessible.'
  throw new Error(`${apiError?.message ?? 'GitHub fetch failed'} (${hint})`)
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

export async function listRepoFiles(
  repoUrl: string,
  branch: string | undefined,
  githubToken: string
): Promise<Array<{ path: string; type: string }>> {
  const parsed = parseRepoUrl(repoUrl, branch)
  if (!parsed) {
    throw new Error(`Unsupported repo URL: ${repoUrl}`)
  }

  const ref = branch || parsed.ref
  const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`
  const headers = makeHeaders(githubToken)

  const res = await fetchWithRetry(url, { headers }, isTransientStatus)

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    const hint = res.status === 404 && !githubToken
      ? ' (If this is a private repository, please configure your GitHub token in Settings)'
      : ''
    throw new Error(`GitHub list files failed: ${res.status} ${text}${hint}`)
  }

  const data = await res.json() as { tree?: Array<{ path: string; type: string }> }
  if (!data.tree || !Array.isArray(data.tree)) {
    return []
  }

  return data.tree.filter(t => t.type === 'blob').map(t => ({ path: t.path, type: t.type }))
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
  const headers = makeHeaders(githubToken)

  const res = await fetchWithRetry(url, { headers }, isTransientStatus).catch(() => null)
  if (!res || res.status !== 200) return null

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
  const headers = makeHeaders(githubToken)
  const res = await fetchWithRetry(url, { headers }, isTransientStatus).catch(() => null)

  if (!res || res.status !== 200) return null
  return res.json()
}

export async function getTokenForTenant(db: D1Database, tenantId: string, env: Env): Promise<string> {
  const tenantToken = await getTenantProviderToken(db, tenantId, PROVIDER, env.ENCRYPTION_KEY)
  if (tenantToken) return tenantToken
  return (await getGitProviderToken(db, PROVIDER, env.ENCRYPTION_KEY, env.GITHUB_TOKEN)) ?? ''
}
