/**
 * Bitbucket Cloud write operations: branch, commit, pull request.
 * Commits use the /src endpoint with multipart form data.
 */

export interface BitbucketFileChange {
  path: string
  content: string | null // null = delete
}

export interface BitbucketCommitResult {
  hash: string
  links: { html: { href: string } }
}

async function bitbucketApi(url: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new Error(`Bitbucket API error ${res.status}: ${text}`)
  }
  return res
}

export async function createBranch(
  workspace: string,
  repoSlug: string,
  branch: string,
  targetSha: string,
  token: string
): Promise<void> {
  await bitbucketApi(
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/refs/branches`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: branch,
        target: { hash: targetSha },
      }),
    }
  )
}

export async function commitFiles(
  workspace: string,
  repoSlug: string,
  branch: string,
  changes: BitbucketFileChange[],
  message: string,
  token: string,
  author?: { name: string; email: string }
): Promise<BitbucketCommitResult> {
  const form = new FormData()
  form.append('message', message)
  form.append('branch', branch)
  if (author) {
    form.append('author', `${author.name} <${author.email}>`)
  }

  for (const change of changes) {
    if (change.content === null) {
      // Bitbucket deletes files by sending a field with the path and empty value.
      form.append(change.path, new File([], change.path), change.path)
    } else {
      form.append(change.path, new File([change.content], change.path), change.path)
    }
  }

  const res = await bitbucketApi(
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/src`,
    token,
    {
      method: 'POST',
      body: form,
    }
  )
  const data = await res.json() as { hash: string; links: { html: { href: string } } }
  return { hash: data.hash, links: data.links }
}

export async function createPullRequest(
  workspace: string,
  repoSlug: string,
  sourceBranch: string,
  targetBranch: string,
  title: string,
  description: string,
  token: string
): Promise<{ id: number; links: { html: { href: string } } }> {
  const res = await bitbucketApi(
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/pullrequests`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        source: { branch: { name: sourceBranch } },
        destination: { branch: { name: targetBranch } },
      }),
    }
  )
  const data = await res.json() as { id: number; links: { html: { href: string } } }
  return { id: data.id, links: data.links }
}
