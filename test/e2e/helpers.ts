import { type Page } from '@playwright/test'

export type PageName = 'login' | 'tenants' | 'audits' | 'task-board' | 'finding' | 'onboarding' | 'settings'

export async function seedLocalStorage(page: Page, token: string, tenantId?: string): Promise<void> {
  await page.evaluate(
    ({ token, tenantId }: { token: string; tenantId?: string }) => {
      localStorage.setItem('auditengine_token', token)
      if (tenantId) localStorage.setItem('auditengine_tenant', tenantId)
    },
    { token, tenantId }
  )
}

export async function loadPage(page: Page, name: PageName, path: string, token?: string, tenantId?: string): Promise<void> {
  if (token) {
    // Load a page on the same origin first to establish localStorage, then navigate to target
    await page.goto('http://localhost:3000/login')
    await seedLocalStorage(page, token, tenantId)
  }
  await page.goto(`http://localhost:3000${path}`)
}

export function mockApiResponse(page: Page, urlOrPattern: string, body: unknown): ReturnType<Page['route']> {
  return page.route(urlOrPattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

export function mockApiFailure(page: Page, urlOrPattern: string, status: number, body: unknown): ReturnType<Page['route']> {
  return page.route(urlOrPattern, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}
