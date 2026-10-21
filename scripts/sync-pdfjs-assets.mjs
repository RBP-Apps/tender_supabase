// Copies the pdf.js worker, CMaps and standard fonts from node_modules into
// public/pdfjs so the browser-side document converter loads a version-matched
// worker from our own origin. Runs automatically before `dev` and `build`.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'pdfjs-dist')
const dest = join(root, 'public', 'pdfjs')

if (!existsSync(src)) {
  console.warn('[sync-pdfjs-assets] pdfjs-dist not installed, skipping')
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
cpSync(join(src, 'legacy', 'build', 'pdf.worker.min.mjs'), join(dest, 'pdf.worker.min.mjs'))
cpSync(join(src, 'cmaps'), join(dest, 'cmaps'), { recursive: true })
cpSync(join(src, 'standard_fonts'), join(dest, 'standard_fonts'), { recursive: true })
console.log('[sync-pdfjs-assets] copied pdf.js assets to public/pdfjs')
