import { emptyLibrary, parseLibrary, serializeLibrary, type Library } from './library.ts'

interface LibraryHandle {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>
}

interface PickerOptions {
  id: string
  types: { description: string; accept: Record<string, string[]> }[]
  suggestedName?: string
  multiple?: boolean
  mode?: 'readwrite'
}

const fileWindow = window as Window & {
  showOpenFilePicker?: (options: PickerOptions) => Promise<LibraryHandle[]>
  showSaveFilePicker?: (options: PickerOptions) => Promise<LibraryHandle>
}
const options: PickerOptions = {
  id: 'moja-polka', types: [{ description: 'Biblioteka książek (JSON)', accept: { 'application/json': ['.json'] } }],
}

export const supportsFileAccess = (): boolean => Boolean(fileWindow.showOpenFilePicker && fileWindow.showSaveFilePicker)
export const isCancelled = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError'

export class LibraryStorage {
  data: Library | null = null
  handle: LibraryHandle | null = null
  fileName = 'books.json'
  dirty = false
  needsPermission = false
  private lastSaved = ''

  async create(): Promise<void> {
    if (!fileWindow.showSaveFilePicker) throw new Error('Ta przeglądarka wymaga eksportu JSON.')
    const handle = await fileWindow.showSaveFilePicker({ ...options, suggestedName: 'books.json' })
    const data = emptyLibrary()
    const writer = await handle.createWritable()
    try { await writer.write(serializeLibrary(data)); await writer.close() } catch (error) {
      await writer.abort().catch(() => {})
      throw error
    }
    this.accept(data, handle.name, handle)
  }

  async open(): Promise<void> {
    if (!fileWindow.showOpenFilePicker) throw new Error('Użyj importu JSON.')
    const [handle] = await fileWindow.showOpenFilePicker({ ...options, multiple: false, mode: 'readwrite' })
    if (!handle) return
    const file = await handle.getFile()
    const data = await this.read(file)
    this.accept(data, handle.name, handle)
  }

  async import(file: File): Promise<void> {
    const data = await this.read(file)
    this.accept(data, file.name, null)
  }

  createForExport(): void {
    this.accept(emptyLibrary(), 'books.json', null)
    this.dirty = true
  }

  private async read(file: File): Promise<Library> {
    if (file.size > 10 * 1024 * 1024) throw new Error('Plik jest zbyt duży. Maksymalny rozmiar biblioteki to 10 MB.')
    return parseLibrary(await file.text())
  }

  private accept(data: Library, name: string, handle: LibraryHandle | null): void {
    this.data = data
    this.fileName = name
    this.handle = handle
    this.lastSaved = serializeLibrary(data)
    this.dirty = false
    this.needsPermission = false
  }

  async update(data: Library): Promise<void> {
    this.data = data
    this.dirty = true
    if (this.handle) await this.save()
  }

  async save(): Promise<void> {
    if (!this.handle || !this.data) return
    try {
      const current = await this.read(await this.handle.getFile())
      if (serializeLibrary(current) !== this.lastSaved) {
        throw new Error('Plik zmienił się poza aplikacją. Pobierz swoje zmiany jako kopię JSON, a następnie otwórz wybraną bibliotekę ponownie.')
      }
      const content = serializeLibrary(this.data)
      const writer = await this.handle.createWritable()
      try { await writer.write(content); await writer.close() } catch (error) {
        await writer.abort().catch(() => {})
        throw error
      }
      this.lastSaved = content
      this.dirty = false
      this.needsPermission = false
    } catch (error) {
      this.needsPermission = error instanceof Error && ['NotAllowedError', 'SecurityError'].includes(error.name)
      throw error
    }
  }

  async regrant(): Promise<void> {
    if (!this.handle) return
    if (await this.handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
      throw new Error('Nie przyznano dostępu. Zezwól na zapis lub pobierz kopię JSON.')
    }
    await this.save()
  }

  download(): void {
    if (!this.data) return
    const url = URL.createObjectURL(new Blob([serializeLibrary(this.data)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'books.json'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    // Eksport inicjuje pobranie; przeglądarka nie potwierdza zapisania pliku na dysku.
    if (!this.handle) this.dirty = false
  }
}
