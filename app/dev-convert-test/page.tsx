'use client'

// TEMPORARY test harness for the original-file → Word conversion. Delete after testing.
import React, { useEffect, useState } from 'react'
import { WordLetterEditorModal } from '@/components/modals/WordLetterEditorModal'
import { convertDocumentToEditableHtml } from '@/lib/document-converter'
import { htmlToDocxBlob } from '@/lib/html-to-docx'

async function toDataUrl(url: string): Promise<{ dataUrl: string; size: number; type: string }> {
  const blob = await (await fetch(url)).blob()
  const dataUrl = await new Promise<string>(res => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.readAsDataURL(blob)
  })
  return { dataUrl, size: blob.size, type: blob.type }
}

export default function DevConvertTest() {
  const [doc, setDoc] = useState<any>(null)

  useEffect(() => {
    ;(window as any).__convert = async (name: string, lang?: string) => {
      const { dataUrl, type } = await toDataUrl(`/__convtest/${name}`)
      const t0 = performance.now()
      try {
        const r = await convertDocumentToEditableHtml({ dataUrl, fileName: name, fileType: type }, { ocrLanguage: (lang as any) || 'eng' })
        return { ok: true, ms: Math.round(performance.now() - t0), ...r }
      } catch (e: any) {
        return { ok: false, error: e?.message, name: e?.name }
      }
    }
    ;(window as any).__docx = async (html: string) => {
      const blob = await htmlToDocxBlob(html, 'test')
      const buf = new Uint8Array(await blob.arrayBuffer())
      let s = ''
      for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i])
      return btoa(s)
    }
    ;(window as any).__items = async (name: string, pageNo: number, match: string) => {
      const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await (await fetch(`/__convtest/${name}`)).arrayBuffer()) }).promise
      const page = await pdf.getPage(pageNo)
      const tc = await page.getTextContent()
      return tc.items.filter((i: any) => i.str.includes(match) || match === '*').map((i: any) => ({ s: i.str, t: i.transform.map((n: number) => Math.round(n * 10) / 10), w: Math.round(i.width * 10) / 10, eol: i.hasEOL }))
    }
    const file = new URLSearchParams(window.location.search).get('file')
    if (file) {
      toDataUrl(`/__convtest/${file}`).then(({ dataUrl, size, type }) =>
        setDoc({
          id: 'custom-test',
          title: 'Test Document',
          fileName: file,
          fileSize: size,
          fileType: type,
          dataUrl,
          stageOrigin: 'Tender Details',
          sourceLabel: 'Uploaded Tender NIT',
          category: 'tender-notice',
          categoryLabel: 'Tender',
          fileTypeGroup: 'pdf',
          source: 'manual-upload',
          uploadedAt: new Date().toISOString(),
        })
      )
    }
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <p id="ready">harness ready</p>
      {doc && (
        <WordLetterEditorModal
          tender={{ id: 'T-1', title: 'Test Tender', authority: 'Test' } as any}
          doc={doc}
          onClose={() => setDoc(null)}
          onSave={d => ((window as any).__saved = d)}
        />
      )}
    </div>
  )
}
