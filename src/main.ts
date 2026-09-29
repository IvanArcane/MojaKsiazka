import './style.css'
import { addBook, isbnKey, normalizeIsbn, safeCoverUrl, validIsbn, type Book, type Library } from './library.ts'
import { isCancelled, LibraryStorage, supportsFileAccess } from './storage.ts'
import { findBook } from './open-library.ts'
import { IsbnScanner } from './scanner.ts'

const bookIcon = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 13C17 8 9 9 5 11v28c6-3 13-2 19 2 6-4 13-5 19-2V11c-4-2-12-3-19 2Zm0 0v28" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>`
const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const store = new LibraryStorage()
const scanner = new IsbnScanner()
let choosing = true
let busy = false
let search: AbortController | null = null
let result: Omit<Book, 'addedAt'> | null = null
let detailIsbn: string | null = null

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="site-header"><div class="header-inner">
    <div class="brand">${bookIcon}<span>MOJA PÓŁKA</span></div>
    <button id="install" class="button small secondary" hidden>Zainstaluj aplikację</button>
  </div></header>
  <main class="container">
    <div id="offline" class="notice" role="status" hidden>Jesteś offline. Możesz otworzyć plik i przeglądać półkę. Wyszukiwanie i pobieranie okładek wymaga internetu.</div>
    <div id="message" class="notice" role="status" aria-live="polite" hidden></div>
    <div id="content"></div>
  </main>
  <footer class="site-footer">Twoje książki. Twój plik. Twoja półka.</footer>
  <input id="file-input" type="file" accept=".json,application/json" hidden />
  <dialog id="book-dialog" aria-labelledby="dialog-title"><div class="dialog-inner">
    <button class="close-button" data-action="close" aria-label="Zamknij okno">×</button>
    <div id="dialog-content"></div>
  </div></dialog>`

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const dialog = el<HTMLDialogElement>('book-dialog')
const fileInput = el<HTMLInputElement>('file-input')

function message(text: string, error = false): void {
  const node = el('message')
  node.textContent = text
  node.className = `notice${error ? ' error' : ''}`
  node.setAttribute('role', error ? 'alert' : 'status')
  node.hidden = !text
}

function cover(book: Pick<Book, 'coverUrl'>, large = false): string {
  const url = safeCoverUrl(book.coverUrl)
  return `<div class="cover${large ? ' cover-large' : ''}">${bookIcon}<span>Brak okładki</span>${url ? `<img src="${escape(url)}" alt="Okładka książki" loading="lazy" referrerpolicy="no-referrer" />` : ''}</div>`
}

function render(): void {
  const disabled = busy ? ' disabled' : ''
  if (choosing || !store.data) {
    el('content').innerHTML = `
      <section class="welcome">
        <div class="welcome-mark">${bookIcon}</div>
        <p class="eyebrow">MIEJSCE NA DOBRE HISTORIE</p>
        <h1>Wybierz plik<br />biblioteki</h1>
        <p class="lead">Zbierz przeczytane książki na swojej półce.<br class="desktop-break" /> Wystarczy jeden plik <strong>books.json</strong>.</p>
        <div class="welcome-actions">
          <button class="button" data-action="open"${disabled}>Otwórz istniejący books.json <span aria-hidden="true">↗</span></button>
          <button class="button secondary" data-action="create"${disabled}>Utwórz nową bibliotekę <span aria-hidden="true">+</span></button>
        </div>
        <p class="hint">${supportsFileAccess()
          ? 'Wskaż plik na urządzeniu. Zmiany będziemy zapisywać w nim automatycznie.'
          : 'Ta przeglądarka nie obsługuje bezpośredniego zapisu do pliku (File System Access API). Otwieraj bibliotekę przez import JSON, a po zmianach pobieraj aktualny plik.'}</p>
        <p class="hint">Po ponownym uruchomieniu wskaż plik jeszcze raz. Twoje książki są zapisane w nim, na Twoim urządzeniu.</p>
        ${supportsFileAccess() ? `<button class="text-button" data-action="import"${disabled}>Użyj importu i eksportu JSON</button>` : ''}
        ${store.data ? `<button class="text-button" data-action="back"${disabled}>Wróć do otwartej półki</button>` : ''}
      </section>`
    return
  }
  el('content').innerHTML = `
    <section aria-labelledby="shelf-title">
      <div class="shelf-heading"><div><p class="eyebrow">TWOJA BIBLIOTEKA</p><h1 id="shelf-title">Moja półka</h1></div>
        <button class="button" data-action="add"${disabled}><span aria-hidden="true">+</span> Dodaj książkę</button>
      </div>
      <div class="file-bar"><span class="file-name">${escape(store.fileName)}</span><div class="file-actions">
        <button class="text-button" data-action="download"${disabled}>Pobierz JSON</button>
        <button class="text-button" data-action="choose"${disabled}>Zmień bibliotekę</button>
      </div></div>
      ${store.dirty ? `<div class="notice warning" role="status"><strong>Masz niezapisane zmiany.</strong>
        ${store.handle ? 'Zmiany są w tej sesji, ale nie zostały zapisane w pliku.' : 'Pobierz aktualny books.json przed zamknięciem aplikacji.'}
        <div class="notice-actions">${store.handle ? `<button class="button small secondary" data-action="retry"${disabled}>${store.needsPermission ? 'Nadaj ponownie dostęp do pliku' : 'Spróbuj zapisać ponownie'}</button>` : ''}
        <button class="button small" data-action="download"${disabled}>Pobierz books.json</button></div></div>`
        : `<p class="save-status">${store.handle ? '● Zmiany zapisują się w pliku automatycznie.' : 'Tryb importu i eksportu. Po zmianach pobierz plik; przy następnym otwarciu wybierz najnowszą kopię.'}</p>`}
      ${store.data.books.length ? `<div class="shelf">${store.data.books.map(book => `
        <button class="book-card" data-isbn="${escape(book.isbn)}" aria-label="Otwórz książkę: ${escape(book.title)}"${disabled}>
          ${cover(book)}<div class="book-caption"><h2>${escape(book.title)}</h2><p>${escape(book.authors.join(', ') || 'Autor nieznany')}</p></div>
        </button>`).join('')}</div>` : `
        <div class="empty-state"><div class="empty-icon">${bookIcon}</div><h2>Tu zaczyna się Twoja półka</h2>
          <p>Każda przeczytana książka ma tu swoje miejsce.<br />Dodaj pierwszą, wpisując lub skanując ISBN.</p>
          <button class="button secondary" data-action="add"${disabled}>+ Dodaj pierwszą książkę</button>
        </div>`}
    </section>`
}

function confirmDiscard(): boolean {
  return !store.dirty || window.confirm('Masz niezapisane zmiany. Najpierw możesz pobrać kopię JSON. Czy chcesz kontynuować bez zapisu?')
}

async function openLibrary(create = false): Promise<void> {
  if (!confirmDiscard()) return
  message('')
  if (!supportsFileAccess()) {
    if (create) {
      store.createForExport(); store.download(); choosing = false; render()
      message('Rozpoczęto pobieranie pustego books.json. Sprawdź, czy plik został zapisany. Po dodaniu książek pobierz jego aktualną wersję.')
    } else fileInput.click()
    return
  }
  busy = true
  try {
    const operation = create ? store.create() : store.open()
    render()
    await operation
    choosing = false
  } catch (error) {
    if (!isCancelled(error)) message(error instanceof Error ? error.message : 'Nie udało się otworzyć pliku. Spróbuj importu JSON.', true)
  } finally { busy = false; render() }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  fileInput.value = ''
  if (!file) return
  busy = true; render()
  void store.import(file).then(() => { choosing = false; message('') }).catch(error => {
    message(error instanceof Error ? error.message : 'Nie udało się odczytać pliku.', true)
  }).finally(() => { busy = false; render() })
})

function stopScanning(): void {
  scanner.stop()
  const panel = document.getElementById('scanner-panel')
  if (panel) panel.hidden = true
  const video = document.getElementById('scanner-video') as HTMLVideoElement | null
  if (video) video.srcObject = null
  const button = document.getElementById('scan') as HTMLButtonElement | null
  if (button) button.disabled = false
}

dialog.addEventListener('close', () => {
  stopScanning(); search?.abort(); search = null; result = null; detailIsbn = null
})
document.addEventListener('visibilitychange', () => { if (document.hidden) stopScanning() })
window.addEventListener('pagehide', () => scanner.stop())
window.addEventListener('beforeunload', event => {
  if (store.dirty) { event.preventDefault(); event.returnValue = '' }
})

function showAdd(): void {
  message(''); result = null
  el('dialog-content').innerHTML = `
    <p class="eyebrow">JESZCZE JEDNA DOBRA HISTORIA</p><h2 id="dialog-title">Dodaj książkę</h2>
    <p class="dialog-intro">Znajdź książkę po numerze ISBN z okładki.</p>
    <button class="button secondary scan-button" id="scan" data-action="scan"><span aria-hidden="true">▥</span> Skanuj ISBN</button>
    <div id="scanner-panel" class="scanner-panel" hidden><video id="scanner-video" autoplay playsinline muted aria-label="Podgląd aparatu"></video>
      <p>Skieruj aparat na kod kreskowy ISBN (978 lub 979).</p><button class="button small secondary" data-action="stop-scan">Zatrzymaj skanowanie</button></div>
    <div class="separator"><span>lub wpisz ręcznie</span></div>
    <form id="isbn-form" novalidate><label for="isbn">Numer ISBN</label><div class="input-row">
      <input id="isbn" name="isbn" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="np. 9780140328721" maxlength="40" aria-describedby="isbn-hint search-message" />
      <button class="button" id="search-button" type="submit">Szukaj</button></div>
      <p class="hint" id="isbn-hint">10 lub 13 znaków. Spacje i myślniki możesz zostawić.</p></form>
    <p id="search-message" class="search-message" role="status" aria-live="polite"></p>
    <div id="search-result"></div><p class="api-credit">Dane książek: Open Library</p>`
  el('isbn-form').addEventListener('submit', event => { event.preventDefault(); void searchBook() })
  dialog.showModal()
}

function showBook(isbn: string): void {
  const book = store.data?.books.find(b => b.isbn === isbn)
  if (!book) return
  detailIsbn = isbn
  el('dialog-content').innerHTML = `
    <p class="eyebrow">NA TWOJEJ PÓŁCE</p><div class="book-detail">${cover(book, true)}
    <div><h2 id="dialog-title">${escape(book.title)}</h2><p class="authors">${escape(book.authors.join(', ') || 'Autor nieznany')}</p>
      <p class="isbn-label">ISBN ${escape(book.isbn)}</p></div></div>
    <p class="description">${escape(book.description || 'Brak opisu w Open Library.')}</p>
    <button class="button danger" data-action="remove">Usuń z półki</button>`
  dialog.showModal()
}

function searchMessage(value: string, error = false): void {
  const node = document.getElementById('search-message')
  if (node) { node.textContent = value; node.classList.toggle('error-text', error); node.setAttribute('role', error ? 'alert' : 'status') }
}

async function searchBook(): Promise<void> {
  stopScanning(); search?.abort()
  el<HTMLButtonElement>('search-button').disabled = false
  const input = el<HTMLInputElement>('isbn')
  input.value = normalizeIsbn(input.value)
  result = null; el('search-result').innerHTML = ''
  if (!validIsbn(input.value)) {
    input.setAttribute('aria-invalid', 'true')
    searchMessage('Nieprawidłowy ISBN. Wpisz poprawne 10 lub 13 znaków z okładki książki.', true)
    return
  }
  input.removeAttribute('aria-invalid')
  if (!navigator.onLine) { searchMessage('Brak internetu. Połącz się z siecią, aby wyszukać książkę.', true); return }
  const controller = new AbortController()
  search = controller
  el<HTMLButtonElement>('search-button').disabled = true
  el<HTMLButtonElement>('scan').disabled = true
  searchMessage('Szukam w Open Library…')
  try {
    const book = await findBook(input.value, controller.signal)
    if (controller.signal.aborted) return
    result = book
    const exists = store.data?.books.some(b => isbnKey(b.isbn) === isbnKey(book.isbn))
    el('search-result').innerHTML = `<div class="result-card"><div class="book-detail">${cover(book, true)}<div>
      <h3>${escape(book.title)}</h3><p class="authors">${escape(book.authors.join(', ') || 'Autor nieznany')}</p><p class="isbn-label">ISBN ${escape(book.isbn)}</p></div></div>
      <p class="description">${escape(book.description || 'Brak opisu w Open Library.')}</p>
      <button class="button full-width" data-action="save-book"${exists ? ' disabled' : ''}>${exists ? 'Już na Twojej półce' : 'Dodaj do półki'}</button></div>`
    searchMessage(exists ? 'Ta książka jest już na Twojej półce.' : '')
  } catch (error) {
    if (!controller.signal.aborted) searchMessage(error instanceof Error ? error.message : 'Nie udało się wyszukać książki.', true)
  } finally {
    if (!controller.signal.aborted) {
      el<HTMLButtonElement>('search-button').disabled = false
      el<HTMLButtonElement>('scan').disabled = false
    }
  }
}

async function updateLibrary(data: Library): Promise<void> {
  busy = true; dialog.close(); render()
  try {
    await store.update(data)
    message(store.handle ? 'Półka została zapisana w pliku.' : 'Półka została zmieniona. Pobierz aktualny books.json, aby zachować zmiany.')
  } catch (error) {
    message(`Nie zapisano zmian w pliku. ${store.needsPermission ? 'Nadaj ponownie dostęp do pliku.' : error instanceof Error ? error.message : 'Spróbuj ponownie.'}`, true)
  } finally { busy = false; render() }
}

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null
  const button = target?.closest<HTMLButtonElement>('button')
  if (!button || button.disabled) return
  const action = button.dataset.action
  if (action === 'close') { dialog.close(); return }
  if (action === 'stop-scan') { stopScanning(); return }
  if (busy) return
  if (button.dataset.isbn) { showBook(button.dataset.isbn); return }
  switch (action) {
    case 'open': void openLibrary(); break
    case 'create': void openLibrary(true); break
    case 'import': if (confirmDiscard()) fileInput.click(); break
    case 'back': choosing = false; render(); break
    case 'choose': choosing = true; message(''); render(); break
    case 'add': showAdd(); break
    case 'download':
      store.download(); render()
      message('Rozpoczęto pobieranie books.json. Sprawdź, czy pobieranie się zakończyło. Jeśli masz kilka kopii, przy następnym otwarciu wybierz najnowszą.')
      break
    case 'retry': {
      busy = true
      const operation = store.needsPermission ? store.regrant() : store.save()
      render()
      void operation.then(() => message('Zmiany zapisane w pliku.')).catch(error => {
        message(error instanceof Error ? error.message : 'Nie udało się zapisać pliku.', true)
      }).finally(() => { busy = false; render() })
      break
    }
    case 'save-book':
      if (result && store.data) {
        try { void updateLibrary(addBook(store.data, { ...result, addedAt: new Date().toISOString() })) }
        catch (error) { searchMessage((error as Error).message, true) }
      }
      break
    case 'remove': {
      const isbn = detailIsbn
      const book = store.data?.books.find(b => b.isbn === isbn)
      if (book && window.confirm(`Usunąć „${book.title}” z półki?`)) {
        void updateLibrary({ version: 1, books: store.data!.books.filter(b => b.isbn !== isbn) })
      }
      break
    }
    case 'scan':
      search?.abort(); result = null
      el('search-result').innerHTML = ''
      el<HTMLButtonElement>('search-button').disabled = false
      searchMessage(''); el('scanner-panel').hidden = false; button.disabled = true
      void scanner.start(el<HTMLVideoElement>('scanner-video'), isbn => {
        stopScanning(); el<HTMLInputElement>('isbn').value = isbn; void searchBook()
      }, error => { stopScanning(); searchMessage(error, true) })
      break
  }
})

document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement) event.target.hidden = true
}, true)
function onlineState(): void { el('offline').hidden = navigator.onLine }
window.addEventListener('online', onlineState)
window.addEventListener('offline', onlineState)
onlineState()

interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: string }>
}
let installPrompt: InstallPrompt | null = null
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event as InstallPrompt; el('install').hidden = false
})
el('install').addEventListener('click', () => {
  if (!installPrompt) return
  void installPrompt.prompt().then(() => installPrompt?.userChoice).finally(() => {
    installPrompt = null; el('install').hidden = true
  }).catch(() => message('Instalację możesz uruchomić z menu przeglądarki: Zainstaluj aplikację lub Dodaj do ekranu głównego.'))
})
window.addEventListener('appinstalled', () => { el('install').hidden = true; installPrompt = null })
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      message('Nie udało się przygotować trybu offline. Sprawdź internet i otwórz aplikację ponownie.')
    })
  })
}
render()
