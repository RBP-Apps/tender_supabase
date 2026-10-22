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
              envelope: item.envelope || (slNo <= 7 ? 'Envelope A: Pre-Qualification' : 'Envelope B: Technical and Financial Qualification'),
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

  // 1. EMD + Tender Document Fee submission form
  const matchEMD = findMatch(['emdproof', 'emd', 'challan', 'fee'])
  const emdFromPackage = tender.bid?.packages?.[0]?.emdLakh
    ? `₹${tender.bid.packages[0].emdLakh} Lakh`
    : tender.emdReady?.amount
    ? `₹${tender.emdReady.amount}`
    : 'Rs. 3,11,800/-'
  dynamicItems.push({
    id: 'chk-1',
    docName: '1. EMD + Tender Document Fee submission form of the bidder confirmed by CREDA (as on page – 6)',
    requirement: 'Mandatory (Single NEFT/RTGS Transaction)',
    applicableDetails: `EMD Amount: ${emdDetailText(tender, emdFromPackage)}. Form as per Page 6 of tender document.`,
    clauseOrPageRef: 'Page 6 (Details of EMD & Fee)',
    envelope: 'Envelope A: Pre-Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-1'] ?? !!matchEMD,
    matchedFieldKey: matchEMD?.fieldKey || 'emdProof',
    matchedDocumentName: matchEMD?.name,
  })

  // 2. Undertaking of the Bidder (Page 7)
  const matchUndertaking = findMatch(['undertaking', 'bidannexures', 'format'])
  dynamicItems.push({
    id: 'chk-2',
    docName: '2. Scanned Copy of Undertaking of the Bidder as mentioned on Page – 7 of the tender document on the letter head of bidder.',
    requirement: 'Mandatory (On Bidder Letterhead)',
    applicableDetails: 'Signed undertaking accepting 180-day bid validity, scope of supply and tender rules as per Page 7.',
    clauseOrPageRef: 'Page 7 (Undertaking of Bidder)',
    envelope: 'Envelope A: Pre-Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-2'] ?? !!matchUndertaking,
    matchedFieldKey: matchUndertaking?.fieldKey || 'bidAnnexures',
    matchedDocumentName: matchUndertaking?.name,
  })

  // 3. Scanned copy of original tender document
  const matchNIT = findMatch(['tendernotice', 'nit', 'tender_doc'])
  dynamicItems.push({
    id: 'chk-3',
    docName: '3. Scanned copy of original tender document duly signed & with stamp on each page, as a confirmation of acceptance of the Terms & Conditions (T&C).',
    requirement: 'Mandatory',
    applicableDetails: 'Original tender NIT copy stamped and signed on every page confirming unconditional T&C acceptance.',
    clauseOrPageRef: 'Tender T&C Acceptance',
    envelope: 'Envelope A: Pre-Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-3'] ?? !!matchNIT,
    matchedFieldKey: matchNIT?.fieldKey || 'tenderNotice',
    matchedDocumentName: matchNIT?.name,
  })

  // 4. PAN, GSTIN
  const matchPAN = findMatch(['vendorreg', 'registration', 'gst', 'pan'])
  dynamicItems.push({
    id: 'chk-4',
    docName: '4. PAN, GSTIN issued in the name of the bidder',
    requirement: 'Mandatory',
    applicableDetails: 'Valid GST Registration Certificate (GSTIN) and PAN Card issued in company name.',
    clauseOrPageRef: 'Section 01, Clause 8',
    envelope: 'Envelope A: Pre-Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-4'] ?? !!matchPAN,
    matchedFieldKey: matchPAN?.fieldKey || 'vendorReg',
    matchedDocumentName: matchPAN?.name,
  })

  // 5. Self-certificate not debarred/blacklisted
  const matchDebar = findMatch(['debar', 'affidavit', 'blacklist', 'bidannexures'])
  dynamicItems.push({
    id: 'chk-5',
    docName: '5. Self-certificate from Bidder for not been debarred/ blacklisted from any Government organisation.',
    requirement: 'Mandatory',
    applicableDetails: 'Self-declaration certificate on letterhead confirming no debarment or blacklisting across any state/central Govt.',
    clauseOrPageRef: 'Section 01, Clause 1(F)',
    envelope: 'Envelope A: Pre-Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-5'] ?? !!matchDebar,
    matchedFieldKey: matchDebar?.fieldKey || 'bidAnnexures',
    matchedDocumentName: matchDebar?.name,
  })

  // 6. Declaration of conflict of interest / Annexure - III
  const matchConflict = findMatch(['conflict', 'annexure_iii', 'affidavit', 'bidannexures'])
  dynamicItems.push({
    id: 'chk-6',
    docName: '6. Declaration of conflict of interest - by bidder about any relatives working/not working with CREDA along with notarized Affidavit as per Annexure - III',
    requirement: 'Mandatory (₹100 Notarized Stamp Paper)',
    applicableDetails: 'Notarized affidavit on ₹100 stamp paper as per Annexure-III declaring no near relatives in CREDA.',
    clauseOrPageRef: 'Annexure - III (Page 37-38)',
    envelope: 'Envelope A: Pre-Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-6'] ?? !!matchConflict,
    matchedFieldKey: matchConflict?.fieldKey || 'bidAnnexures',
    matchedDocumentName: matchConflict?.name,
  })

  // 7. Copy of Registration: Certificate as vendors of CREDA
  const matchVendorReg = findMatch(['vendorreg', 'creda_reg', 'registration'])
  dynamicItems.push({
    id: 'chk-7',
    docName: '7. Copy of Registration: Certificate as vendors (Manufacturer or Dealer/Distributor of inverter manufacturer) of CREDA for supply of inverter in CREDA if registered otherwise clause (9) page no 11 shall be applicable for registration.',
    requirement: 'Mandatory / Conditional',
    applicableDetails: 'Valid CREDA vendor enlistment certificate or registration undertaking as per clause 9, page 11.',
    clauseOrPageRef: 'Clause 9 & 11, Page 10-11',
    envelope: 'Envelope A: Pre-Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-7'] ?? !!matchVendorReg,
    matchedFieldKey: matchVendorReg?.fieldKey || 'vendorReg',
    matchedDocumentName: matchVendorReg?.name,
  })

  // 8. Valid original Test Reports & MAF summary
  const matchTest = findMatch(['testreport', 'test', 'nabl'])
  dynamicItems.push({
    id: 'chk-8',
    docName: '8. Valid original Test Reports of Inverter or Consent from the owner of test reports and MAF on behalf of owner. (wherever applicable) along with summary sheet',
    requirement: 'Mandatory (NABL / MNRE Lab Reports)',
    applicableDetails: 'Accredited test certificates conforming to IS 16221 / IEC 62109 and IS/IEC 61683 along with summary sheet as per Page 26.',
    clauseOrPageRef: 'Section 01, Clause 1(A) & Page 26',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-8'] ?? !!matchTest,
    matchedFieldKey: matchTest?.fieldKey || 'testReport',
    matchedDocumentName: matchTest?.name,
  })

  // 9. Net Worth Certificate by CA
  const matchNW = findMatch(['networth', 'ca_cert', 'turnover'])
  dynamicItems.push({
    id: 'chk-9',
    docName: '9. Attested copy of Original Net Worth Certificate duly signed by Chartered Accountant as on 31st March 2025/2026.',
    requirement: 'Mandatory (Positive Net Worth >= ₹25 Lakhs)',
    applicableDetails: 'CA Certified Net Worth Certificate with UDIN proving positive net worth >= Rs. 25 Lacs as on 31st March 2025/2026.',
    clauseOrPageRef: 'Section 01, Clause 1(D)',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-9'] ?? !!matchNW,
    matchedFieldKey: matchNW?.fieldKey || 'turnover',
    matchedDocumentName: matchNW?.name,
  })

  // 10. Turn Over certificate by CA
  const matchTurnover = findMatch(['turnover', 'ca_cert'])
  dynamicItems.push({
    id: 'chk-10',
    docName: '10. Attested copy of Original Turn Over certificate in last three financial years i.e. 2022-23, 2023-24, 2024-25 & 2025-26 works done in the field of Inverter',
    requirement: 'Mandatory (Min ₹50 Lakhs in Inverters)',
    applicableDetails: 'Audited CA Turnover Certificate with UDIN and audited balance sheets for last 3 financial years.',
    clauseOrPageRef: 'Section 01, Clause 1(E)',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-10'] ?? !!matchTurnover,
    matchedFieldKey: matchTurnover?.fieldKey || 'turnover',
    matchedDocumentName: matchTurnover?.name,
  })

  // 11. Copy of ITRs for last 03 financial years
  const matchITR = findMatch(['itr', 'turnover', 'ca_cert'])
  dynamicItems.push({
    id: 'chk-11',
    docName: '11. Copy of ITRs for in last 03 financial years i.e. 2022-23, 2023-24, 2024-25 & 2025-26 of the Bidder.',
    requirement: 'Mandatory',
    applicableDetails: 'Certified Income Tax Return (ITR-V / Acknowledgments) for the preceding 3 assessment years.',
    clauseOrPageRef: 'Section 01, Clause 1(E)',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-11'] ?? !!matchITR,
    matchedFieldKey: matchITR?.fieldKey || 'turnover',
    matchedDocumentName: matchITR?.name,
  })

  // 12. Completion and Performance Certificates
  const matchExp = findMatch(['experience', 'work_order', 'completion'])
  dynamicItems.push({
    id: 'chk-12',
    docName: '12. Completion and Performance Certificates of Solar Off-Grid Inverters to any Central Government/State Government Department, Government Agency, Government Organization, Public Sector Undertaking (PSU), or Government-owned Entity, either directly or through the supply of Solar Photovoltaic Power Plants (SPVPP) in any three out of last 05 years 2021-22, 2022-23, 2023-24 ,2024-25 & 2025-26.',
    requirement: 'Mandatory (Min 200 KW/KVA Supply)',
    applicableDetails: 'Government / PSU client completion certificates in Annexure-II format with installation & commissioning proof.',
    clauseOrPageRef: 'Section 01, Clause 1(B) & Annexure-II',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-12'] ?? !!matchExp,
    matchedFieldKey: matchExp?.fieldKey || 'experience',
    matchedDocumentName: matchExp?.name,
  })

  // 13. Proof of being Eligible Manufacturer
  const matchMfg = findMatch(['manufacturer', 'ssi', 'dic', 'factory'])
  dynamicItems.push({
    id: 'chk-13',
    docName: '13. Proof of being Eligible Manufacturer of Solar Off-grid Inverter in the name of manufacturer.',
    requirement: 'Mandatory for OEM',
    applicableDetails: 'Factory license, DIC / SSI / Udyam registration, and list of plant machinery & testing equipment.',
    clauseOrPageRef: 'Section 02, Clause 2 (Proof of Manufacturer)',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-13'] ?? !!matchMfg,
    matchedFieldKey: matchMfg?.fieldKey || 'vendorReg',
    matchedDocumentName: matchMfg?.name,
  })

  // 14. Manufacture Authorization certificates (MAF)
  const matchMAF = findMatch(['mafletter', 'maf', 'oem'])
  dynamicItems.push({
    id: 'chk-14',
    docName: '14. Manufacture Authorization certificates of Solar Off-grid Inverter (mandatory in case of authorised dealer/distributor)',
    requirement: 'Mandatory (for Authorized Dealer / Distributor)',
    applicableDetails: 'OEM authorization letter on manufacturer letterhead guaranteeing equipment supply & 5-year onsite warranty.',
    clauseOrPageRef: 'Section 01, Clause 4 & Section 02, Clause 13',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-14'] ?? !!matchMAF,
    matchedFieldKey: matchMAF?.fieldKey || 'mafLetter',
    matchedDocumentName: matchMAF?.name,
  })

  // 15. Undertaking on indigenousness of components
  const matchIndig = findMatch(['indigenous', 'dcr', 'undertaking', 'bidannexures'])
  dynamicItems.push({
    id: 'chk-15',
    docName: '15. Undertaking on indigenousness of components',
    requirement: 'Mandatory',
    applicableDetails: 'Self-declaration on letterhead that off-grid inverter, charge controller & BOS are made in India.',
    clauseOrPageRef: 'Section 02, Clause 12',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-15'] ?? !!matchIndig,
    matchedFieldKey: matchIndig?.fieldKey || 'bidAnnexures',
    matchedDocumentName: matchIndig?.name,
  })

  // 16. Undertaking for remaining test reports / sample fee receipt
  const matchSampleUndertaking = findMatch(['sample_fee', 'sample', 'test_undertaking', 'testreport'])
  dynamicItems.push({
    id: 'chk-16',
    docName: '16. Undertaking for the remaining test reports (for which acknowledgements have been submitted) submission within 90 days from the date of agreement if applicable. 1. Acknowledge of sample fee receipt if applicable 2.Written consent for the use of test report from manufacturer',
    requirement: 'Conditional (if testing in progress)',
    applicableDetails: 'Sample fee receipt acknowledgment from MNRE/NABL test center & undertaking to submit within 90 days.',
    clauseOrPageRef: 'Section 01, Clause 1(A), Page 8',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: false,
    checked: previousCheckedMap['chk-16'] ?? !!matchSampleUndertaking,
    matchedFieldKey: matchSampleUndertaking?.fieldKey || 'testReport',
    matchedDocumentName: matchSampleUndertaking?.name,
  })

  // 17. Schedule – I Part-A
  const matchSch1 = findMatch(['schedule_i', 'sch1', 'general_info', 'bidannexures'])
  dynamicItems.push({
    id: 'chk-17',
    docName: '17. Schedule – I Part-A',
    requirement: 'Mandatory (General Information Form)',
    applicableDetails: 'Duly filled Schedule-I Part-A containing bidder profile, factory particulars, and SSI registration details.',
    clauseOrPageRef: 'Page 31 (Schedule - I Part A)',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-17'] ?? !!matchSch1,
    matchedFieldKey: matchSch1?.fieldKey || 'bidAnnexures',
    matchedDocumentName: matchSch1?.name,
  })

  // 18. Schedule – II Part-B
  const matchSch2 = findMatch(['schedule_ii', 'sch2', 'commercial_info', 'bidannexures'])
  dynamicItems.push({
    id: 'chk-18',
    docName: '18. Schedule – II Part-B',
    requirement: 'Mandatory (Commercial Information Form)',
    applicableDetails: 'Duly filled Schedule-II Part-B confirming EMD details, validity, payment terms, and penalty clause acceptance.',
    clauseOrPageRef: 'Page 32 (Schedule - II Part B)',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-18'] ?? !!matchSch2,
    matchedFieldKey: matchSch2?.fieldKey || 'bidAnnexures',
    matchedDocumentName: matchSch2?.name,
  })

  // 19. Schedule – III Part-C
  const matchSch3 = findMatch(['schedule_iii', 'sch3', 'technical_info', 'bidannexures'])
  dynamicItems.push({
    id: 'chk-19',
    docName: '19. Schedule – III Part-C',
    requirement: 'Mandatory (Technical Information Form)',
    applicableDetails: 'Duly filled Schedule-III Part-C technical parameters, manufacturing process, and in-house testing facility details.',
    clauseOrPageRef: 'Page 33 (Schedule - III Part C)',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-19'] ?? !!matchSch3,
    matchedFieldKey: matchSch3?.fieldKey || 'bidAnnexures',
    matchedDocumentName: matchSch3?.name,
  })

  // 20. Technical Data Sheet for each category of inverter/PCU
  const matchDatasheet = findMatch(['datasheet', 'technical_data', 'productsample', 'sample'])
  dynamicItems.push({
    id: 'chk-20',
    docName: '20. Technical Data Sheet for each category of inverter/PCU showing full technical details',
    requirement: 'Mandatory (All Offered Capacities 0.5 to 100 KVA)',
    applicableDetails: 'Complete technical datasheet covering nominal voltage, MPPT range, surge rating, efficiency, and THD.',
    clauseOrPageRef: 'Section 03 & Section 04 Page 25',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-20'] ?? !!matchDatasheet,
    matchedFieldKey: matchDatasheet?.fieldKey || 'productSample',
    matchedDocumentName: matchDatasheet?.name,
  })

  // 21. Details of Service centres in Chhattisgarh
  const matchService = findMatch(['service_centre', 'service', 'otherportal', 'support'])
  dynamicItems.push({
    id: 'chk-21',
    docName: '21. Details of Service centres in Chhattisgarh',
    requirement: 'Mandatory (Raipur Authorized Service Center)',
    applicableDetails: 'Proof of authorized service station at Raipur with spares stock and dedicated technical manpower.',
    clauseOrPageRef: 'Section 01, Clause 1(H) & Page 16',
    envelope: 'Envelope B: Technical and Financial Qualification',
    isMandatory: true,
    checked: previousCheckedMap['chk-21'] ?? !!matchService,
    matchedFieldKey: matchService?.fieldKey || 'otherPortal',
    matchedDocumentName: matchService?.name,
  })

  return dynamicItems
}

function emdDetailText(tender: Tender, emdFallback: string): string {
  if (tender.emdReady?.utrNumber) {
    return `UTR: ${tender.emdReady.utrNumber} (${tender.emdReady.amount || emdFallback})`
  }
  return emdFallback
}

/**
 * Checks whether the current checklist is using an outdated or incomplete list (< 21 items),
 * meaning it should be upgraded automatically when opening the modal or on refresh.
 */
export function isOldFallbackChecklist(items?: PortalChecklistItem[]): boolean {
  if (!items || items.length === 0) return true
  if (items.length < 21) {
    return true
  }
  return false
}

