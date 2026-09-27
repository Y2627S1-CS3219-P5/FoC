/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Added real-browser member and administrator Supplier journeys against
 * the disposable live Compose stack for issue #31.
 * Author review: Pending project-author review.
 */
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'

const memberUsername = requiredEnvironment('SUPPLIER_UI_MEMBER_USERNAME')
const memberEmail = requiredEnvironment('SUPPLIER_UI_MEMBER_EMAIL')
const memberPassword = requiredEnvironment('SUPPLIER_UI_MEMBER_PASSWORD')
const adminUsername = requiredEnvironment('SUPPLIER_UI_ADMIN_USERNAME')
const adminPassword = requiredEnvironment('SUPPLIER_UI_ADMIN_PASSWORD')

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  await createMember(request)
})

test('MEMBER browses, searches, filters, sorts, pages and views live Suppliers responsively', async ({ page }, testInfo) => {
  await login(page, memberUsername, memberPassword)

  await expect(page).toHaveURL(/\/suppliers$/)
  await expect(page.getByRole('heading', { name: 'Suppliers', exact: true })).toBeVisible()
  await expect(page.getByText('21 results')).toBeVisible()
  await expect(page.getByRole('link', { name: /Manage Suppliers|Manage/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Add Supplier' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0)
  await assertNoHorizontalOverflow(page, 'desktop member catalogue')

  await page.getByRole('searchbox', { name: 'Search name or location' }).fill('printer')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page).toHaveURL(/q=printer/)
  await expect(page.getByRole('link', { name: 'Printer @ Com 2', exact: true })).toBeVisible()
  await expect(page.getByText('1 result')).toBeVisible()

  await clearFilters(page)
  await page.getByLabel('Building').selectOption('CENTRAL_LIBRARY')
  await expect(page).toHaveURL(/buildingCode=CENTRAL_LIBRARY/)
  await expect(page.getByText(/result/)).toBeVisible()

  await clearFilters(page)
  await page.getByLabel('Category').selectOption('PRINTING')
  await expect(page).toHaveURL(/category=PRINTING/)
  await expect(page.getByRole('link', { name: 'Printer @ Com 2', exact: true })).toBeVisible()

  await clearFilters(page)
  await page.getByLabel('Sort by').selectOption('name,desc')
  await expect(page).toHaveURL(/sort=name%2Cdesc/)
  await expect(page.getByText('21 results')).toBeVisible()
  await expect(page.locator('article h2').first()).toHaveText('he by He Brews')

  await clearFilters(page)
  await expect(page.getByRole('navigation', { name: 'Supplier catalogue pages' })).toContainText('Page 1 of 2')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/page=1/)
  await expect(page.getByRole('navigation', { name: 'Supplier catalogue pages' })).toContainText('Page 2 of 2')

  await page.getByRole('button', { name: 'Previous' }).click()
  const firstSupplierName = await page.locator('article h2').first().innerText()
  await page.getByRole('link', { name: `View details for ${firstSupplierName}` }).click()
  await expect(page.getByRole('heading', { name: firstSupplierName, exact: true })).toBeVisible()
  await expect(page.getByText('Typical hours', { exact: true })).toBeVisible()
  await expect(page.getByText('Coordinates', { exact: true })).toBeVisible()
  await assertNoHorizontalOverflow(page, 'desktop member detail')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/suppliers')
  await expect(page.getByRole('heading', { name: 'Suppliers', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Manage Suppliers|Manage/ })).toHaveCount(0)
  await assertNoHorizontalOverflow(page, 'mobile member catalogue')
  await captureEvidence(page, testInfo, 'member-mobile-catalogue.png')

  await page.getByRole('link', { name: /View details for/ }).first().click()
  await expect(page.getByText('No errand-order action is available yet.')).toBeVisible()
  await assertNoHorizontalOverflow(page, 'mobile member detail')
})

test('ADMINISTRATOR creates, edits, archives, inspects and restores the same live Supplier', async ({ page }, testInfo) => {
  const createdName = 'Browser Verification Cafe'
  const editedName = 'Browser Verification Hub'

  await login(page, adminUsername, adminPassword)
  await expect(page.getByRole('link', { name: 'Manage Suppliers' })).toBeVisible()
  await page.getByRole('link', { name: 'Manage Suppliers' }).click()
  await expect(page.getByRole('heading', { name: 'Supplier management' })).toBeVisible()
  await assertNoHorizontalOverflow(page, 'desktop administrator management')

  await page.getByRole('link', { name: 'Add Supplier' }).click()
  await page.getByLabel('Supplier name').fill(createdName)
  await page.getByLabel('Building').selectOption('COM3')
  await page.getByRole('checkbox', { name: 'Food' }).check()
  await page.getByLabel('Location description').fill('Level 1 beside the browser verification desk')
  await page.getByLabel('Floor (optional)').fill('1')
  await page.getByRole('radio', { name: 'Open all day' }).check()
  await page.getByRole('button', { name: 'Create Supplier' }).click()

  await expect(page).toHaveURL(/\/suppliers\/admin/)
  const createdCard = page.locator('article').filter({ has: page.getByRole('heading', { name: createdName, exact: true }) })
  await expect(createdCard).toBeVisible()
  const supplierHref = await createdCard.getByRole('link', { name: 'View' }).getAttribute('href')
  expect(supplierHref).toMatch(/^\/suppliers\/[0-9a-f-]+$/)

  await createdCard.getByRole('link', { name: 'Edit' }).click()
  await page.getByLabel('Supplier name').fill(editedName)
  await page.getByLabel('Location description').fill('Level 2 beside the live verification desk')
  await page.getByRole('button', { name: 'Save changes' }).click()

  const editedCard = page.locator('article').filter({ has: page.getByRole('heading', { name: editedName, exact: true }) })
  await expect(editedCard).toBeVisible()
  await expect(editedCard).toContainText('Level 2 beside the live verification desk')
  await expect(editedCard.getByRole('link', { name: 'View' })).toHaveAttribute('href', supplierHref!)

  await editedCard.getByRole('button', { name: 'Archive' }).click()
  const archiveDialog = page.getByRole('alertdialog', { name: 'Archive Supplier?' })
  await expect(archiveDialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await archiveDialog.getByRole('button', { name: 'Archive Supplier' }).click()
  await expect(editedCard).toHaveCount(0)

  await page.getByRole('button', { name: 'Archived' }).click()
  const archivedCard = page.locator('article').filter({ has: page.getByRole('heading', { name: editedName, exact: true }) })
  await expect(archivedCard).toBeVisible()
  await expect(archivedCard).toContainText('ARCHIVED')
  await expect(archivedCard.getByRole('link', { name: 'View' })).toHaveAttribute('href', supplierHref!)
  await captureEvidence(page, testInfo, 'administrator-archived-view.png')

  await archivedCard.getByRole('button', { name: 'Restore' }).click()
  const restoreDialog = page.getByRole('alertdialog', { name: 'Restore Supplier?' })
  await restoreDialog.getByRole('button', { name: 'Restore Supplier' }).click()
  await expect(archivedCard).toHaveCount(0)

  await page.getByRole('button', { name: 'Active' }).click()
  const restoredCard = page.locator('article').filter({ has: page.getByRole('heading', { name: editedName, exact: true }) })
  await expect(restoredCard).toBeVisible()
  await expect(restoredCard).toContainText('ACTIVE')
  await expect(restoredCard.getByRole('link', { name: 'View' })).toHaveAttribute('href', supplierHref!)

  await page.setViewportSize({ width: 390, height: 844 })
  await assertNoHorizontalOverflow(page, 'mobile administrator management')
})

async function createMember(request: APIRequestContext) {
  const response = await request.post('/api/v1/auth/register', {
    data: { username: memberUsername, email: memberEmail, password: memberPassword },
  })
  expect(response.status(), await response.text()).toBe(201)
}

async function login(page: Page, username: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Username or email').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/suppliers$/)
}

async function clearFilters(page: Page) {
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page).toHaveURL(/\/suppliers$/)
  await expect(page.getByText('21 results')).toBeVisible()
}

async function assertNoHorizontalOverflow(page: Page, context: string) {
  const dimensions = await page.evaluate(() => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))
  expect(dimensions.documentScrollWidth, `${context}: document overflow`).toBeLessThanOrEqual(dimensions.documentClientWidth)
  expect(dimensions.bodyScrollWidth, `${context}: body overflow`).toBeLessThanOrEqual(dimensions.bodyClientWidth)
}

async function captureEvidence(page: Page, testInfo: TestInfo, filename: string) {
  await page.screenshot({ path: testInfo.outputPath(filename), fullPage: true })
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required. Run npm run test:e2e.`)
  return value
}
