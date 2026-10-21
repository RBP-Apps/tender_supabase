'use client'

import React from 'react'
import Link from 'next/link'

interface MarkdownContentProps {
  content: string
  className?: string
}

/**
 * Format inline text tokens: **bold**, *italic*, `code`, and [links](url)
 */
function renderInline(text: string): React.ReactNode {
  if (!text) return null

  // Regex matches: [link](url), `code`, **bold**, *italic*
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g
  const elements: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const [fullMatch, , linkText, linkUrl, codeText, boldText, italicText] = match
    const index = match.index

    // Push text before match
    if (index > lastIndex) {
      elements.push(text.substring(lastIndex, index))
    }

    if (linkText && linkUrl) {
      const isInternal = linkUrl.startsWith('/')
      if (isInternal) {
        elements.push(
          <Link
            key={`link-${index}`}
            href={linkUrl}
            className="text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2 transition-colors"
          >
            {linkText}
          </Link>
        )
      } else {
        elements.push(
          <a
            key={`link-${index}`}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2 transition-colors"
          >
            {linkText}
          </a>
        )
      }
    } else if (codeText) {
      elements.push(
        <code
          key={`code-${index}`}
          className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200/80 text-blue-700 font-mono text-[11px] font-semibold tracking-tight mx-0.5"
        >
          {codeText}
        </code>
      )
    } else if (boldText) {
      elements.push(
        <strong key={`bold-${index}`} className="font-semibold text-slate-900">
          {boldText}
        </strong>
      )
    } else if (italicText) {
      elements.push(
        <em key={`italic-${index}`} className="italic text-slate-800">
          {italicText}
        </em>
      )
    }

    lastIndex = index + fullMatch.length
  }

  // Push remaining text
  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex))
  }

  return elements.length > 0 ? elements : text
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  if (!content) return null

  // Split into lines
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []

  let i = 0
  while (i < lines.length) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()

    // 1. Code blocks ```
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // Skip closing ```
      blocks.push(
        <div key={`code-block-${i}`} className="my-3 rounded-lg overflow-hidden border border-slate-700/60 shadow-sm">
          {lang && (
            <div className="bg-slate-950 px-3 py-1 text-[11px] font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800">
              {lang}
            </div>
          )}
          <pre className="bg-slate-900 text-slate-100 p-3.5 text-xs overflow-x-auto font-mono leading-relaxed">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      )
      continue
    }

    // 2. Tables: lines starting and containing |
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim())
        i++
      }

      if (tableLines.length >= 2) {
        // Parse header
        const headerCells = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map(c => c.trim())

        // Check if row 1 is separator (e.g. |:---|:---:|)
        let startIndex = 1
        if (tableLines.length > 1 && /^[|:\-\s]+$/.test(tableLines[1])) {
          startIndex = 2
        }

        const bodyRows = tableLines.slice(startIndex).map(line =>
          line
            .split('|')
            .slice(1, -1)
            .map(c => c.trim())
        )

        blocks.push(
          <div key={`table-${i}`} className="my-3.5 overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  {headerCells.map((h, idx) => (
                    <th key={idx} className="px-3.5 py-2.5 font-bold">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-slate-50/50 hover:bg-slate-50' : 'hover:bg-slate-50'}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3.5 py-2 text-slate-700">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        continue
      }
    }

    // 3. Headings (#, ##, ###)
    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${i}`} className="text-base font-bold text-slate-900 mt-4 mb-2 flex items-center gap-1.5">
          {renderInline(trimmed.slice(4))}
        </h3>
      )
      i++
      continue
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h2 key={`h2-${i}`} className="text-lg font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-200/80">
          {renderInline(trimmed.slice(3))}
        </h2>
      )
      i++
      continue
    }
    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h1 key={`h1-${i}`} className="text-xl font-extrabold text-slate-900 mt-4 mb-2">
          {renderInline(trimmed.slice(2))}
        </h1>
      )
      i++
      continue
    }

    // 4. Blockquotes (> ...)
    if (trimmed.startsWith('> ')) {
      blocks.push(
        <blockquote
          key={`quote-${i}`}
          className="my-2.5 border-l-4 border-blue-500 bg-blue-50/70 rounded-r-lg px-3.5 py-2 text-xs sm:text-sm text-slate-700 leading-relaxed"
        >
          {renderInline(trimmed.slice(2))}
        </blockquote>
      )
      i++
      continue
    }

    // 5. Bullet Lists (- or *)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const listItems: string[] = []
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        listItems.push(lines[i].trim().slice(2))
        i++
      }
      blocks.push(
        <ul key={`ul-${i}`} className="my-2 space-y-1.5 pl-2">
          {listItems.map((item, lIdx) => (
            <li key={lIdx} className="flex items-start text-xs sm:text-sm text-slate-700 leading-relaxed">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 mr-2.5 flex-shrink-0" />
              <div className="flex-1">{renderInline(item)}</div>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // 6. Numbered Lists (1. , 2. )
    if (/^\d+\.\s/.test(trimmed)) {
      const listItems: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const itemContent = lines[i].trim().replace(/^\d+\.\s*/, '')
        listItems.push(itemContent)
        i++
      }
      blocks.push(
        <ol key={`ol-${i}`} className="my-2 space-y-1.5 pl-2 counter-reset-list">
          {listItems.map((item, lIdx) => (
            <li key={lIdx} className="flex items-start text-xs sm:text-sm text-slate-700 leading-relaxed">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold text-[11px] mr-2.5 flex-shrink-0 border border-slate-200">
                {lIdx + 1}
              </span>
              <div className="flex-1 pt-0.5">{renderInline(item)}</div>
            </li>
          ))}
        </ol>
      )
      continue
    }

    // 7. Empty line
    if (!trimmed) {
      i++
      continue
    }

    // 8. Normal Paragraph
    blocks.push(
      <p key={`p-${i}`} className="text-xs sm:text-sm text-slate-700 leading-relaxed my-1.5">
        {renderInline(rawLine)}
      </p>
    )
    i++
  }

  return <div className={`markdown-body space-y-1 ${className}`}>{blocks}</div>
}
