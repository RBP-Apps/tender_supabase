import { Tender, PortalChecklistItem, PortalUploadDocumentItem } from '@/types/tender'

export interface ExtractedPortalChecklistResult {
  source: 'ai-pdf' | 'local-heuristic'
  sectionTitle: string
  items: PortalChecklistItem[]
}

/**
 * Extracts or generates the dynamic portal document checklist from the tender PDF and tender records.
 * Integrates with existing saved checkbox selections so user choices are never overwritten.
 */
export async function extractPortalChecklist(
  tender: Tender,
  attachedDocs: PortalUploadDocumentItem[],
  existingChecklist?: PortalChecklistItem[]
): Promise<ExtractedPortalChecklistResult> {
  const previousCheckedMap: Record<string, boolean> = {}
  if (existingChecklist && existingChecklist.length > 0) {
    existingChecklist.forEach(item => {
      previousCheckedMap[item.id] = item.checked
      previousCheckedMap[item.docName.toLowerCase().trim()] = item.checked
    })
  }

  // 1. Check if we have a tender PDF available
  const pdfDataUrl =
    tender.tenderDoc?.dataUrl ||
    attachedDocs.find(d => d.fieldKey === 'tenderNotice' && d.dataUrl)?.dataUrl

  // 2. Always attempt AI-based extraction from the uploaded tender PDF or server repository
  if (typeof window !== 'undefined') {
    try {
      const response = await fetch('/api/extract-portal-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: pdfDataUrl || undefined,
          fileName: tender.tenderDoc?.name || 'Tender_Document.pdf',
          tenderTitle: tender.title,
          tenderId: tender.id,
          authority: tender.authority,
        }),
      })

      if (response.ok) {
        const json = await response.json()
        if (json.success && json.data?.items && Array.isArray(json.data.items) && json.data.items.length > 0) {
          const aiItems: PortalChecklistItem[] = json.data.items.map((item: any, idx: number) => {
            const slNo = item.slNo || idx + 1
            const id = `chk-pdf-${slNo}`
            const nameKey = item.docName.toLowerCase().trim()
            const isPreviouslyChecked =
              previousCheckedMap[id] ??
              previousCheckedMap[nameKey] ??
              previousCheckedMap[`chk-${slNo}`] ??
              (item.isMandatory !== false)

            // Intelligent match with attached documents across stages
            const cat = (item.matchedFieldCategory || '').toLowerCase()
            const matchedDoc = attachedDocs.find(d => {
              const dName = (d.name || '').toLowerCase()
              const fLabel = (d.fieldLabel || '').toLowerCase()
              const fKey = (d.fieldKey || '').toLowerCase()

              if (cat && (fKey === cat || fKey.includes(cat) || cat.includes(fKey))) return true
              if (cat === 'tendernotice' && (fKey === 'tendernotice' || dName.includes('tender') || dName.includes('nit'))) return true
              if (cat === 'turnover' && (fKey === 'turnover' || dName.includes('turnover') || dName.includes('ca_') || dName.includes('networth'))) return true
              if (cat === 'experience' && (fKey === 'experience' || dName.includes('experience') || dName.includes('work_order') || dName.includes('completion'))) return true
              if (cat === 'vendorreg' && (fKey === 'vendorreg' || dName.includes('vendor') || dName.includes('pan') || dName.includes('gst'))) return true
              if (cat === 'mafletter' && (fKey === 'mafletter' || dName.includes('maf'))) return true
              if (cat === 'testreport' && (fKey === 'testreport' || dName.includes('test'))) return true
              if (cat === 'biscertificate' && (fKey === 'biscert' || dName.includes('bis') || dName.includes('isi'))) return true
              if (cat === 'productsample' && (fKey === 'productsample' || dName.includes('sample') || dName.includes('data_sheet'))) return true
              if (cat === 'emdproof' && (fKey === 'emdproof' || dName.includes('emd') || dName.includes('challan') || dName.includes('fee'))) return true
              if (cat === 'bidannexures' && (fKey === 'bidannexures' || dName.includes('bid') || dName.includes('packet') || dName.includes('schedule') || dName.includes('undertaking'))) return true

              return (
                fLabel.includes(nameKey.slice(0, 15)) ||
                nameKey.includes(fLabel.slice(0, 15)) ||
                dName.includes(nameKey.slice(0, 15))
              )
            })

            // Clean document name with serial number prefix
            let formattedDocName = item.docName
            if (!formattedDocName.startsWith(`${slNo}.`)) {
              formattedDocName = `${slNo}. ${formattedDocName}`
            }

            return {
              id,
              docName: formattedDocName,
              requirement: item.requirement || (item.isMandatory ? 'Mandatory' : 'Conditional'),
              applicableDetails: item.applicableDetails || (item.envelope ? `Envelope: ${item.envelope}` : ''),
              clauseOrPageRef: item.clauseOrPageRef || (json.data.pageOrClause ? json.data.pageOrClause : ''),
              isMandatory: item.isMandatory !== false,
              checked: isPreviouslyChecked,
              matchedFieldKey: matchedDoc?.fieldKey,
              matchedDocumentName: matchedDoc?.name,
            }
          })

          return {
            source: 'ai-pdf',
            sectionTitle:
              json.data.sectionTitle ||
              'CHECK LIST OF DOCUMENTS TO BE UPLOADED IN THE E-BIDDING PORTAL',
            items: aiItems,
          }
        }
      }
    } catch (err) {
      console.warn('AI checklist extraction error, using dynamic tender requirements fallback:', err)
    }
  }

  // 3. Fallback: Dynamic heuristic extraction tailored specifically to this tender's requirements
  const dynamicItems = getHeuristicChecklist(tender, attachedDocs, previousCheckedMap)

  return {
    source: 'local-heuristic',
    sectionTitle: 'CHECK LIST OF DOCUMENTS TO BE UPLOADED IN THE E-BIDDING PORTAL',
    items: dynamicItems,
  }
}

