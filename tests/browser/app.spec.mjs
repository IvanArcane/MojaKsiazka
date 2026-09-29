import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const sample = { isbn: '9780140328721', title: 'Fantastic Mr. Fox', authors: ['Roald Dahl'], description: 'Historia sprytnego lisa.', coverUrl: '', addedAt: '2026-09-29T18:00:00.000Z' }
const library = { version: 1, books: [sample] }

async function nativeFiles(page, data = { version: 1, books: [] }) {
  await page.addInitScript(initial => {
    window.__disk = JSON.stringify(initial)
    window.__denied = false
    window.__cancel = false
    window.__failWrite = false
    const handle = {
      name: 'books.json',
      getFile: async () => new File([window.__disk], 'books.json', { type: 'application/json' }),
      requestPermission: async () => { window.__denied = false; return 'granted' },
      createWritable: async () => {
        if (window.__denied) throw new DOMException('Odmowa dostępu', 'NotAllowedError')
        let pending = ''
        return { write: async value => { pending = value }, close: async () => {
          if (window.__failWrite) throw new DOMException('Brak miejsca', 'QuotaExceededError')
          window.__disk = pending
        }, abort: async () => {} }
      },
    }
    window.showSaveFilePicker = async () => { if (window.__cancel) throw new DOMException('', 'AbortError'); return handle }
    window.showOpenFilePicker = async () => { if (window.__cancel) throw new DOMException('', 'AbortError'); return [handle] }
  }, data)
}
async function fallback(page) {
  await page.addInitScript(() => {
    window.showOpenFilePicker = undefined
    window.showSaveFilePicker = undefined
  })
}
async function importJson(page, data = library) {
  await page.locator('#file-input').setInputFiles({ name: 'books.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) })
  await expect(page.locator('#shelf-title')).toBeVisible()
}
async function api(page, status = 200) {
  await page.route('https://openlibrary.org/**', route => {
    const url = route.request().url()
    const json = url.includes('/isbn/') ? { title: sample.title, authors: [{ key: '/authors/OL34184A' }], works: [{ key: '/works/OL45804W' }] }
      : url.includes('/authors/') ? { name: 'Roald Dahl' } : { description: sample.description }
    return route.fulfill({ status, json: status === 200 ? json : {} })
  })
}
async function lookup(page, isbn = '9780140328721') {
  await page.getByRole('button', { name: 'Dodaj książkę', exact: true }).click()
  await page.getByLabel('Numer ISBN').fill(isbn)
  await page.getByRole('button', { name: 'Szukaj', exact: true }).click()
}
test.beforeEach(async ({ page }) => {
  page.__errors = []
  page.on('pageerror', error => page.__errors.push(error.message))
  page.on('console', msg => { if (msg.type() === 'error') page.__errors.push(msg.text()) })
})
test.afterEach(async ({ page }, testInfo) => {
  const errors = testInfo.title.startsWith('błędny ISBN')
    ? page.__errors.filter(message => !message.includes('Failed to load resource')) : page.__errors
  expect(errors).toEqual([])
})

test('nowa biblioteka, wyszukanie, zapis, duplikat, usunięcie i ponowne otwarcie', async ({ page }) => {
  await nativeFiles(page); await api(page); await page.goto('./')
  await page.getByRole('button', { name: 'Utwórz nową bibliotekę' }).click()
  expect(JSON.parse(await page.evaluate(() => window.__disk))).toEqual({ version: 1, books: [] })
  await lookup(page, '978-0-14 032872-1')
  await expect(page.getByRole('heading', { name: sample.title })).toBeVisible()
  await expect(page.locator('.authors')).toHaveText('Roald Dahl')
  await page.getByRole('button', { name: 'Dodaj do półki' }).click()
  await expect(page.locator('.book-card')).toHaveCount(1)
  expect(JSON.parse(await page.evaluate(() => window.__disk)).books[0].isbn).toBe(sample.isbn)
  await lookup(page, '0140328726')
  await expect(page.getByRole('button', { name: 'Już na Twojej półce' })).toBeDisabled()
  await page.getByRole('button', { name: 'Zamknij okno' }).click()
  await page.locator('.book-card').click()
  await expect(page.locator('.description')).toContainText(sample.description)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Usuń z półki' }).click()
  await expect(page.locator('.book-card')).toHaveCount(0)
  expect(JSON.parse(await page.evaluate(() => window.__disk)).books).toHaveLength(0)
  await page.getByRole('button', { name: 'Zmień bibliotekę' }).click()
  await page.getByRole('button', { name: 'Otwórz istniejący books.json' }).click()
  await expect(page.getByRole('heading', { name: 'Tu zaczyna się Twoja półka' })).toBeVisible()
})

test('import i prawdziwy eksport pliku, ponowne wczytanie po odświeżeniu', async ({ page }) => {
  await fallback(page); await page.goto('./')
  await expect(page.getByText(/Ta przeglądarka nie obsługuje/)).toBeVisible()
  await importJson(page)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Pobierz JSON', exact: true }).click()
  const download = await pending
  const path = await download.path()
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(library)
  await page.reload()
  await page.locator('#file-input').setInputFiles(path)
  await expect(page.locator('.book-card')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: sample.title })).toBeVisible()
})

