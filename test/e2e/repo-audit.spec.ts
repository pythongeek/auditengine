import { test, expect } from '@playwright/test'
import { loadPage, mockApiResponse, mockApiFailure } from './helpers'

const TOKEN = 'tenant-token'
const TENANT_ID = 'tenant-1'
const REPO_URL = 'https://github.com/owner/repo'

test.describe('repository audit flows', () => {
  test('repos page shows audit-all and audit-files actions', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants/' + TENANT_ID + '/audits', {
      tenant_id: TENANT_ID,
      audits: [
        { id: 'run-1', repo_url: REPO_URL, repo_branch: 'main', status: 'complete', readiness_score: 80, total_files: 5, files_analyzed: 5, findings_count: 2, created_at: Date.now() },
      ],
    })
    await loadPage(page, 'repos', '/repos', TOKEN, TENANT_ID)

    await expect(page.locator('h1')).toHaveText('Repositories')
    await expect(page.locator('.repo-row')).toHaveCount(1)
    await expect(page.locator('a:has-text("Audit all")')).toHaveAttribute('href', '/audit/new?repo=' + encodeURIComponent(REPO_URL))
    await expect(page.locator('a:has-text("Audit files")')).toHaveAttribute('href', '/audit/new?repo=' + encodeURIComponent(REPO_URL) + '&select=1')
  })

  test('audit/new auto-loads file tree and sends selected_paths on start', async ({ page }) => {
    const files = [
      { path: 'src/index.ts', type: 'blob' },
      { path: 'src/lib/helpers.ts', type: 'blob' },
      { path: 'README.md', type: 'blob' },
    ]
    await mockApiResponse(page, '**/api/v1/repo/files', { files })

    let startBody: unknown
    await page.route('**/audit/start', async (route) => {
      startBody = await route.request().postDataJSON()
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ audit_run_id: 'run-repo-files', status: 'queued' }) })
    })

    await loadPage(page, 'audit-new', '/audit/new?repo=' + encodeURIComponent(REPO_URL) + '&branch=main&select=1', TOKEN, TENANT_ID)

    await expect(page.locator('#fileListLoading')).toHaveClass(/hidden/)
    await expect(page.locator('.file-item')).toHaveCount(3)
    await expect(page.locator('#fileListCount')).toHaveText('3 of 3 selected')

    await page.click('#selectNone')
    await expect(page.locator('#fileListCount')).toHaveText('0 of 3 selected')

    await page.click('#selectAll')
    await expect(page.locator('#fileListCount')).toHaveText('3 of 3 selected')

    await page.fill('#fileFilter', 'index')
    await expect(page.locator('.file-item')).toHaveCount(1)

    await page.fill('#fileFilter', '')
    await page.fill('#auditId', 'run-repo-files')
    await page.click('#startBtn')

    await expect(page.locator('#status.ok')).toContainText('Audit queued')
    expect(startBody).toMatchObject({
      audit_run_id: 'run-repo-files',
      repo_url: REPO_URL,
      branch: 'main',
      selected_paths: ['src/index.ts', 'src/lib/helpers.ts', 'README.md'],
    })
  })

  test('audit/new starts full repo audit when file tree not loaded', async ({ page }) => {
    let startBody: unknown
    await page.route('**/audit/start', async (route) => {
      startBody = await route.request().postDataJSON()
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ audit_run_id: 'run-full', status: 'queued' }) })
    })

    await loadPage(page, 'audit-new', '/audit/new', TOKEN, TENANT_ID)
    await page.fill('#repoUrl', REPO_URL)
    await page.fill('#branch', 'main')
    await page.fill('#auditId', 'run-full')
    await page.click('#startBtn')

    await expect(page.locator('#status.ok')).toContainText('Audit queued')
    expect(startBody).toMatchObject({
      audit_run_id: 'run-full',
      repo_url: REPO_URL,
      branch: 'main',
    })
    expect((startBody as Record<string, unknown>).selected_paths).toBeUndefined()
  })

  test('audit/new shows error when file tree load fails', async ({ page }) => {
    await mockApiFailure(page, '**/api/v1/repo/files', 500, { error: 'Git provider not configured' })
    await loadPage(page, 'audit-new', '/audit/new?repo=' + encodeURIComponent(REPO_URL) + '&select=1', TOKEN, TENANT_ID)

    await expect(page.locator('#fileListError')).toContainText('Git provider not configured')
    await expect(page.locator('#fileListSection')).toHaveClass(/hidden/)
  })
})
