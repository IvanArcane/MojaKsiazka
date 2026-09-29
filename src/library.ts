export interface Book {
  isbn: string
  title: string
  authors: string[]
  description: string
  coverUrl: string
  addedAt: string
}

export interface Library {
  version: 1
  books: Book[]
}

export function normalizeIsbn(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase()
}

export function validIsbn(value: string): boolean {
  const isbn = normalizeIsbn(value)
  if (/^\d{9}[\dX]$/.test(isbn)) {
    return [...isbn].reduce((sum, digit, i) => sum + (digit === 'X' ? 10 : Number(digit)) * (10 - i), 0) % 11 === 0
  }
  return /^97[89]\d{10}$/.test(isbn) &&
    [...isbn].reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0) % 10 === 0
}

// ISBN-10 i odpowiadający mu ISBN-13 oznaczają to samo wydanie.
export function isbnKey(value: string): string {
  const isbn = normalizeIsbn(value)
  if (isbn.length !== 10) return isbn
  const prefix = `978${isbn.slice(0, 9)}`
  const sum = [...prefix].reduce((total, digit, i) => total + Number(digit) * (i % 2 ? 3 : 1), 0)
  return prefix + ((10 - sum % 10) % 10)
}

export function safeCoverUrl(value: string): string {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''
  } catch {
    return ''
  }
}

export function parseLibrary(text: string): Library {
  let data: unknown
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')) } catch {
    throw new Error('Ten plik nie jest poprawnym plikiem JSON.')
  }
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 ||
    !('books' in data) || !Array.isArray(data.books)) {
    throw new Error('Nieprawidłowa biblioteka. Plik musi zawierać version: 1 oraz listę books.')
  }
  const seen = new Set<string>()
  const books = data.books.map((item: unknown, index: number): Book => {
    const invalid = () => new Error(`Książka nr ${index + 1} ma nieprawidłowe dane. Plik nie został otwarty.`)
    if (!item || typeof item !== 'object') throw invalid()
    const b = item as Record<string, unknown>
    if (typeof b.isbn !== 'string' || !validIsbn(b.isbn) ||
      typeof b.title !== 'string' || !b.title.trim() ||
      !Array.isArray(b.authors) || !b.authors.every(a => typeof a === 'string' && a.trim()) ||
      (b.description !== undefined && typeof b.description !== 'string') ||
      (b.coverUrl !== undefined && typeof b.coverUrl !== 'string') ||
      typeof b.addedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(b.addedAt) || !Number.isFinite(Date.parse(b.addedAt))) {
      throw invalid()
    }
    const key = isbnKey(b.isbn)
    if (seen.has(key)) throw new Error(`Plik zawiera powtórzony ISBN: ${b.isbn}. Popraw duplikat i otwórz plik ponownie.`)
    seen.add(key)
    return {
      isbn: normalizeIsbn(b.isbn), title: b.title.trim(), authors: b.authors.map(a => a.trim()),
      description: (b.description as string | undefined) ?? '',
      coverUrl: safeCoverUrl((b.coverUrl as string | undefined) ?? ''), addedAt: b.addedAt,
    }
  })
  return { version: 1, books }
}

export const emptyLibrary = (): Library => ({ version: 1, books: [] })
export const serializeLibrary = (data: Library): string => JSON.stringify(data, null, 2) + '\n'

export function addBook(data: Library, book: Book): Library {
  if (data.books.some(b => isbnKey(b.isbn) === isbnKey(book.isbn))) {
    throw new Error('Ta książka jest już na Twojej półce.')
  }
  return { version: 1, books: [book, ...data.books] }
}
