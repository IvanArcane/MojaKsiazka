import { normalizeIsbn, validIsbn, type Book } from './library.ts'

type Json = Record<string, unknown>
const object = (value: unknown): Json => value && typeof value === 'object' ? value as Json : {}
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
const description = (value: unknown): string => {
  const full = (text(value) || text(object(value).value)).replace(/\s+/g, ' ')
  return full.length > 600 ? full.slice(0, 600).replace(/\s+\S*$/, '') + '…' : full
}
let lastRequest = 0

async function get(path: string, signal: AbortSignal): Promise<Json> {
  // Publiczne API: najwyżej jedno nowe żądanie na sekundę.
  const delay = Math.max(0, 1050 - (Date.now() - lastRequest))
  if (delay) await new Promise(resolve => setTimeout(resolve, delay))
  signal.throwIfAborted()
  lastRequest = Date.now()
  const response = await fetch(`https://openlibrary.org${path}.json`, { signal, credentials: 'omit' })
  if (response.status === 404) return {}
  if (!response.ok) throw new Error(response.status === 429
    ? 'Open Library otrzymało zbyt wiele zapytań. Spróbuj ponownie za chwilę.'
    : 'Open Library jest teraz niedostępne. Spróbuj ponownie później.')
  return object(await response.json())
}

export async function findBook(value: string, signal: AbortSignal): Promise<Omit<Book, 'addedAt'>> {
  const isbn = normalizeIsbn(value)
  if (!validIsbn(isbn)) throw new Error('Nieprawidłowy ISBN. Wpisz poprawne 10 lub 13 znaków z okładki książki.')
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(25_000)])
  try {
    const edition = await get(`/isbn/${isbn}`, requestSignal)
    const title = text(edition.title)
    if (!title) throw new Error('Nie znaleziono książki.')
    let work: Json = {}
    const workKey = text(object(Array.isArray(edition.works) ? edition.works[0] : null).key)
    if (/^\/works\/OL\d+W$/.test(workKey)) {
      try { work = await get(workKey, requestSignal) } catch { requestSignal.throwIfAborted() }
    }
    const refs = Array.isArray(edition.authors) ? edition.authors : Array.isArray(work.authors) ? work.authors : []
    const authors: string[] = []
    for (const ref of refs.slice(0, 10)) {
      const author = object(ref)
      const key = text(author.key) || text(object(author.author).key)
      let name = text(author.name)
      if (!name && /^\/authors\/OL\d+A$/.test(key)) {
        try { name = text((await get(key, requestSignal)).name) } catch { requestSignal.throwIfAborted() }
      }
      if (name && !authors.includes(name)) authors.push(name)
    }
    const cover = (Array.isArray(edition.covers) ? edition.covers : Array.isArray(work.covers) ? work.covers : [])
      .find(id => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
    return {
      isbn, title, authors, description: description(edition.description) || description(work.description),
      coverUrl: cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : '',
    }
  } catch (error) {
    if (signal.aborted) throw error
    if (requestSignal.aborted) throw new Error('Open Library odpowiada zbyt długo. Spróbuj ponownie.')
    if (error instanceof TypeError) throw new Error('Nie udało się połączyć z Open Library. Sprawdź połączenie z internetem.')
    throw error
  }
}
