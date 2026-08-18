export interface ChangedFile {
  path: string
  status: 'added' | 'modified' | 'removed' | 'renamed'
  new_content: string | null
  patch: string | null
}

export async function getLatestCommit(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<string | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'AuditEngine/1.0',
    },
  })

  if (res.status !== 200) return null
  const data = await res.json() as Array<{ sha: string }>
  return data[0]?.sha ?? null
}

export async function fetchRawFile(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string
): Promise<string | null> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
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

export async function getChangedFilesSince(
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
  token: string
): Promise<ChangedFile[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'AuditEngine/1.0',
    },
  })

  if (res.status !== 200) return []
  const data = await res.json() as {
    files?: Array<{
      filename: string
      status: string
      previous_filename?: string
      patch?: string
    }>
  }

  const files = data.files ?? []
  const changed: ChangedFile[] = []

  for (const file of files) {
    const status = normalizeStatus(file.status)
    if (status === 'removed') {
      changed.push({ path: file.filename, status, new_content: null, patch: file.patch ?? null })
      continue
    }

    const newContent = status === 'added' || status === 'modified' || status === 'renamed'
      ? await fetchRawFile(owner, repo, file.filename, headSha, token)
      : null

    changed.push({
      path: file.filename,
      status,
      new_content: newContent,
      patch: file.patch ?? null,
    })
  }

  return changed
}

function normalizeStatus(status: string): ChangedFile['status'] {
  switch (status) {
    case 'added': return 'added'
    case 'modified': return 'modified'
    case 'removed': return 'removed'
    case 'renamed': return 'renamed'
    default: return 'modified'
  }
}
