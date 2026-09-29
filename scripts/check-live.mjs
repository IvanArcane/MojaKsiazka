import { chromium, devices, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const url = process.argv[2] || 'http://localhost:4173/MojaKsiazka/'
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ ...devices['Pixel 7'] })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.addInitScript(() => {
    window.showOpenFilePicker = undefined
    window.showSaveFilePicker = undefined
  })
  await page.goto(url)
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/live-welcome.png', fullPage: true })
  await page.locator('#file-input').setInputFiles({
    name: 'books.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"books":[]}'),
  })
  await page.getByRole('button', { name: 'Dodaj książkę', exact: true }).click()
  await page.getByLabel('Numer ISBN').fill('9780140328721')
  await page.getByRole('button', { name: 'Szukaj', exact: true }).click()
  await expect(page.locator('#search-result h3')).toHaveText('Fantastic Mr. Fox', { timeout: 35_000 })
  await expect(page.locator('#search-result .authors')).toHaveText('Roald Dahl')
  await expect(page.locator('#search-result img')).toHaveCount(1)
  await expect.poll(() => page.locator('#search-result img').evaluate(img => img.complete && img.naturalWidth > 0), { timeout: 25_000 }).toBe(true)
  await page.screenshot({ path: 'test-results/live-result.png', fullPage: true })
  await page.getByRole('button', { name: 'Dodaj do półki' }).click()
  await expect(page.locator('.book-card')).toHaveCount(1)
  await expect.poll(() => page.locator('.book-card img').evaluate(img => img.complete && img.naturalWidth > 0), { timeout: 25_000 }).toBe(true)
  await page.screenshot({ path: 'test-results/live-shelf.png', fullPage: true })
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  const session = await page.context().newCDPSession(page)
  await session.send('Page.enable')
  const installability = await session.send('Page.getInstallabilityErrors')
  expect(errors).toEqual([])
  expect(installability.installabilityErrors).toEqual([])
  console.log(JSON.stringify({ url, book: 'Fantastic Mr. Fox', author: 'Roald Dahl', consoleErrors: errors, installability: installability.installabilityErrors, result: 'OK' }))
} finally { await browser.close() }
