import { test, expect } from '@playwright/test'
import { loadPage, mockApiResponse, mockApiFailure } from './helpers'

test.describe('login page', () => {
  test('stores token and redirects on valid login', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenant', {
      tenant: { id: 'tenant-1', name: 'tenant-1', plan: 'free' },
    })
    await loadPage(page, 'login', '/login')

    await page.fill('#token', 'valid-token')
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL('/tenants')
    expect(await page.evaluate(() => localStorage.getItem('auditengine_token'))).toBe('valid-token')
  })

  test('shows error on invalid token', async ({ page }) => {
    await mockApiFailure(page, '**/api/v1/tenants', 401, { error: 'Invalid token' })
    await loadPage(page, 'login', '/login')

    await page.fill('#token', 'bad-token')
    await page.click('button[type="submit"]')

    await expect(page.locator('#error')).toHaveText('Invalid token')
  })

  test('matches login snapshot', async ({ page }) => {
    await loadPage(page, 'login', '/login')
    await expect(page).toHaveScreenshot('login.png')
  })
})
