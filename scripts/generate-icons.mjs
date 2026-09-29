import { chromium } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const svg = await readFile('public/icon.svg', 'utf8')
  await mkdir('public/icons', { recursive: true })
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`)
    await page.screenshot({ path: `public/icons/icon-${size}.png` })
  }
} finally { await browser.close() }
