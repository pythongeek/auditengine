import { test, expect } from '@playwright/test'
import { loadPage, mockApiResponse } from './helpers'

test.describe('task board', () => {
  test('renders tasks in columns', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants/tenant-1/audits/run-1/tasks', {
      tenant_id: 'tenant-1',
      audit_run_id: 'run-1',
      tasks: [
        { task_id: 'task-backlog-1', status: 'backlog', priority_score: 70, assigned_agent: null, finding_ids: '[]', conflict_flag: 0 },
        { task_id: 'task-progress-1', status: 'in_progress', priority_score: 90, assigned_agent: 'security', finding_ids: '[]', conflict_flag: 1 },
        { task_id: 'task-review-1', status: 'in_review', priority_score: 50, assigned_agent: null, finding_ids: '[]', conflict_flag: 0 },
      ],
    })
    await loadPage(page, 'task-board', '/task-board?audit_run_id=run-1', 'token-123', 'tenant-1')

    await expect(page.locator('.column[data-status="backlog"] .task')).toHaveCount(1)
    await expect(page.locator('.column[data-status="in_progress"] .task')).toHaveCount(1)
    await expect(page.locator('.column[data-status="in_review"] .task')).toHaveCount(1)
    await expect(page.locator('.column[data-status="in_progress"] .task .conflict')).toBeVisible()
  })

  test('moves a task to done with commit sha and human sign-off', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants/tenant-1/audits/run-1/tasks', {
      tenant_id: 'tenant-1',
      audit_run_id: 'run-1',
      tasks: [
        { task_id: 'task-1', status: 'in_review', priority_score: 80, assigned_agent: null, finding_ids: '[]', conflict_flag: 0 },
      ],
    })
    await mockApiResponse(page, '**/api/v1/tenants/tenant-1/audits/run-1/tasks/task-1', {
      task_id: 'task-1',
      status: 'done',
      commit_sha: 'abc123',
    })
    await loadPage(page, 'task-board', '/task-board?audit_run_id=run-1', 'token-123', 'tenant-1')

    await page.dragAndDrop('.task', '.column[data-status="done"]')
    await page.fill('#commitSha', 'abc123')
    await page.check('#humanApproved')
    await page.click('#confirmDone')

    await expect(page.locator('#error')).not.toContainText('Commit SHA is required')
  })

  test('matches task board snapshot', async ({ page }) => {
    await mockApiResponse(page, '**/api/v1/tenants/tenant-1/audits/run-1/tasks', {
      tenant_id: 'tenant-1',
      audit_run_id: 'run-1',
      tasks: [
        { task_id: 'task-1', status: 'backlog', priority_score: 90, assigned_agent: null, finding_ids: '[]', conflict_flag: 0 },
      ],
    })
    await loadPage(page, 'task-board', '/task-board?audit_run_id=run-1', 'token-123', 'tenant-1')
    await expect(page).toHaveScreenshot('task-board.png')
  })
})
