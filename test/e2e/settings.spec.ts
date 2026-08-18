import { test, expect } from '@playwright/test'
import { loadPage } from './helpers'

test.describe('settings page', () => {
  test('renders the API key settings form', async ({ page }) => {
    await loadPage(page, 'settings', '/settings')

    await expect(page).toHaveTitle(/Settings/)
    await expect(page.locator('h1')).toHaveText('Settings')
    await expect(page.locator('#kimiKey')).toBeVisible()
    await expect(page.locator('#minimaxKey')).toBeVisible()
    await expect(page.locator('#saveBtn')).toBeVisible()
  })

  test('matches settings snapshot', async ({ page }) => {
    await loadPage(page, 'settings', '/settings')
    await expect(page).toHaveScreenshot('settings.png')
  })
})
