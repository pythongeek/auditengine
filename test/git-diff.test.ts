import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getLatestCommit, getChangedFilesSince, fetchRawFile } from '../src/lib/git-diff'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockGithubApi(responses: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const key = Object.keys(responses).find(k => url.includes(k))
    if (!key) return new Response('Not found', { status: 404 })
    return new Response(JSON.stringify(responses[key]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
}

describe('git-diff helpers', () => {
  it('returns the latest commit SHA', async () => {
    mockGithubApi({ '/commits?': [{ sha: 'abc123def' }] })

    const sha = await getLatestCommit('acme', 'widgets', 'main', 'token')

    expect(sha).toBe('abc123def')
    const calls = vi.mocked(fetch).mock.calls
    expect(calls[0][0]).toContain('https://api.github.com/repos/acme/widgets/commits')
  })

  it('returns null when latest commit fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })))

    const sha = await getLatestCommit('acme', 'widgets', 'main', 'token')

    expect(sha).toBeNull()
  })

  it('fetches raw file content as base64', async () => {
    const content = btoa('const x = 1')
    mockGithubApi({ '/contents/src/auth.ts': { content, encoding: 'base64' } })

    const result = await fetchRawFile('acme', 'widgets', 'src/auth.ts', 'main', 'token')

    expect(result).toBe('const x = 1')
  })

  it('returns changed files with new content', async () => {
    const fileContent = btoa('const y = 2')
    mockGithubApi({
      '/compare/base...head': {
        files: [
          { filename: 'src/auth.ts', status: 'modified', patch: '@@ -1 +1 @@\n-const x = 1\n+const y = 2' },
          { filename: 'src/new.ts', status: 'added', patch: '@@ -0,0 +1 @@\n+const z = 3' },
          { filename: 'src/old.ts', status: 'removed' },
        ],
      },
      '/contents/src/auth.ts': { content: fileContent, encoding: 'base64' },
      '/contents/src/new.ts': { content: btoa('const z = 3'), encoding: 'base64' },
    })

    const changed = await getChangedFilesSince('acme', 'widgets', 'base', 'head', 'token')

    expect(changed).toHaveLength(3)
    expect(changed[0].path).toBe('src/auth.ts')
    expect(changed[0].status).toBe('modified')
    expect(changed[0].new_content).toBe('const y = 2')
    expect(changed[1].status).toBe('added')
    expect(changed[2].status).toBe('removed')
  })
})
