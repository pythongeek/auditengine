import { test, expect } from '@playwright/test'
import { loadPage, mockApiResponse } from './helpers'

test.describe('tenant selector', () => {
  test('renders tenants and navigates to audit list', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants', {
      tenants: [
        { id: 'tenant-1', name: 'Tenant One', plan: 'free' },
        { id: 'tenant-2', name: 'Tenant Two', plan: 'pro' },
      ],
    })
    await loadPage(page, 'tenants', '/tenants', 'token-123')

    await expect(page.locator('.tenant')).toHaveCount(2)
    await expect(page.locator('.tenant >> nth=0')).toContainText('tenant-1')
    await page.click('.tenant >> nth=0')

    await expect(page).toHaveURL('http://localhost:3000/audits')
    expect(await page.evaluate(() => localStorage.getItem('auditengine_tenant'))).toBe('tenant-1')
  })

  test('shows message when no tenants exist', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants', { tenants: [] })
    await loadPage(page, 'tenants', '/tenants', 'token-123')

    await expect(page.locator('.empty')).toBeVisible()
  })

  test('matches tenant selector snapshot', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants', {
      tenants: [{ id: 'tenant-1', name: 'Tenant One', plan: 'free' }],
    })
    await loadPage(page, 'tenants', '/tenants', 'token-123')
    await expect(page).toHaveScreenshot('tenant-selector.png')
  })
})
