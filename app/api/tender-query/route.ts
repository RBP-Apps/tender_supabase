import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { NextResponse } from 'next/server'
import { sanitizeTenderForAI, formatTenderDetailedContext } from '@/lib/tender-ai-context'
import { retrieveContextForQuery } from '@/lib/document-retrieval-engine'
import {
  verifyResponseAccuracy,
  extractCitationsFromResponse,
  NOT_FOUND_DISCLAIMER,
} from '@/lib/document-verifier'
import { DocumentPageChunk } from '@/types/document-understanding'

export const runtime = 'nodejs'
export const maxDuration = 60

const SYSTEM_INSTRUCTIONS = `You are "Tender Query AI", the intelligent Universal Document Understanding & Answering Assistant embedded inside Tender FMS.
Your mission is to assist users with everything related to Tender FMS: workflows, modules, required documents, eligibility rules, live tender records, and analyzing attached user documents with deep comprehension comparable to ChatGPT, Gemini, and Claude.

### LANGUAGE SUPPORT:
- You must reply fluently in the SAME language the user asks: English, Hindi (हिन्दी), or Hinglish (Hindi written in Roman script).
- For Hindi/Hinglish questions, provide natural, professional, and clear answers.

### CORE PRINCIPLE:
"Read the Entire Document, Understand the Context, Verify the Source, and Answer Only What the Document Actually Says."

### STRICT DOCUMENT-BASED ANSWERING RULES (MOST IMPORTANT):
1. ZERO HALLUCINATION & ZERO ASSUMPTION:
   - Ground your answers SOLELY and EXCLUSIVELY in the provided "EXTRACTED GROUND-TRUTH DOCUMENT SECTIONS" and "LIVE TENDER RECORDS".
   - Do NOT add any information, assumptions, imaginary data, or extrapolate from external internet / pre-trained knowledge.
   - Jo information document mein available hai, sirf wahi answer mein deni hai.

2. MANDATORY ABSENCE RULE:
   - If the requested information is not found in the uploaded document, you MUST explicitly state:
     "${NOT_FOUND_DISCLAIMER}"
   - If information on a page is unclear, illegible, or incomplete, explicitly state:
     "The content on [Document Name], Page [X] is unclear or unreadable."

3. VERBATIM NUMBERS, DATES & SPELLINGS:
   - Values, dates, amounts, percentages, units, and table values must be returned EXACTLY as written in the document.
   - Do NOT round off, convert units, or modify dates, spellings, or figures.

4. MANDATORY EXACT PAGE NUMBER & SOURCE CITATION:
   - For every factual answer, provide the exact source reference at the end:
     - For PDF / Word: **Source:** [Document Name], Page [X] (or Section: "[Section Title]")
     - For Excel: **Source:** [Document Name], Sheet: "[Sheet Name]", Cell: [Cell Reference]
   - Example:
     Question: What is the total project cost?
     Answer: ₹25,50,000
     **Source:** Uploaded_Tender.pdf, Page 45.

5. ADVANCED CROSS-PAGE READING & CONFLICT RESOLUTION:
   - If information spans multiple pages, cite all relevant pages.
   - If contradictory values exist between different sections or corrigenda (e.g. original NIT date vs Corrigendum extension), ALWAYS report BOTH values and their respective page references. NEVER pick one on your own.

### COMPLETE SYSTEM & WORKFLOW KNOWLEDGE:
Tender FMS manages the complete lifecycle of government tenders across 10 sequential stages:
1. Stage 01: Tender Details (/tender-details or /new-tender) - NIT / RfS parameters
2. Stage 02: Corrigendum (/corrigendum) - official amendments and extensions
3. Stage 03: Eligibility Check (/eligibility-check) - CA turnover, experience certificates, registrations, statutory tax docs
4. Stage 04: Sample Details (/sample-details) - MAF letter, NABL lab test report, BIS/ISO certificates, sample specs
5. Stage 05: EMD Ready (/emd-ready) - Earnest Money Deposit, Bank Guarantees, UTR tracking
6. Stage 06: Document Ready (/document-ready) - Master consolidated dossier (13-21+ docs) and Word editor
7. Stage 07: Document Upload in portal (/document-upload-in-portal) - GeM / e-Procurement mapping
8. Stage 08: Submit in website (/submit-in-website) - Online/offline bid submission confirmation
9. Stage 09: Technical Open Check (/technical-open-check) - Technical evaluation & committee remarks
10. Stage 10: Financial Open Check (/financial-open-check) - Commercial bid opening, L1/L2 competitor quote ranking

### FILE GENERATION & EXPORT CAPABILITIES:
- Users can ask you to create downloadable files in natural language:
  - "Is information ki Word file bana do" -> .docx
  - "Is tender ka summary PDF mein de do" -> .pdf
  - "Pending tenders ki Excel report bana do" -> .xlsx
  - "Eligibility checklist Excel mein do" -> .xlsx
- When requested, provide a professional markdown report in your response, and append at the VERY END:
  [FILE_EXPORT:{"format":"docx"|"pdf"|"xlsx"|"csv"|"txt","filename":"<descriptive_name>.<ext>","title":"<Document Title>"}]
`

