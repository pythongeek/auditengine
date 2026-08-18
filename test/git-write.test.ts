import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as githubWrite from '../src/lib/github-write'
import * as gitlabWrite from '../src/lib/gitlab-write'
import * as bitbucketWrite from '../src/lib/bitbucket-write'
import { createBranch, commitFiles, createPullRequest } from '../src/lib/git-write'
import { makeMockEnvStrings } from './helpers'
import type { Env } from '../src/types/index'

const mockDb = {
  prepare: () => ({
    bind: () => ({
      first: () => Promise.resolve(null),
      all: () => Promise.resolve({ results: [] }),
      run: () => Promise.resolve({ changes: 1 }),
    }),
  }),
} as unknown as D1Database

const env: Env = {
  ...makeMockEnvStrings({ GITHUB_TOKEN: 'github-token', GITLAB_TOKEN: 'gitlab-token', BITBUCKET_TOKEN: 'bitbucket-token', ENCRYPTION_KEY: 'enc-key-32chars-long-enough' }),
  DB: mockDb,
} as Env

describe('github-write', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a branch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ object: { sha: 'abc123' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await githubWrite.createBranch('owner', 'repo', 'feature', 'main-sha', 'token')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/git/refs',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('commits multiple files atomically', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: { sha: 'base-sha' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tree: { sha: 'base-tree' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'blob-sha-1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'tree-sha' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: 'commit-sha', html_url: 'https://github.com/owner/repo/commit/commit-sha' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ref: 'refs/heads/branch' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await githubWrite.commitFiles('owner', 'repo', 'branch', [
      { path: 'src/a.ts', content: 'export {}' },
      { path: 'src/b.ts', content: null },
    ], 'test commit', 'token')

    expect(result.sha).toBe('commit-sha')
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('creates a pull request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/owner/repo/pull/42' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await githubWrite.createPullRequest('owner', 'repo', 'feature', 'main', 'Title', 'Body', 'token')
    expect(result.number).toBe(42)
  })
})

describe('gitlab-write', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a branch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await gitlabWrite.createBranch('group/repo', 'feature', 'main', 'token')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gitlab.com/api/v4/projects/group%2Frepo/repository/branches',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('commits files with actions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'commit-id', web_url: 'https://gitlab.com/group/repo/-/commit/commit-id' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await gitlabWrite.commitFiles('group/repo', 'branch', [
      { path: 'src/a.ts', content: 'export {}' },
      { path: 'src/b.ts', content: null },
    ], 'test commit', 'token')
    expect(result.id).toBe('commit-id')
  })

  it('creates a merge request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ iid: 7, web_url: 'https://gitlab.com/group/repo/-/merge_requests/7' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await gitlabWrite.createMergeRequest('group/repo', 'feature', 'main', 'Title', 'Body', 'token')
    expect(result.iid).toBe(7)
  })
})

describe('bitbucket-write', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a branch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await bitbucketWrite.createBranch('workspace', 'repo', 'feature', 'abc123', 'token')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.bitbucket.org/2.0/repositories/workspace/repo/refs/branches',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('commits files via multipart', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ hash: 'commit-hash', links: { html: { href: 'https://bitbucket.org/workspace/repo/commits/commit-hash' } } }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await bitbucketWrite.commitFiles('workspace', 'repo', 'branch', [
      { path: 'src/a.ts', content: 'export {}' },
    ], 'test commit', 'token')
    expect(result.hash).toBe('commit-hash')
  })

  it('creates a pull request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 5, links: { html: { href: 'https://bitbucket.org/workspace/repo/pull-requests/5' } } }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await bitbucketWrite.createPullRequest('workspace', 'repo', 'feature', 'main', 'Title', 'Body', 'token')
    expect(result.id).toBe(5)
  })
})

describe('git-write unified', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches createBranch to github', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: { sha: 'base-sha' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await createBranch('https://github.com/owner/repo', 'feature', 'main', 'tenant-1', env)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/git/refs',
      expect.anything()
    )
  })

  it('dispatches commitFiles to gitlab', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'commit-id', web_url: 'https://gitlab.com/group/repo/-/commit/commit-id' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await commitFiles('https://gitlab.com/group/repo', 'branch', [{ path: 'src/a.ts', content: 'export {}' }], 'test', 'tenant-1', env)
    expect(result.sha).toBe('commit-id')
  })

  it('dispatches createPullRequest to bitbucket', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 5, links: { html: { href: 'https://bitbucket.org/workspace/repo/pull-requests/5' } } }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await createPullRequest('https://bitbucket.org/workspace/repo', 'feature', 'main', 'Title', 'Body', 'tenant-1', env)
    expect(result.id).toBe(5)
  })
})
