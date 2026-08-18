/**
 * GitLab write operations: branch, commit, merge request.
 * Uses the Commits API for atomic multi-file commits.
 */

export interface GitLabFileChange {
  path: string
  content: string | null // null = delete
}

export interface GitLabCommitResult {
  id: string
  web_url: string
}

async function gitlabApi(url: string, token: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new Error(`GitLab API error ${res.status}: ${text}`)
  }
  return res
}

export function encodeProjectPath(projectPath: string): string {
  return encodeURIComponent(projectPath)
}

export async function createBranch(
  projectPath: string,
  branch: string,
  ref: string,
  token: string
): Promise<void> {
  await gitlabApi(
    `https://gitlab.com/api/v4/projects/${encodeProjectPath(projectPath)}/repository/branches`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        branch,
        ref,
      }),
    }
  )
}

export async function commitFiles(
  projectPath: string,
  branch: string,
  changes: GitLabFileChange[],
  message: string,
  token: string,
  author?: { name: string; email: string }
): Promise<GitLabCommitResult> {
  const actions = changes.map(change => {
    if (change.content === null) {
      return {
        action: 'delete',
        file_path: change.path,
      }
    }
    return {
      action: 'update',
      file_path: change.path,
      content: change.content,
    }
  })

  const payload: Record<string, unknown> = {
    branch,
    commit_message: message,
    actions,
  }
  if (author) {
    payload.author_name = author.name
    payload.author_email = author.email
  }

  const res = await gitlabApi(
    `https://gitlab.com/api/v4/projects/${encodeProjectPath(projectPath)}/repository/commits`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
  const data = await res.json() as { id: string; web_url: string }
  return { id: data.id, web_url: data.web_url }
}

export async function createMergeRequest(
  projectPath: string,
  sourceBranch: string,
  targetBranch: string,
  title: string,
  description: string,
  token: string
): Promise<{ iid: number; web_url: string }> {
  const res = await gitlabApi(
    `https://gitlab.com/api/v4/projects/${encodeProjectPath(projectPath)}/merge_requests`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title,
        description,
      }),
    }
  )
  const data = await res.json() as { iid: number; web_url: string }
  return { iid: data.iid, web_url: data.web_url }
}
