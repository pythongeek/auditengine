import { defineConfig } from '@playwright/test'
import defaultConfig from './playwright.config'

/**
 * Live E2E config. Point BASE_URL at the deployed Workers URL, e.g.:
 *   BASE_URL=https://auditengine.tsnion.workers.dev npx playwright test --config=playwright.live.config.ts
 *
 * Optional env vars for tests that exercise real GitHub repos:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, GITHUB_TOKEN
 */
export default defineConfig({
  ...defaultConfig,
  webServer: undefined,
  use: {
    ...defaultConfig.use,
    baseURL: process.env.BASE_URL || 'https://auditengine.tsnion.workers.dev',
  },
})
