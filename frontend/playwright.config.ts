/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Configured the isolated real-browser Supplier UI verification for
 * issue #31.
 * Author review: Pending project-author review.
 */
import { defineConfig } from '@playwright/test'

const baseURL = process.env.SUPPLIER_UI_BASE_URL

if (!baseURL) {
  throw new Error('SUPPLIER_UI_BASE_URL is required. Run npm run test:e2e to start the disposable stack.')
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
})
