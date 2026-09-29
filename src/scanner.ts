import { validIsbn } from './library.ts'

interface Detector {
  detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
interface DetectorClass {
  new(options: { formats: string[] }): Detector
  getSupportedFormats(): Promise<string[]>
}

export class IsbnScanner {
  private stream: MediaStream | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private generation = 0

  stop(): void {
    this.generation++
    clearTimeout(this.timer)
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
  }

  async start(video: HTMLVideoElement, found: (isbn: string) => void, failed: (message: string) => void): Promise<void> {
    this.stop()
    const generation = this.generation
    const isActive = () => generation === this.generation
    try {
      if (!window.isSecureContext) throw new Error('Aparat wymaga bezpiecznego adresu HTTPS. Otwórz opublikowaną aplikację.')
      const Barcode = (window as Window & { BarcodeDetector?: DetectorClass }).BarcodeDetector
      if (!Barcode || !(await Barcode.getSupportedFormats()).includes('ean_13')) {
        throw new Error('Ta przeglądarka nie obsługuje skanowania EAN-13. Użyj aktualnego Chrome na Androidzie lub wpisz ISBN ręcznie.')
      }
      if (!isActive()) return
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Aparat jest niedostępny. Możesz wpisać ISBN ręcznie.')
      const detector = new Barcode({ formats: ['ean_13'] })
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      })
      if (!isActive()) { stream.getTracks().forEach(track => track.stop()); return }
      this.stream = stream
      video.srcObject = stream
      await video.play()
      const scan = async () => {
        if (!isActive()) return
        try {
          const codes = await detector.detect(video)
          if (!isActive()) return
          const isbn = codes.map(code => code.rawValue).find(value => /^97[89]\d{10}$/.test(value) && validIsbn(value))
          if (isbn) { this.stop(); video.srcObject = null; found(isbn); return }
          this.timer = setTimeout(() => { void scan() }, 200)
        } catch {
          if (isActive()) { this.stop(); failed('Nie udało się odczytać obrazu z aparatu. Spróbuj ponownie lub wpisz ISBN ręcznie.') }
        }
      }
      void scan()
    } catch (error) {
      if (!isActive()) return
      this.stop()
      const name = error instanceof Error ? error.name : ''
      failed(name === 'NotAllowedError'
        ? 'Brak zgody na aparat. Możesz nadać dostęp w ustawieniach witryny lub wpisać ISBN ręcznie.'
        : ['NotFoundError', 'NotReadableError'].includes(name)
          ? 'Aparat jest niedostępny lub używa go inna aplikacja. Możesz wpisać ISBN ręcznie.'
          : error instanceof Error ? error.message : 'Nie udało się uruchomić aparatu.')
    }
  }
}
