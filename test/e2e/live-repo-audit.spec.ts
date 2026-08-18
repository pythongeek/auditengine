import { test, expect } from '@playwright/test'

test.describe('live deployed app', () => {
  test('loads a public repo file tree on /audit/new', async ({ page }) => {
    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD
    test.skip(!adminEmail || !adminPassword, 'ADMIN_EMAIL and ADMIN_PASSWORD env vars required')

    await page.goto('/login')
    const result = await page.evaluate(
      async ([email, password]) => {
        const auth = 'Basic ' + btoa(email + ':' + password)
        const res = await fetch('/api/v1/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body: JSON.stringify({ name: 'live-e2e' }),
        })
        if (!res.ok) {
          const err = await res.text()
          throw new Error('Tenant creation failed: ' + err)
        }
        const data = await res.json() as { token: string; tenant: { id: string } }
        localStorage.setItem('auditengine_token', data.token)
        localStorage.setItem('auditengine_tenant', data.tenant.id)
        return { tenantId: data.tenant.id }
      },
      [adminEmail, adminPassword] as [string, string]
    )

    expect(result.tenantId).toBeTruthy()

    await page.goto('/audit/new?repo=https://github.com/octocat/Hello-World&branch=master&select=1')
    await expect(page.locator('h1')).toHaveText('Start New Audit')
    await expect(page.locator('.file-item').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#fileListCount')).toContainText(/of \d+ selected/)
  })

  test('repos page loads when logged in', async ({ page }) => {
    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD
    test.skip(!adminEmail || !adminPassword, 'ADMIN_EMAIL and ADMIN_PASSWORD env vars required')

    await page.goto('/login')
    await page.evaluate(
      async ([email, password]) => {
        const auth = 'Basic ' + btoa(email + ':' + password)
        const res = await fetch('/api/v1/tenants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body: JSON.stringify({ name: 'live-e2e' }),
        })
        const data = await res.json() as { token: string; tenant: { id: string } }
        localStorage.setItem('auditengine_token', data.token)
        localStorage.setItem('auditengine_tenant', data.tenant.id)
      },
      [adminEmail, adminPassword] as [string, string]
    )

    await page.goto('/repos')
    await expect(page.locator('h1')).toHaveText('Repositories')
    await expect(page.locator('#addForm')).toBeVisible()
    await expect(page.locator('a:has-text("Audit all")')).toHaveCount(0)
  })
})
