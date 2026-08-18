import { test, expect } from '@playwright/test'
import { loadPage, mockApiResponse } from './helpers'

test.describe('tenant selector', () => {
  test('renders current tenant and navigates to audit list', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenant', {
      tenant: { id: 'tenant-1', name: 'Tenant One', plan: 'free' },
    })
    await loadPage(page, 'tenants', '/tenants', 'token-123')

    await expect(page.locator('.tenant')).toHaveCount(1)
    await expect(page.locator('.tenant')).toContainText('tenant-1')
    await page.click('.tenant')

    await expect(page).toHaveURL('/audits')
    expect(await page.evaluate(() => localStorage.getItem('auditengine_tenant'))).toBe('tenant-1')
  })

  test('shows message when no tenant exists', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenant', { tenant: null })
    await loadPage(page, 'tenants', '/tenants', 'token-123')

    await expect(page.locator('.empty')).toBeVisible()
  })

  test('matches tenant selector snapshot', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenant', {
      tenant: { id: 'tenant-1', name: 'Tenant One', plan: 'free' },
    })
    await loadPage(page, 'tenants', '/tenants', 'token-123')
    await expect(page).toHaveScreenshot('tenant-selector.png')
  })
})
