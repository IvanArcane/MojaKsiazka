import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeIsbn, validIsbn, isbnKey, parseLibrary, addBook, emptyLibrary, serializeLibrary, safeCoverUrl } from '../src/library.ts'

const book = {
  isbn: '9780140328721', title: 'Fantastic Mr. Fox', authors: ['Roald Dahl'],
  description: '', coverUrl: '', addedAt: '2026-09-29T18:00:00.000Z',
}
test('ISBN: spacje, myślniki i X, sumy kontrolne ISBN-10 i ISBN-13', () => {
  assert.equal(normalizeIsbn(' 0-8044 2957-x '), '080442957X')
  for (const isbn of ['9780140328721', '0140328726', '080442957X', '978-0-14-032872-1']) assert.equal(validIsbn(isbn), true, isbn)
  for (const isbn of ['', '123', '9780140328722', '0140328727', '1234567890128', '978014032872X', 'abc']) assert.equal(validIsbn(isbn), false, isbn)
  assert.equal(isbnKey('0140328726'), '9780140328721')
})
test('JSON: zapis i ponowny odczyt, polskie znaki i BOM', () => {
  const data = { version: 1, books: [{ ...book, title: 'Książka — żółw' }] }
  assert.deepEqual(parseLibrary('\uFEFF' + serializeLibrary(data)), data)
  assert.deepEqual(parseLibrary('{"version":1,"books":[]}'), emptyLibrary())
})
test('JSON: błędna struktura, ISBN, autor i data są odrzucane', () => {
  for (const value of ['{', 'null', '{}', '{"version":2,"books":[]}', '{"version":1,"books":{}}']) assert.throws(() => parseLibrary(value))
  for (const change of [{ isbn: '123' }, { title: '' }, { authors: [5] }, { addedAt: 'wczoraj' }, { description: {} }]) {
    assert.throws(() => parseLibrary(JSON.stringify({ version: 1, books: [{ ...book, ...change }] })))
  }
})
test('duplikaty ISBN-10/13 i niezmienność poprzedniej biblioteki', () => {
  const empty = emptyLibrary()
  const data = addBook(empty, book)
  assert.equal(empty.books.length, 0)
  assert.throws(() => addBook(data, { ...book, isbn: '0140328726' }), /już/)
  assert.throws(() => parseLibrary(JSON.stringify({ version: 1, books: [book, { ...book, isbn: '0140328726' }] })), /powtórzony/)
})
test('okładki: odrzucenie adresów wykonujących kod i niezabezpieczonych', () => {
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,x', 'http://example.org/a.jpg', 'https://user:pass@example.org/a']) assert.equal(safeCoverUrl(url), '')
  assert.equal(safeCoverUrl('https://covers.openlibrary.org/b/id/1-L.jpg'), 'https://covers.openlibrary.org/b/id/1-L.jpg')
})
