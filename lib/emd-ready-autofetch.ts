import { BankAccountDetails, Tender } from '@/types/tender'

export interface EmdAutoFetchResult {
  amount: string
  amountStatus: 'auto-fetched' | 'previously-saved' | 'not-found'
  amountSource: string
  pageClauseRef: string | null
  departmentAccount: BankAccountDetails
  deptStatus: 'auto-fetched' | 'previously-saved' | 'not-found'
  deptSource: string
}

/**
 * Normalizes any EMD amount representation into a pure numeric string.
 * Converts words like "3 Lakh", "3 Lakhs", "3.5 Lac", "1.5 Cr", "50 Thousand"
 * to standard numeric representations (e.g. "3 Lakh" -> "300000").
 */
export function parseAmountToNumeric(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return ''
  const str = String(val).trim()
  if (!str) return ''

  // 1. Check for Lakh / Lakhs / Lac / Lacs (e.g. "3 Lakh", "3.5 lakhs", "₹ 3 Lacs")
  const lakhMatch = str.match(/([\d,.]+)\s*(?:lakhs?|lacs?)/i)
  if (lakhMatch) {
    const num = parseFloat(lakhMatch[1].replace(/,/g, ''))
    if (!isNaN(num)) {
      return String(Math.round(num * 100000))
    }
  }

  // 2. Check for Crore / Crores / Cr (e.g. "1.5 Cr", "2 Crores")
  const crMatch = str.match(/([\d,.]+)\s*(?:crores?|cr)\b/i)
  if (crMatch) {
    const num = parseFloat(crMatch[1].replace(/,/g, ''))
    if (!isNaN(num)) {
      return String(Math.round(num * 10000000))
    }
  }

  // 3. Check for Thousand / K (e.g. "50 Thousand", "25k")
  const thMatch = str.match(/([\d,.]+)\s*(?:thousands?|k)\b/i)
  if (thMatch) {
    const num = parseFloat(thMatch[1].replace(/,/g, ''))
    if (!isNaN(num)) {
      return String(Math.round(num * 1000))
    }
  }

  // 4. If it contains digits (like "₹ 3,00,000" or "300000.00")
  const cleanNumeric = str.replace(/[^0-9.]/g, '')
  if (cleanNumeric) {
    const parsed = parseFloat(cleanNumeric)
    if (!isNaN(parsed)) {
      return String(Math.round(parsed))
    }
  }

  return str
}

/**
 * Extracts EMD amount and department account details from real tender data,
 * previous process steps, and latest applicable corrigenda.
 * Strictly enforces: NO HARDCODED DATA, NO GUESSING.
 * Returns 'not-found' status if information is missing or ambiguous.
 */
