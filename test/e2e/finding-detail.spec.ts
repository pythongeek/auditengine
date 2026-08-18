import { test, expect } from '@playwright/test'
import { loadPage, mockApiResponse } from './helpers'

test.describe('finding detail', () => {
  test('renders findings and detail on click', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants/tenant-1/audits/run-1/findings', {
      tenant_id: 'tenant-1',
      audit_run_id: 'run-1',
      findings: [
        { finding_id: 'F-1', file: 'src/auth.ts', category: 'auth', severity: 'critical', status: 'open', evidence_quote: 'missing auth check' },
      ],
    })
    await loadPage(page, 'finding', '/finding?audit_run_id=run-1', 'token-123', 'tenant-1')

    await page.click('.finding')

    await expect(page.locator('#detailId')).toHaveText('F-1')
    await expect(page.locator('#detailFile')).toHaveText('src/auth.ts')
    await expect(page.locator('#detailEvidence')).toContainText('missing auth check')
  })

  test('submits human sign-off and marks finding resolved', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants/tenant-1/audits/run-1/findings', {
      tenant_id: 'tenant-1',
      audit_run_id: 'run-1',
      findings: [
        { finding_id: 'F-1', file: 'src/auth.ts', category: 'auth', severity: 'critical', status: 'open', evidence_quote: 'missing auth check' },
      ],
    })
    await mockApiResponse(page, '**/api/v1/tenants/tenant-1/audits/run-1/findings/F-1', {
      finding_id: 'F-1',
      status: 'resolved',
    })
    await loadPage(page, 'finding', '/finding?audit_run_id=run-1', 'token-123', 'tenant-1')

    await page.click('.finding')
    await page.fill('#commitSha', 'deadbeef')
    await page.check('#humanApproved')
    await page.click('#verifyBtn')

    await expect(page.locator('#verifyResult')).toContainText('resolved')
  })

  test('matches finding detail snapshot', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants/tenant-1/audits/run-1/findings', {
      tenant_id: 'tenant-1',
      audit_run_id: 'run-1',
      findings: [
        { finding_id: 'F-1', file: 'src/auth.ts', category: 'auth', severity: 'critical', status: 'open', evidence_quote: 'missing auth check' },
      ],
    })
    await loadPage(page, 'finding', '/finding?audit_run_id=run-1', 'token-123', 'tenant-1')
    await page.click('.finding')
    await expect(page).toHaveScreenshot('finding-detail.png')
  })
})
