import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { NextResponse } from 'next/server'
import { sanitizeTenderForAI, formatTenderDetailedContext } from '@/lib/tender-ai-context'
import { retrieveContextForQuery } from '@/lib/document-retrieval-engine'
import {
  verifyResponseAccuracy,
  NOT_FOUND_DISCLAIMER,
  EXTRACTION_INCOMPLETE_DISCLAIMER,
} from '@/lib/document-verifier'
import { DocumentPageChunk } from '@/types/document-understanding'
import { supabase } from '@/lib/supabaseClient'
import { findTenderIndexes, loadIndexedPages, pagesToChunks, semanticScores } from '@/lib/document-index-store'
import { runSemanticVerification } from '@/lib/answer-semantic-verifier'
import { UsageTracker } from '@/lib/ai-usage'

export const runtime = 'nodejs'
export const maxDuration = 120

const SYSTEM_INSTRUCTIONS = `You are "Tender Query AI", the intelligent Universal Document Understanding & Answering Assistant embedded inside Tender FMS.
Your mission is to assist users with everything related to Tender FMS: workflows, modules, required documents, eligibility rules, live tender records, and analyzing attached user documents with deep comprehension comparable to ChatGPT, Gemini, and Claude.

### LANGUAGE SUPPORT:
- You must reply fluently in the SAME language the user asks: English, Hindi (हिन्दी), or Hinglish (Hindi written in Roman script).
- For Hindi/Hinglish questions, provide natural, professional, and clear answers.

### CORE PRINCIPLE:
You are a Tender Document Analysis Assistant. Your only authoritative source for tender-specific answers is the actual tender document uploaded by the user, as given to you in "EXTRACTED GROUND-TRUTH DOCUMENT SECTIONS".
You are strictly prohibited from inventing, assuming, estimating or inferring missing tender information.
You have NOT read the whole document: you only see the passages retrieved below. Never pretend to have read pages, clauses or tables that are not shown to you.
A separate automated verifier will check every number, date, percentage and page you cite against the original text; claims that are not in the passages will be flagged to the user.

### SOURCES AND THEIR AUTHORITY:
- "EXTRACTED GROUND-TRUTH DOCUMENT SECTIONS" = text of the uploaded document(s), with real page numbers. This is the ONLY source for tender facts when a document is attached.
- "LIVE TENDER RECORDS" / "CURRENTLY SCOPED TENDER" = Tender FMS database entries (some fields were auto-filled earlier and may be wrong). Use them for workflow/status questions. If you use them for a tender fact, cite "Tender FMS record" — never give them a PDF page number — and if they disagree with the document, report both.

### STRICT DOCUMENT-BASED ANSWERING RULES (MOST IMPORTANT):
1. ANSWER ONLY ACCORDING TO THE UPLOADED DOCUMENT:
   - Ground your answers SOLELY and EXCLUSIVELY in the provided "EXTRACTED GROUND-TRUTH DOCUMENT SECTIONS" (and, for workflow/status questions, "LIVE TENDER RECORDS").
   - Never guess, extrapolate, or hallucinate answers.
   - Never generate answers using your own assumptions, general knowledge, or external information.
   - Never add information that is not explicitly available or logically supported by the uploaded document.
   - Do not modify, manipulate, or interpret facts beyond what the document actually states.
   - Accuracy is strictly more important than creativity. Document evidence is more important than AI assumptions.

2. MANDATORY ABSENCE RULE:
   - If the requested information is not found in the uploaded document, you MUST explicitly state:
     "${NOT_FOUND_DISCLAIMER}"
   - If the answer could be on a page listed under "EXTRACTION STATUS: PAGES THAT COULD NOT BE READ", reply:
     "${EXTRACTION_INCOMPLETE_DISCLAIMER}" and name those pages.
   - If information on a page is unclear, illegible, or incomplete (e.g. low-confidence OCR), explicitly state:
     "The content on [Document Name], Page [X] is unclear or incomplete."
   - Keep these situations separate: (a) not mentioned in the document, (b) page could not be extracted, (c) document not attached.

3. EXACT FACTS, NUMBERS, DATES & SPELLINGS:
   - Values, dates, names, technical terms, clauses, amounts, percentages, units, and table values must be returned EXACTLY as written in the document.
   - Do NOT round off, convert units, or modify dates, spellings, or figures. Preserve the original meaning exactly.

4. MANDATORY ANSWER FORMAT WITH EXACT PAGE NUMBER & SOURCE CITATION:
   For every tender-fact answer use this structure:
     **Answer:** <the value / requirement exactly as written>
     **Source:** [Document Name], Page [X], [Clause / Section number or title as printed]
     **Supporting Evidence:** "<verbatim quote copied from that page>"
   - Page numbers MUST be the PAGE numbers shown in the "=== [DOCUMENT ... | PAGE: X" headers (physical PDF page), not page numbers printed inside the text.
   - For Word files cite the section (no page numbers exist). For Excel: **Source:** [Document Name], Sheet: "[Sheet Name]", Cell: [Cell Reference]
   - If information is found across multiple pages, give one Source line per page.
   - The quote must be copied character-for-character from the passage; do not paraphrase inside quotes.
   - Never generate fake page references or citations. Do NOT write a "Verification Status" yourself; the system adds it.

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
    const usage = new UsageTracker()
    const evidenceWarnings: string[] = []
    // index scope (tender id or chat scope) → index ids, for tender-scoped vector search
    const indexScopes = new Map<string, string[]>()
    const loadedIndexIds = new Set<string>()

    const addIndexed = async (indexId: string, scopeId: string, label?: string) => {
      if (loadedIndexIds.has(indexId)) return
      const { data: row, error } = await supabase
        .from('document_index')
        .select('id,tender_id,doc_name,doc_hash,page_count,pages_done,status')
        .eq('id', indexId)
        .maybeSingle()
      if (error || !row) {
        evidenceWarnings.push(`Indexed document ${label || indexId} could not be loaded${error ? ` (${error.message})` : ''}.`)
        return
      }
      // A document indexed for another tender / chat is never used here.
      if (row.tender_id !== scopeId) {
        evidenceWarnings.push(`Document "${row.doc_name}" belongs to a different tender scope and was not used.`)
        return
      }
      const pages = await loadIndexedPages(row.id)
      allChunks.push(...pagesToChunks({ indexId: row.id, docHash: row.doc_hash, docName: row.doc_name }, pages))
      totalDocumentPages += row.page_count || pages.length
      if (row.pages_done < (row.page_count || 0)) {
        evidenceWarnings.push(`"${row.doc_name}" is only partly indexed (${row.pages_done}/${row.page_count} pages).`)
      }
      loadedIndexIds.add(row.id)
      indexScopes.set(scopeId, [...(indexScopes.get(scopeId) || []), row.id])
    }

    if (Array.isArray(files) && files.length > 0) {
      for (const f of files) {
        if (f.indexId && f.indexScopeId) {
          try {
            await addIndexed(f.indexId, f.indexScopeId, f.name)
          } catch (e: any) {
            evidenceWarnings.push(`"${f.name}" could not be loaded from the document index: ${e?.message || e}`)
          }
          continue
        }
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

    // 2b. Scoped tender: automatically use ITS tender document and corrigenda
    if (cleanCurrentTender?.id && currentTender) {
      // First check stored indexes
      const wanted = new Set<string>(
        [currentTender.tenderDoc?.dataUrl, currentTender.tenderDoc?.name, ...(currentTender.corrigenda || []).map((c: any) => c?.fileUrl || c?.dataUrl || c?.fileName)].filter(
          Boolean
        )
      )
      if (wanted.size) {
        try {
          const rows = await findTenderIndexes(String(cleanCurrentTender.id), ['tender', 'corrigendum'])
          for (const r of rows) {
            if ((r.source_url && wanted.has(r.source_url)) || (r.doc_name && wanted.has(r.doc_name))) {
              await addIndexed(r.id, String(cleanCurrentTender.id), r.doc_name)
            }
          }
        } catch (e: any) {
          evidenceWarnings.push(`Tender document index lookup failed: ${e?.message || e}`)
        }
      }

      // If no chunks loaded yet, auto-load via loadTenderEvidence (reads Image_Module_Tender PDF natively)
      if (allChunks.length === 0) {
        try {
          const { loadTenderEvidence } = await import('@/lib/tender-evidence')
          const evidence = await loadTenderEvidence(cleanCurrentTender, { usage, timeBudgetMs: 60000 })
          if (evidence.chunks.length > 0) {
            allChunks.push(...evidence.chunks)
            totalDocumentPages += evidence.chunks.length
          }
        } catch (err: any) {
          console.warn('Could not auto-load scoped tender evidence:', err?.message || err)
        }
      }
    }

    // 3. Hybrid retrieval (BM25 + pgvector) for 200-500+ pages
    // Short follow-ups ("and the EMD?") inherit the previous question's terms so
    // retrieval still targets the right clauses.
    const prevUserQuery =
      [...messages].reverse().filter((m: any) => m.role === 'user')[1]?.content || ''
    const retrievalQuery =
      userQuery.split(/\s+/).length < 8 && prevUserQuery ? `${userQuery} ${prevUserQuery}` : userQuery
    let semantic: Map<string, number> | undefined
    if (indexScopes.size && process.env.OPENAI_API_KEY) {
      semantic = new Map()
      for (const [scopeId, ids] of indexScopes) {
        try {
          const m = await semanticScores(scopeId, ids, retrievalQuery, usage)
          m.forEach((v, k) => semantic!.set(k, v))
        } catch (e: any) {
          evidenceWarnings.push(`Semantic search unavailable (${e?.message || e}); keyword search only.`)
        }
      }
    }
    const retrieval = retrieveContextForQuery(retrievalQuery, allChunks, 25000, { semanticScores: semantic })
    let filesContext = ''

    if (allChunks.length > 0) {
      filesContext = `\n\n${retrieval.formattedContext}`
      if (evidenceWarnings.length) {
        filesContext += `### DOCUMENT LOADING NOTES\n${evidenceWarnings.map(w => `- ${w}`).join('\n')}\n`
      }
    } else if (evidenceWarnings.length) {
      filesContext = `\n\n### DOCUMENT LOADING PROBLEMS (no document text is available)\n${evidenceWarnings.map(w => `- ${w}`).join('\n')}\nTell the user the document could not be read; do not answer document questions from memory.\n`
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

        // Collect all multimodal visual assets: standalone image files + top retrieved scanned PDF page images.
        // Unreadable scanned pages (OCR failed) are also sent as images when few enough,
        // so their content is not silently lost.
        const scannedImages = [
          ...retrieval.retrievedChunks.filter(
            c => c.isScanned && typeof c.dataUrl === 'string' && c.dataUrl.startsWith('data:image')
          ),
          ...allChunks.filter(
            c =>
              c.content.startsWith('[EXTRACTION FAILED') &&
              typeof c.dataUrl === 'string' &&
              c.dataUrl.startsWith('data:image')
          ),
        ]
          .filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i)
          .slice(0, 4)

        const allVisualImages = [
          ...imageFiles,
          ...scannedImages.map(c => ({
            name: `${c.docName} (Page ${c.pageNumber || 1})`,
            dataUrl: c.dataUrl!,
          })),
        ]

        // Format history for LLM
        const formattedMessages = messages.map((m, idx) => {
          const isLatest = idx === messages.length - 1

          // If latest message has images or scanned pages, format as multi-modal content
          if (isLatest && m.role === 'user' && allVisualImages.length > 0) {
            const contentParts: any[] = [
              { type: 'text', text: m.content || 'Please analyze this attached document and answer strictly based on its content.' },
            ]
            allVisualImages.forEach(img => {
              if (img.dataUrl) {
                contentParts.push({
                  type: 'text',
                  text: `[Image of: ${img.name} — cite exactly this document/page when using it]`,
                })
                contentParts.push({
                  type: 'image',
                  image: img.dataUrl,
                })
              }
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

        if (!result?.text) {
          throw new Error('OpenAI returned an empty answer.')
        }
        usage.add('chat', modelName, result.usage as any)

        // 5. Verification: deterministic checks against the retrieved original text,
        //    then (only when those cannot decide) an independent OpenAI audit whose
        //    quotes are themselves checked verbatim (proposal E).
        const hasDocs = allChunks.length > 0
        let verification = hasDocs ? verifyResponseAccuracy(result.text, retrieval.retrievedChunks) : null
        if (verification) {
          verification = await runSemanticVerification({
            question: userQuery,
            answer: result.text,
            deterministic: verification,
            retrieved: retrieval.retrievedChunks,
            usage,
          })
        }

        let reply = result.text
        if (verification) {
          const label =
            verification.status === 'verified'
              ? 'Verified against the uploaded document'
              : verification.status === 'verified-scanned'
              ? 'Verified against a machine-read scan (OCR/Vision) – confirm on the original page'
              : verification.status === 'evidence-not-found'
              ? 'Evidence not found in the uploaded document'
              : verification.status === 'extraction-incomplete'
              ? 'Document extraction incomplete – manual verification required'
              : 'NOT verified – one or more statements could not be matched to the cited pages; check the original PDF'
          reply += `\n\n---\n**Verification Status:** ${label}`
        }
        console.info('[tender-query] usage', JSON.stringify(usage.toJSON()))

        return NextResponse.json({
          reply,
          grounded: verification ? verification.isVerified : false,
          model: modelName,
          sources: verification?.verifiedSources || [],
          verification: verification
            ? {
                status: verification.status,
                confidence: verification.confidence,
                isVerified: verification.isVerified,
                auditNotes: verification.auditNotes,
                unverifiedClaims: verification.unverifiedClaims,
                semanticCheck: verification.semanticCheck,
              }
            : undefined,
          retrievalMode: semantic && semantic.size ? 'hybrid (BM25 + vector)' : 'keyword (BM25)',
          documentWarnings: evidenceWarnings,
          usage: usage.toJSON(),
          conflicts: retrieval.conflicts,
          unreadablePages: retrieval.unreadablePages,
          extractionIncomplete: (retrieval.unreadablePages?.length || 0) > 0,
          totalPagesAnalyzed: retrieval.totalDocumentPagesAnalyzed || totalDocumentPages,
          chunksAnalyzed: retrieval.totalChunksAnalyzed,
          sourceCount: tenders.length,
          analyzedFiles: files.length,
          scopedTenderId: cleanCurrentTender?.id,
        })
      } catch (aiErr: any) {
        // Never substitute a keyword-snippet answer for a failed AI call.
        console.error('OpenAI tender-query call failed:', aiErr?.message || aiErr)
        return NextResponse.json(
          {
            error: 'The AI service could not answer this question right now. No answer was generated – please retry.',
            details: aiErr?.message || 'OpenAI request failed',
          },
          { status: 502 }
        )
      }
    }

    // 6. No API key configured: show the matching passages only, clearly labelled
    //    as unverified raw text (not an AI answer).
    const fallbackResult = handleFallbackResponse(
      userQuery,
      tenders,
      messages,
      files,
      cleanCurrentTender,
      allChunks
    )

    return NextResponse.json({
      reply:
        '> ⚠️ AI service is not configured (OPENAI_API_KEY missing). Below is the best-matching raw passage only – it is NOT a verified answer.\n\n' +
        fallbackResult.reply,
      grounded: false,
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