/**
 * Synchronous generator for tender-tailored dynamic checklist items.
 */
export function getHeuristicChecklist(
  tender: Tender,
  attachedDocs: PortalUploadDocumentItem[] = [],
  previousCheckedMap: Record<string, boolean> = {}
): PortalChecklistItem[] {
  const dynamicItems: PortalChecklistItem[] = []

  // Helper to link matched attached doc
  const findMatch = (keys: string[]) => {
    return attachedDocs.find(d => keys.some(k => d.fieldKey.toLowerCase().includes(k)))
  }

  // Item 1: Tender Notice / NIT & Corrigendum Copy
  const matchNIT = findMatch(['tendernotice', 'nit', 'tender_doc'])
  dynamicItems.push({
    id: 'chk-1',
    docName: '1. Scanned Copy of Tender Notice / NIT & all Corrigendum / Addendum Documents',
    requirement: 'Mandatory',
    applicableDetails: tender.corrigenda?.length
      ? `Signed NIT with all ${tender.corrigenda.length} issued corrigenda acknowledged`
      : 'Signed & stamped NIT copy with tender document acknowledgment',
    clauseOrPageRef: 'Clause: Tender Document Submission',
    isMandatory: true,
    checked: previousCheckedMap['chk-1'] ?? !!matchNIT,
    matchedFieldKey: matchNIT?.fieldKey || 'tenderNotice',
    matchedDocumentName: matchNIT?.name,
  })

  // Item 2: Tender Fee & EMD Transaction Proof
  const matchEMD = findMatch(['emdproof', 'emd', 'challan'])
  const emdFromPackage = tender.bid?.packages?.[0]?.emdLakh
    ? `₹${tender.bid.packages[0].emdLakh} Lakh`
    : tender.emdReady?.amount
    ? `₹${tender.emdReady.amount}`
    : null
  const emdDetailText = emdFromPackage
    ? `EMD Amount: ${emdFromPackage} (UTR/Bank Guarantee/MSME Exemption)`
    : tender.emdReady?.utrNumber
    ? `UTR No: ${tender.emdReady.utrNumber}`
    : 'Online payment receipt / Bank Guarantee / Exemption MSME certificate'
  dynamicItems.push({
    id: 'chk-2',
    docName: '2. Scanned Copy of Tender Fee Receipt & EMD Payment Proof / Bank Guarantee',
    requirement: 'Mandatory (unless claiming statutory MSME / NSIC exemption)',
    applicableDetails: emdDetailText,
    clauseOrPageRef: 'Clause: EMD & Tender Fee',
    isMandatory: true,
    checked: previousCheckedMap['chk-2'] ?? !!matchEMD,
    matchedFieldKey: matchEMD?.fieldKey || 'emdProof',
    matchedDocumentName: matchEMD?.name,
  })

  // Item 3: Annual Financial Turnover Certificate
  const matchTurnover = findMatch(['turnover', 'ca_cert'])
  dynamicItems.push({
    id: 'chk-3',
    docName: '3. Audited CA Turnover Certificate & Balance Sheets with UDIN',
    requirement: 'Mandatory',
    applicableDetails:
      tender.turnoverRequirement ||
      tender.bid?.turnoverRequirement ||
      'Audited turnover for last 3 financial years certified by Chartered Accountant with UDIN',
    clauseOrPageRef: 'Eligibility Clause: Financial Turnover',
    isMandatory: true,
    checked: previousCheckedMap['chk-3'] ?? !!matchTurnover,
    matchedFieldKey: matchTurnover?.fieldKey || 'turnover',
    matchedDocumentName: matchTurnover?.name,
  })

  // Item 4: Experience / Work Completion Credentials
  const matchExp = findMatch(['experience', 'work_order'])
  dynamicItems.push({
    id: 'chk-4',
    docName: '4. Work Orders, Agreement Copies & Client Completion Certificates',
    requirement: 'Mandatory',
    applicableDetails:
      tender.experienceRequirement ||
      tender.bid?.experienceRequirement ||
      'Satisfactory completion of similar works for Govt. / PSU departments',
    clauseOrPageRef: 'Eligibility Clause: Technical Experience',
    isMandatory: true,
    checked: previousCheckedMap['chk-4'] ?? !!matchExp,
    matchedFieldKey: matchExp?.fieldKey || 'experience',
    matchedDocumentName: matchExp?.name,
  })

  // Item 5: Vendor & Statutory Registrations
  const matchReg = findMatch(['vendorreg', 'registration', 'gst'])
  dynamicItems.push({
    id: 'chk-5',
    docName: '5. Firm Registration Certificate, GSTIN Registration & PAN Card',
    requirement: 'Mandatory',
    applicableDetails: tender.gstSection
      ? `GST Condition: ${tender.gstSection.slice(0, 80)}...`
      : 'Valid Certificate of Incorporation, GST Registration, and PAN Card',
    clauseOrPageRef: 'Statutory Registration Clause',
    isMandatory: true,
    checked: previousCheckedMap['chk-5'] ?? !!matchReg,
    matchedFieldKey: matchReg?.fieldKey || 'vendorReg',
    matchedDocumentName: matchReg?.name,
  })

  // Item 6: Manufacturer Authorization Form (MAF Letter)
  const matchMAF = findMatch(['mafletter', 'maf'])
  const mafReq = tender.mafRequirement || tender.bid?.mafRequirement || 'Required from OEM for critical components'
  dynamicItems.push({
    id: 'chk-6',
    docName: '6. Manufacturer Authorization Form (MAF) from OEM on OEM Letterhead',
    requirement: mafReq.toLowerCase().includes('not required') ? 'Conditional' : 'Mandatory',
    applicableDetails: mafReq,
    clauseOrPageRef: 'Technical Clause: OEM MAF Authorization',
    isMandatory: !mafReq.toLowerCase().includes('not required'),
    checked: previousCheckedMap['chk-6'] ?? !!matchMAF,
    matchedFieldKey: matchMAF?.fieldKey || 'mafLetter',
    matchedDocumentName: matchMAF?.name,
  })

  // Item 7: Laboratory Test Report
  const matchTest = findMatch(['testreport', 'test'])
  dynamicItems.push({
    id: 'chk-7',
    docName: '7. Accredited Laboratory Type Test Reports & Technical Quality Certifications',
    requirement: 'Mandatory',
    applicableDetails:
      tender.testReportCompliance ||
      'NABL / Govt accredited testing laboratory reports meeting specified IS/IEC standards',
    clauseOrPageRef: 'Technical Compliance Clause',
    isMandatory: true,
    checked: previousCheckedMap['chk-7'] ?? !!matchTest,
    matchedFieldKey: matchTest?.fieldKey || 'testReport',
    matchedDocumentName: matchTest?.name,
  })

  // Item 8: BIS / ISO Standard Certificate
  const matchBIS = findMatch(['biscertificate', 'bis', 'iso'])
  dynamicItems.push({
    id: 'chk-8',
    docName: '8. Bureau of Indian Standards (BIS) / CRS / ISO Compliance Certificates',
    requirement: 'Mandatory for solar/electrical equipment',
    applicableDetails: 'Valid BIS registration / Compulsory Registration Scheme (CRS) license',
    clauseOrPageRef: 'Quality Standards Clause',
    isMandatory: true,
    checked: previousCheckedMap['chk-8'] ?? !!matchBIS,
    matchedFieldKey: matchBIS?.fieldKey || 'bisCertificate',
    matchedDocumentName: matchBIS?.name,
  })

  // Item 9: Product Sample Submission Receipt / Datasheet
  const matchSample = findMatch(['productsample', 'sample'])
  dynamicItems.push({
    id: 'chk-9',
    docName: '9. Product Sample Submission Receipt, Technical Datasheet & Component Specs',
    requirement: 'Mandatory',
    applicableDetails: 'Courier challan / department sample deposit slip & product schedule',
    clauseOrPageRef: 'Physical Sample Clause',
    isMandatory: true,
    checked: previousCheckedMap['chk-9'] ?? !!matchSample,
    matchedFieldKey: matchSample?.fieldKey || 'productSample',
    matchedDocumentName: matchSample?.name,
  })

  // Item 10: Signed Bid Submission Formats & Affidavits
  const matchAnnex = findMatch(['bidannexures', 'annexure', 'format'])
  dynamicItems.push({
    id: 'chk-10',
    docName: '10. Stamped & Signed Bid Formats, Undertakings & Non-Blacklisting Affidavit',
    requirement: 'Mandatory (on ₹100 Notarized Stamp Paper)',
    applicableDetails: 'Format-1 (Submission Letter), Format-2 (Power of Attorney), Format-5 & Non-Blacklisting Affidavit',
    clauseOrPageRef: 'Annexures & Formats Section',
    isMandatory: true,
    checked: previousCheckedMap['chk-10'] ?? !!matchAnnex,
    matchedFieldKey: matchAnnex?.fieldKey || 'bidAnnexures',
    matchedDocumentName: matchAnnex?.name,
  })

  // Item 11: DSC Token Encryption & Portal Specific Authorization
  const matchOther = findMatch(['otherportal', 'dsc'])
  dynamicItems.push({
    id: 'chk-11',
    docName: '11. Portal Upload Summary, DSC Class-3 Token Encryption & Integrity Pact',
    requirement: 'Mandatory for e-Procurement Portal',
    applicableDetails: 'Class-3 Digital Signature Certificate (DSC) verification & portal acknowledgement',
    clauseOrPageRef: 'e-Bidding Portal Instructions',
    isMandatory: true,
    checked: previousCheckedMap['chk-11'] ?? !!matchOther,
    matchedFieldKey: matchOther?.fieldKey || 'otherPortal',
    matchedDocumentName: matchOther?.name,
  })

  return dynamicItems
}

/**
 * Checks whether the current checklist is using the legacy 11-item hardcoded/heuristic list,
 * meaning it should be upgraded automatically when opening the modal or on refresh.
 */
export function isOldFallbackChecklist(items?: PortalChecklistItem[]): boolean {
  if (!items || items.length === 0) return true
  if (items.length <= 11 && items.some(it => it.id === 'chk-1' || it.id === 'chk-11')) {
    return true
  }
  return false
}

