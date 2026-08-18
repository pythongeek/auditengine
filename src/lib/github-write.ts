/**
 * GitHub write operations: branch, commit, pull request.
 * Uses the Git Trees API so multiple files can be committed atomically.
 */

export interface GitHubFileChange {
  path: string
  content: string | null // null = delete
  mode?: '100644' | '100755' | '040000' | '160000' | '120000'
}

export interface GitHubCommitResult {
  sha: string
  html_url: string
}

async function githubApi(url: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AuditEngine/1.0',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new Error(`GitHub API error ${res.status}: ${text}`)
  }
  return res
}

export async function getBranchSha(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<string> {
  const res = await githubApi(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    token
  )
  const data = await res.json() as { object: { sha: string } }
  return data.object.sha
}

export async function createBranch(
  owner: string,
  repo: string,
  branch: string,
  fromSha: string,
  token: string
): Promise<void> {
  await githubApi(`https://api.github.com/repos/${owner}/${repo}/git/refs`, token, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: fromSha,
    }),
  })
}

export async function commitFiles(
  owner: string,
  repo: string,
  branch: string,
  changes: GitHubFileChange[],
  message: string,
  token: string,
  author?: { name: string; email: string }
): Promise<GitHubCommitResult> {
  const baseSha = await getBranchSha(owner, repo, branch, token)

  const commitRes = await githubApi(
    `https://api.github.com/repos/${owner}/${repo}/git/commits/${baseSha}`,
    token
  )
  const baseCommit = await commitRes.json() as { tree: { sha: string } }

  const treeEntries = await Promise.all(
    changes.map(async (change) => {
      if (change.content === null) {
        return {
          path: change.path,
          mode: change.mode || '100644',
          type: 'blob',
          sha: null,
        }
      }
      const blobRes = await githubApi(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            content: change.content,
            encoding: 'utf-8',
          }),
        }
      )
      const blob = await blobRes.json() as { sha: string }
      return {
        path: change.path,
        mode: change.mode || '100644',
        type: 'blob',
        sha: blob.sha,
      }
    })
  )

  const treeRes = await githubApi(
    `https://api.github.com/repos/${owner}/${repo}/git/trees`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseCommit.tree.sha,
        tree: treeEntries,
      }),
    }
  )
  const tree = await treeRes.json() as { sha: string }

  const commitPayload: Record<string, unknown> = {
    message,
    tree: tree.sha,
    parents: [baseSha],
  }
  if (author) {
    commitPayload.author = author
    commitPayload.committer = author
  }

  const newCommitRes = await githubApi(
    `https://api.github.com/repos/${owner}/${repo}/git/commits`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(commitPayload),
    }
  )
  const newCommit = await newCommitRes.json() as { sha: string; html_url: string }

  await githubApi(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({
        sha: newCommit.sha,
        force: false,
      }),
    }
  )

  return { sha: newCommit.sha, html_url: newCommit.html_url }
}

export async function createPullRequest(
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
  token: string
): Promise<{ number: number; html_url: string }> {
  const res = await githubApi(`https://api.github.com/repos/${owner}/${repo}/pulls`, token, {
    method: 'POST',
    body: JSON.stringify({
      title,
      head,
      base,
      body,
    }),
  })
  const data = await res.json() as { number: number; html_url: string }
  return { number: data.number, html_url: data.html_url }
}