test('fallback tworzy pusty JSON i ostrzega o niezapisanych zmianach', async ({ page }) => {
  await fallback(page); await api(page); await page.goto('./')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Utwórz nową bibliotekę' }).click()
  const download = await downloadEvent
  expect(JSON.parse(await readFile(await download.path(), 'utf8'))).toEqual({ version: 1, books: [] })
  await lookup(page)
  await page.getByRole('button', { name: 'Dodaj do półki' }).click()
  await expect(page.getByText('Masz niezapisane zmiany.')).toBeVisible()
  const exportEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Pobierz books.json', exact: true }).click()
  expect(JSON.parse(await readFile(await (await exportEvent).path(), 'utf8')).books).toHaveLength(1)
  await expect(page.getByText('Masz niezapisane zmiany.')).toHaveCount(0)
})

test('utrata zgody na zapis zachowuje dane i pozwala ponowić zapis', async ({ page }) => {
  await nativeFiles(page); await api(page); await page.goto('./')
  await page.getByRole('button', { name: 'Utwórz nową bibliotekę' }).click()
  await page.evaluate(() => { window.__denied = true })
  await lookup(page)
  await page.getByRole('button', { name: 'Dodaj do półki' }).click()
  await expect(page.getByRole('button', { name: 'Nadaj ponownie dostęp do pliku' })).toBeVisible()
  expect(JSON.parse(await page.evaluate(() => window.__disk)).books).toHaveLength(0)
  await expect(page.locator('.book-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Nadaj ponownie dostęp do pliku' }).click()
  await expect(page.getByText('Zmiany zapisane w pliku.')).toBeVisible()
  expect(JSON.parse(await page.evaluate(() => window.__disk)).books).toHaveLength(1)
})

test('konflikt z zewnętrzną zmianą nie nadpisuje pliku', async ({ page }) => {
  await nativeFiles(page, library); await page.goto('./')
  await page.getByRole('button', { name: 'Otwórz istniejący books.json' }).click()
  await page.evaluate(() => { window.__disk = JSON.stringify({ version: 1, books: [] }) })
  await page.locator('.book-card').click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Usuń z półki' }).click()
  await expect(page.getByRole('alert')).toContainText('Plik zmienił się poza aplikacją')
  await expect(page.getByText('Masz niezapisane zmiany.')).toBeVisible()
  expect(JSON.parse(await page.evaluate(() => window.__disk)).books).toHaveLength(0)
})

test('anulowanie wyboru i błędny JSON nie niszczą otwartej biblioteki', async ({ page }) => {
  await nativeFiles(page, library); await page.goto('./')
  await page.getByRole('button', { name: 'Otwórz istniejący books.json' }).click()
  await page.getByRole('button', { name: 'Zmień bibliotekę' }).click()
  await page.evaluate(() => { window.__cancel = true })
  await page.getByRole('button', { name: 'Otwórz istniejący books.json' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.locator('#file-input').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') })
  await expect(page.getByRole('alert')).toContainText('nie jest poprawnym')
  await page.getByRole('button', { name: 'Wróć do otwartej półki' }).click()
  await expect(page.locator('.book-card')).toHaveCount(1)
})

test('błędny ISBN, brak książki i brak internetu', async ({ page, context }) => {
  await fallback(page); await api(page, 404); await page.goto('./'); await importJson(page, { version: 1, books: [] })
  await lookup(page, '1234567890123')
  await expect(page.locator('#search-message')).toContainText('Nieprawidłowy ISBN')
  await page.getByLabel('Numer ISBN').fill(sample.isbn)
  await page.getByRole('button', { name: 'Szukaj', exact: true }).click()
  await expect(page.locator('#search-message')).toHaveText('Nie znaleziono książki.')
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Szukaj', exact: true }).click()
  await expect(page.locator('#search-message')).toContainText('Brak internetu')
})

test('dane JSON są tekstem, responsywność i zrzut ekranu', async ({ page }, testInfo) => {
  await fallback(page); await page.goto('./')
  await page.screenshot({ path: testInfo.outputPath('welcome.png'), fullPage: true })
  await importJson(page, { version: 1, books: [{ ...sample, title: '<img src=x onerror=alert(1)> Żółw', coverUrl: 'javascript:alert(1)' }] })
  await expect(page.locator('.book-card img')).toHaveCount(0)
  await expect(page.locator('.book-card h2')).toHaveText('<img src=x onerror=alert(1)> Żółw')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('shelf.png'), fullPage: true })
  await page.getByRole('button', { name: 'Dodaj książkę', exact: true }).click()
  expect(await page.locator('dialog').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
})

test('PWA: manifest, kontrola service workera i otwarcie offline', async ({ page, context }) => {
  await fallback(page); await page.goto('./')
  const manifest = await (await page.request.get('manifest.webmanifest')).json()
  expect(manifest.name).toBe('Moja Półka')
  expect(manifest.display).toBe('standalone')
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.waitForFunction(() => navigator.serviceWorker.controller)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Wybierz plik biblioteki' })).toBeVisible()
  await importJson(page)
  await expect(page.locator('.book-card')).toHaveCount(1)
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys()
    return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(r => r.url)))).flat()
  })
  expect(cached.every(url => !url.includes('openlibrary.org') && !url.endsWith('books.json'))).toBe(true)
})