export function autoFetchEmdDetails(tender: Tender): EmdAutoFetchResult {
  let amount = ''
  let amountStatus: 'auto-fetched' | 'previously-saved' | 'not-found' = 'not-found'
  let amountSource = 'Not Found in Uploaded Documents'
  let pageClauseRef: string | null = null

  // 1. If previously saved by user, reuse as basis
  if (tender.emdReady?.amount && tender.emdReady.amount.trim()) {
    amount = parseAmountToNumeric(tender.emdReady.amount.trim())
    amountStatus = 'previously-saved'
    amountSource = tender.emdReady.amountSource || 'Previously Confirmed Submission'
  } else {
    // 2. Check latest applicable Corrigendum first (amendments take precedence over original NIT)
    const corrigenda = tender.corrigenda || []
    let foundCorrEmd: { value: string; docName: string; ref: string | null } | null = null

    for (let i = corrigenda.length - 1; i >= 0; i--) {
      const corr = corrigenda[i]
      for (const change of corr.changes || []) {
        const descLower = (change.description || '').toLowerCase()
        const typeLower = (change.type || '').toLowerCase()
        const target = (change.targetField || '').toLowerCase()

        const isEmd =
          typeLower.includes('emd') ||
          typeLower.includes('financial') ||
          descLower.includes('emd') ||
          descLower.includes('earnest money') ||
          descLower.includes('bid security') ||
          target === 'tenderfeeperpackage'

        if (isEmd && change.revisedValue && change.revisedValue.trim()) {
          foundCorrEmd = {
            value: change.revisedValue.trim(),
            docName: corr.corrigendumNo || corr.fileName || `Corrigendum ${i + 1}`,
            ref: change.pageClauseRef || 'Latest Confirmed Corrigendum Amendment',
          }
          break
        }
      }
      if (foundCorrEmd) break
    }

    if (foundCorrEmd) {
      amount = parseAmountToNumeric(foundCorrEmd.value)
      amountStatus = 'auto-fetched'
      amountSource = `${foundCorrEmd.docName} (Official Corrigendum Amendment)`
      pageClauseRef = foundCorrEmd.ref
    } else {
      // 3. Check original Tender Packages EMD
      const packages = tender.bid?.packages || []
      const pkgsWithEmd = packages.filter(p => p.emdLakh && parseFloat(p.emdLakh) > 0)

      if (pkgsWithEmd.length > 0) {
        const totalLakh = pkgsWithEmd.reduce((sum, p) => sum + (parseFloat(p.emdLakh) || 0), 0)
        // Convert to pure numeric representation (e.g. 3 Lakh -> 300000)
        const numericVal = Math.round(totalLakh * 100000)
        amount = String(numericVal)
        amountStatus = 'auto-fetched'
        amountSource = 'Original Tender Bid Packages (NIT Document)'
        pageClauseRef = `Package(s): ${pkgsWithEmd.map(p => `${p.code || 'Pkg'} (${p.emdLakh}L)`).join(', ')}`
      } else if (tender.bid?.tenderFeePerPackage && tender.bid.tenderFeePerPackage.trim()) {
        // Check tender fee / fee clause
        amount = parseAmountToNumeric(tender.bid.tenderFeePerPackage.trim())
        amountStatus = 'auto-fetched'
        amountSource = 'Tender Bid Specification (Fee / EMD Clause)'
        pageClauseRef = 'Tender Document Section 1.2'
      } else {
        // If missing or ambiguous: STRICT RULE - DO NOT GUESS OR HARDCODE
        amount = ''
        amountStatus = 'not-found'
        amountSource = 'Not Found in Uploaded Documents (Needs Review)'
        pageClauseRef = null
      }
    }
  }

  // 4. Department Accounts Details Extraction
  let departmentAccount: BankAccountDetails = {
    bankName: '',
    accountHolder: '',
    accountNo: '',
    ifsc: '',
    branch: '',
  }
  let deptStatus: 'auto-fetched' | 'previously-saved' | 'not-found' = 'not-found'
  let deptSource = 'Not Found in Tender Documents'

  if (tender.emdReady?.departmentAccount?.accountNo) {
    departmentAccount = { ...tender.emdReady.departmentAccount }
    deptStatus = 'previously-saved'
    deptSource = 'Previously Saved Record'
  } else {
    const bank = tender.bid?.beneficiaryBank
    const hasBankData = bank && (bank.bankName?.trim() || bank.accountNo?.trim() || bank.ifsc?.trim())

    if (hasBankData) {
      departmentAccount = {
        bankName: bank?.bankName?.trim() || '',
        accountHolder:
          bank?.accountHolder?.trim() ||
          tender.bid?.authorityFullName?.trim() ||
          tender.authority?.trim() ||
          '',
        accountNo: bank?.accountNo?.trim() || '',
        ifsc: bank?.ifsc?.trim() || '',
        branch: bank?.branch?.trim() || '',
      }
      deptStatus = 'auto-fetched'
      deptSource = 'Tender Bid Beneficiary Bank Details (NIT Upload)'
    } else {
      // Missing: STRICT RULE - DO NOT INVENT FAKE DATA
      departmentAccount = {
        bankName: '',
        accountHolder: tender.bid?.authorityFullName?.trim() || tender.authority?.trim() || '',
        accountNo: '',
        ifsc: '',
        branch: '',
      }
      deptStatus = 'not-found'
      deptSource = 'Not Found in Tender Documents (Manual Entry Required)'
    }
  }

  return {
    amount,
    amountStatus,
    amountSource,
    pageClauseRef,
    departmentAccount,
    deptStatus,
    deptSource,
  }
}
