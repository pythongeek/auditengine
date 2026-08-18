import { test, expect } from '@playwright/test'
import { loadPage, mockApiResponse } from './helpers'

test.describe('audit list', () => {
  test('renders audits and links to task board', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants/tenant-1/audits', {
      tenant_id: 'tenant-1',
      audits: [
        {
          id: 'run-1',
          repo_url: 'https://github.com/org/repo',
          repo_branch: 'main',
          status: 'complete',
          readiness_score: 82,
          total_files: 12,
          files_analyzed: 12,
          findings_count: 3,
        },
      ],
    })
    await loadPage(page, 'audits', '/audits', 'token-123', 'tenant-1')

    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody')).toContainText('run-1')
    await expect(page.locator('tbody')).toContainText('82')
    await expect(page.locator('a[href="/task-board?audit_run_id=run-1"]')).toBeVisible()
  })

  test('shows empty state when no audits exist', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants/tenant-1/audits', { tenant_id: 'tenant-1', audits: [] })
    await loadPage(page, 'audits', '/audits', 'token-123', 'tenant-1')

    await expect(page.locator('#empty')).toBeVisible()
  })

  test('matches audit list snapshot', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants/tenant-1/audits', {
      tenant_id: 'tenant-1',
      audits: [{ id: 'run-1', repo_url: 'https://github.com/org/repo', repo_branch: 'main', status: 'complete', readiness_score: 82, total_files: 12, files_analyzed: 12, findings_count: 3 }],
    })
    await loadPage(page, 'audits', '/audits', 'token-123', 'tenant-1')
    await expect(page).toHaveScreenshot('audit-list.png')
  })
})