async function mockCamera(page, mode) {
  await page.addInitScript(mode => {
    window.__cameraStarts = 0; window.__cameraStops = 0
    window.BarcodeDetector = class {
      static async getSupportedFormats() { return ['ean_13'] }
      async detect() { return mode === 'success' ? [{ rawValue: '9780140328721' }] : [] }
    }
    HTMLMediaElement.prototype.play = async () => {}
    navigator.mediaDevices.getUserMedia = async () => {
      window.__cameraStarts++
      if (mode === 'denied') throw new DOMException('', 'NotAllowedError')
      if (mode === 'pending') await new Promise(resolve => { window.__allowCamera = resolve })
      const stream = new MediaStream()
      stream.getTracks = () => [{ stop: () => { window.__cameraStops++ } }]
      return stream
    }
  }, mode)
}

test('skaner: aparat dopiero po kliknięciu, odczyt zatrzymuje kamerę i szuka ISBN', async ({ page }) => {
  await fallback(page); await api(page); await mockCamera(page, 'success'); await page.goto('./'); await importJson(page)
  await page.getByRole('button', { name: 'Dodaj książkę', exact: true }).click()
  expect(await page.evaluate(() => window.__cameraStarts)).toBe(0)
  await page.getByRole('button', { name: 'Skanuj ISBN' }).click()
  await expect(page.getByLabel('Numer ISBN')).toHaveValue(sample.isbn)
  await expect(page.locator('#search-result').getByRole('heading', { name: sample.title, exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.__cameraStops)).toBe(1)
})

test('skaner: odmowa zgody pozwala wpisać ISBN ręcznie', async ({ page }) => {
  await fallback(page); await mockCamera(page, 'denied'); await page.goto('./'); await importJson(page)
  await page.getByRole('button', { name: 'Dodaj książkę', exact: true }).click()
  await page.getByRole('button', { name: 'Skanuj ISBN' }).click()
  await expect(page.locator('#search-message')).toContainText('Brak zgody na aparat')
  await expect(page.getByLabel('Numer ISBN')).toBeEditable()
  await expect(page.locator('#scanner-panel')).toBeHidden()
})

test('skaner: zamknięcie okna podczas prośby o zgodę zatrzymuje później uzyskany strumień', async ({ page }) => {
  await fallback(page); await mockCamera(page, 'pending'); await page.goto('./'); await importJson(page)
  await page.getByRole('button', { name: 'Dodaj książkę', exact: true }).click()
  await page.getByRole('button', { name: 'Skanuj ISBN' }).click()
  await page.waitForFunction(() => window.__allowCamera)
  await page.getByRole('button', { name: 'Zamknij okno' }).click()
  await page.evaluate(() => window.__allowCamera())
  await expect.poll(() => page.evaluate(() => window.__cameraStops)).toBe(1)
})

test('błąd zamknięcia zapisu zachowuje poprzedni plik i umożliwia ponowienie', async ({ page }) => {
  await nativeFiles(page, library); await page.goto('./')
  await page.getByRole('button', { name: 'Otwórz istniejący books.json' }).click()
  await page.evaluate(() => { window.__failWrite = true })
  await page.locator('.book-card').click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Usuń z półki' }).click()
  await expect(page.getByRole('alert')).toContainText('Nie zapisano zmian')
  expect(JSON.parse(await page.evaluate(() => window.__disk)).books).toHaveLength(1)
  await page.evaluate(() => { window.__failWrite = false })
  await page.getByRole('button', { name: 'Spróbuj zapisać ponownie' }).click()
  await expect(page.getByText('Zmiany zapisane w pliku.')).toBeVisible()
  expect(JSON.parse(await page.evaluate(() => window.__disk)).books).toHaveLength(0)
})

test('skaner: ręczne zatrzymanie i przejście w tło wyłączają aparat', async ({ page }) => {
  await fallback(page); await mockCamera(page, 'continuous'); await page.goto('./'); await importJson(page)
  await page.getByRole('button', { name: 'Dodaj książkę', exact: true }).click()
  await page.getByRole('button', { name: 'Skanuj ISBN' }).click()
  await expect.poll(() => page.evaluate(() => window.__cameraStarts)).toBe(1)
  await page.getByRole('button', { name: 'Zatrzymaj skanowanie' }).click()
  await expect.poll(() => page.evaluate(() => window.__cameraStops)).toBe(1)
  await page.getByRole('button', { name: 'Skanuj ISBN' }).click()
  await expect.poll(() => page.evaluate(() => window.__cameraStarts)).toBe(2)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => page.evaluate(() => window.__cameraStops)).toBe(2)
})