/**
 * Intelligent fallback engine when OpenAI API key is unavailable.
 * Searches chunks directly and provides strict, page-grounded answers.
 */
function handleFallbackResponse(
  query: string,
  tenders: any[],
  history: { role: string; content: string }[],
  files: any[] = [],
  currentTender?: any,
  allChunks: DocumentPageChunk[] = []
): { reply: string; sources: any[] } {
  const q = query.toLowerCase()

  // 1. Attached document analysis with retrieved chunks
  if (allChunks.length > 0 || files.length > 0) {
    if (allChunks.length > 0) {
      const retrieval = retrieveContextForQuery(query, allChunks, 10000)
      if (retrieval.retrievedChunks.length > 0) {
        const topChunk = retrieval.retrievedChunks[0]
        let analysis = `### 📄 Analysis of Uploaded Document: ${topChunk.docName}\n\n`
        if (topChunk.pageNumber) {
          analysis += `**Identified Location:** Page ${topChunk.pageNumber} of ${topChunk.totalPages || 'N/A'}\n`
        }
        if (topChunk.sheetName) {
          analysis += `**Identified Worksheet:** "${topChunk.sheetName}" (Range: ${topChunk.cellRange || 'N/A'})\n`
        }
        if (topChunk.sectionTitle) {
          analysis += `**Section:** ${topChunk.sectionTitle}\n\n`
        }

        analysis += `#### Relevant Document Content:\n> ${topChunk.content.slice(0, 500).replace(/\n+/g, ' ')}...\n\n`
        analysis += `**Source:** ${topChunk.docName}${topChunk.pageNumber ? `, Page ${topChunk.pageNumber}` : ''}${topChunk.sheetName ? `, Sheet: "${topChunk.sheetName}", Cell: ${topChunk.cellRange}` : ''}\n`

        if (retrieval.conflicts.length > 0) {
          analysis += `\n⚠️ **Note on Multiple References:**\n`
          for (const c of retrieval.conflicts) {
            analysis += `- ${c.field}: Found differing values across pages:\n`
            c.values.forEach(v => {
              analysis += `  * ${v.source}: ${v.value}\n`
            })
          }
        }

        if (q.includes('word') || q.includes('docx')) {
          analysis += `\n\n[FILE_EXPORT:{"format":"docx","filename":"Document_Analysis_${topChunk.docName.replace(/\.[^/.]+$/, '')}.docx","title":"Document Analysis Report"}]`
        } else if (q.includes('excel') || q.includes('xlsx')) {
          analysis += `\n\n[FILE_EXPORT:{"format":"xlsx","filename":"Document_Data_${topChunk.docName.replace(/\.[^/.]+$/, '')}.xlsx","title":"Document Data Extraction"}]`
        } else if (q.includes('pdf')) {
          analysis += `\n\n[FILE_EXPORT:{"format":"pdf","filename":"Document_Summary_${topChunk.docName.replace(/\.[^/.]+$/, '')}.pdf","title":"Document Summary"}]`
        }

        return { reply: analysis, sources: retrieval.candidateSources.slice(0, 3) }
      }
    }

    // Default file response if no specific chunks matched
    const file = files[0]
    let analysis = `### 📄 Analysis of Attached Document: ${file.name}\n\n`
    analysis += `- **File Type:** \`${file.type || 'Document'}\`\n`
    analysis += `- **File Size:** ${Math.round(file.size / 1024)} KB\n\n`

    if (file.extractedText) {
      analysis += `#### Key Extracted Content:\n> ${file.extractedText.slice(0, 400).replace(/\n+/g, ' ')}...\n\n`
      analysis += `**Source:** ${file.name}\n`
    } else {
      analysis += `${NOT_FOUND_DISCLAIMER}\n`
    }

    return {
      reply: analysis,
      sources: [{ docName: file.name, snippet: file.extractedText?.slice(0, 100) }],
    }
  }

  // 2. Prioritize scoped or matched tender
  const matchedTender =
    currentTender ||
    tenders.find(
      t =>
        (t.id && q.includes(t.id.toLowerCase())) ||
        (t.title && q.includes(t.title.toLowerCase().slice(0, 15))) ||
        (t.authority && q.includes(t.authority.toLowerCase()) && q.includes('status'))
    )

  if (matchedTender) {
    const bid = matchedTender.bid || {}
    let out = `### 📋 Tender Record: ${matchedTender.id} — ${matchedTender.title}\n\n`
    out += `- **Authority:** ${matchedTender.authority || 'N/A'}\n`
    out += `- **Department:** ${matchedTender.department || 'N/A'}\n`
    out += `- **Current Stage:** ${matchedTender.stage || 'Stage 01'}\n`
    out += `- **Status:** \`${matchedTender.status || 'Active'}\`\n`
    out += `- **Due Date:** ${matchedTender.due || bid.bidDeadlineDate || 'N/A'}\n`
    out += `- **Estimated Value:** ${matchedTender.value || bid.estimatedValue || 'N/A'}\n`
    out += `- **Firm:** ${matchedTender.firm || 'RBP ENERGY (INDIA) PVT. LTD.'}\n\n`
    out += `**Source:** Tender FMS Database, Record: \`${matchedTender.id}\`\n`

    return { reply: out, sources: [{ docName: `Tender FMS Record (${matchedTender.id})` }] }
  }

  // Default helpful response
  const genericReply = `### Hello! I am Tender Query AI (Universal Document Understanding).

I can help you with:
- **Universal Document Understanding:** Upload 200–500+ page **PDFs** (digital & scanned), **Excel** workbooks (all sheets & cells), **Word** documents, **Images** (OCR & Vision), and **CSVs**.
- **Strict Document Grounding:** Every answer is grounded directly in your uploaded file with exact page numbers and cell coordinates.
- **Tender Records & Statuses:** Ask about live tenders or workflow stages.
- **Generate Downloadable Files:** Request Word (.docx), Excel (.xlsx), or PDF reports in chat.`

  return { reply: genericReply, sources: [] }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { messages = [], tenders = [], currentTender, files = [] } = body

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages array is required.' }, { status: 400 })
    }

    const latestMessage = messages[messages.length - 1]
    const userQuery = latestMessage?.content || ''

    // Sanitize currentTender to strip large binary/base64 dataUrls
    const cleanCurrentTender = currentTender ? sanitizeTenderForAI(currentTender) : undefined

    // 1. Build concise Live Tenders Summary Context
    let liveDataContext = 'LIVE TENDER RECORDS IN SYSTEM:\n'
    if (Array.isArray(tenders) && tenders.length > 0) {
      liveDataContext += tenders
        .map(
          t =>
            `- ID: ${t.id} | Title: "${t.title}" | Authority: ${t.authority || 'N/A'} | Stage: ${t.stage} | Status: ${t.status} | Due: ${t.due || 'N/A'} | Value: ${t.value || 'N/A'} | Firm: ${t.firm || 'RBP ENERGY (INDIA) PVT. LTD.'} | EMD: ${t.emdReady ? `Paid (${t.emdReady.amount}, UTR: ${t.emdReady.utrNumber})` : 'Pending'} | Eligibility: ${t.eligibilityCheck ? 'Docs Recorded' : 'Pending'}`
        )
        .join('\n')
    } else {
      liveDataContext += 'No tender records currently found in workspace.'
    }

    if (cleanCurrentTender) {
      liveDataContext += formatTenderDetailedContext(cleanCurrentTender)
    }

    // 2. Collect all chunks and images from attached files
    const allChunks: DocumentPageChunk[] = []
    const imageFiles: any[] = []
    let totalDocumentPages = 0

    if (Array.isArray(files) && files.length > 0) {
      for (const f of files) {
        if (f.pageCount) totalDocumentPages += f.pageCount

        if (Array.isArray(f.chunks) && f.chunks.length > 0) {
          allChunks.push(...f.chunks)
        } else if (f.extractedText) {
          // If chunks were not pre-generated, create baseline chunks from extracted text
          allChunks.push({
            id: `${f.name}-chunk-1`,
            docName: f.name,
            docType: f.type?.includes('pdf') ? 'pdf' : f.type?.includes('sheet') ? 'excel' : 'text',
            sectionTitle: 'Main Document Content',
            content: f.extractedText,
            charCount: f.extractedText.length,
          })
        }

        if (f.isImage && f.dataUrl) {
          imageFiles.push(f)
        }
      }
    }

    // 3. Run Hybrid Context Retrieval for 200-500+ Pages
    const retrieval = retrieveContextForQuery(userQuery, allChunks, 25000)
    let filesContext = ''

    if (allChunks.length > 0) {
      filesContext = `\n\n${retrieval.formattedContext}`
    } else if (files.length > 0) {
      // Fallback text if no chunks
      filesContext = '\n\nATTACHED USER DOCUMENTS FOR ANALYSIS:\n'
      files.forEach((f: any, idx: number) => {
        filesContext += `--- Document #${idx + 1}: "${f.name}" (${f.type}, ${f.size} bytes) ---\n`
        if (f.extractedText) {
          filesContext += `${f.extractedText.slice(0, 25000)}\n\n`
        }
      })
    }

    // 4. Try Calling OpenAI API (gpt-4o)
    const apiKey = process.env.OPENAI_API_KEY
    const modelName = process.env.OPENAI_MODEL || 'gpt-4o'

    if (apiKey) {
      try {
        const openai = createOpenAI({ apiKey })

        // Format history for LLM
        const formattedMessages = messages.map((m, idx) => {
          const isLatest = idx === messages.length - 1

          // If latest message has images, format as multi-modal content
          if (isLatest && m.role === 'user' && imageFiles.length > 0) {
            const contentParts: any[] = [
              { type: 'text', text: m.content || 'Please analyze this attached image/document strictly.' },
            ]
            imageFiles.forEach(img => {
              contentParts.push({
                type: 'image',
                image: img.dataUrl,
              })
            })
            return {
              role: 'user' as const,
              content: contentParts,
            }
          }

          return {
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }
        })

        const systemPrompt = `${SYSTEM_INSTRUCTIONS}\n\n${liveDataContext}${filesContext}`

        const result = await generateText({
          model: openai(modelName),
          system: systemPrompt,
          messages: formattedMessages as any,
          temperature: 0.1, // Low temperature for strict factual accuracy
        })

        if (result && result.text) {
          // 5. Run Strict Grounding Verification Layer
          const verification = verifyResponseAccuracy(result.text, retrieval.retrievedChunks)

          return NextResponse.json({
            reply: result.text,
            grounded: verification.isVerified,
            model: modelName,
            sources: verification.verifiedSources,
            verification: {
              confidence: verification.confidence,
              isVerified: verification.isVerified,
              auditNotes: verification.auditNotes,
              unverifiedClaims: verification.unverifiedClaims,
            },
            conflicts: retrieval.conflicts,
            totalPagesAnalyzed: retrieval.totalDocumentPagesAnalyzed || totalDocumentPages,
            chunksAnalyzed: retrieval.totalChunksAnalyzed,
            sourceCount: tenders.length,
            analyzedFiles: files.length,
            scopedTenderId: cleanCurrentTender?.id,
          })
        }
      } catch (aiErr: any) {
        console.warn('OpenAI generateText warning (falling back to local engine):', aiErr?.message || aiErr)
      }
    }

    // 6. Fallback to Local Engine if OpenAI is unavailable
    const fallbackResult = handleFallbackResponse(
      userQuery,
      tenders,
      messages,
      files,
      cleanCurrentTender,
      allChunks
    )

    return NextResponse.json({
      reply: fallbackResult.reply,
      grounded: true,
      model: 'tender-fms-local-engine',
      sources: fallbackResult.sources,
      totalPagesAnalyzed: retrieval.totalDocumentPagesAnalyzed || totalDocumentPages,
      chunksAnalyzed: retrieval.totalChunksAnalyzed,
      sourceCount: tenders.length,
      analyzedFiles: files.length,
      scopedTenderId: cleanCurrentTender?.id,
    })
  } catch (err: any) {
    console.error('Error in tender-query route:', err)
    return NextResponse.json(
      {
        error: 'Failed to process tender query.',
        details: err?.message || 'Internal error',
      },
      { status: 500 }
    )
  }
}
