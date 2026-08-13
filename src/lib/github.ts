import { extractZipFiles, type RepoFile } from './zip'

export interface RepoUrlParts {
  owner: string
  repo: string
  ref: string
}

export function parseRepoUrl(repoUrl: string): RepoUrlParts | null {
  const normalized = repoUrl.replace(/\.git$/, '')
  const match = normalized.match(/github\.com[:/]([^/]+)\/([^/]+)\/?$/)
  if (!match) return null
  return { owner: match[1], repo: match[2], ref: 'HEAD' }
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
