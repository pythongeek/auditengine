import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', '.kilo', 'test/e2e'],
  },
  resolve: {
    alias: {
      'cloudflare:workers': path.resolve(__dirname, './test/mocks/cloudflare-workers.ts'),
    },
  },
})
