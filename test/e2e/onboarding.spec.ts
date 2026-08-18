import { test, expect } from '@playwright/test'
import { loadPage } from './helpers'

test.describe('onboarding wizard', () => {
  test('renders the onboarding page with three steps', async ({ page }) => {
    await loadPage(page, 'onboarding', '/onboarding')

    await expect(page).toHaveTitle(/Onboarding/)
    await expect(page.locator('h1')).toHaveText('Welcome to AuditEngine')
    await expect(page.locator('.step')).toHaveCount(3)
    await expect(page.locator('.step >> nth=0')).toContainText('Log in')
    await expect(page.locator('.step >> nth=1')).toContainText('Connect a repository')
    await expect(page.locator('.step >> nth=2')).toContainText('Track results')
  })

  test('links to login, new audit, and audits pages', async ({ page }) => {
    await loadPage(page, 'onboarding', '/onboarding')

    await expect(page.locator('.step').nth(0).locator('a')).toHaveAttribute('href', '/login')
    await expect(page.locator('.step').nth(1).locator('a')).toHaveAttribute('href', '/audit/new')
    await expect(page.locator('.step').nth(2).locator('a')).toHaveAttribute('href', '/audits')
  })

  test('matches onboarding snapshot', async ({ page }) => {
    await loadPage(page, 'onboarding', '/onboarding')
    await expect(page).toHaveScreenshot('onboarding.png')
  })
})
