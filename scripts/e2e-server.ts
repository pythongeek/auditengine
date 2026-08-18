import http from 'node:http'
import { LOGIN_HTML } from '../src/dashboard/login-html'
import { TENANT_SELECTOR_HTML } from '../src/dashboard/tenant-selector-html'
import { AUDIT_LIST_HTML } from '../src/dashboard/audit-list-html'
import { TASK_BOARD_HTML } from '../src/dashboard/task-board-html'
import { FINDING_DETAIL_HTML } from '../src/dashboard/finding-detail-html'
import { ONBOARDING_HTML } from '../src/dashboard/onboarding-html'
import { SETTINGS_HTML } from '../src/dashboard/settings-html'

const PAGES: Record<string, string> = {
  '/login': LOGIN_HTML,
  '/tenants': TENANT_SELECTOR_HTML,
  '/audits': AUDIT_LIST_HTML,
  '/task-board': TASK_BOARD_HTML,
  '/finding': FINDING_DETAIL_HTML,
  '/onboarding': ONBOARDING_HTML,
  '/settings': SETTINGS_HTML,
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000

const server = http.createServer((req, res) => {
  const html = req.url && PAGES[req.url.split('?')[0]]
  if (html) {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
    return
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`E2E server listening on http://localhost:${PORT}`)
})
