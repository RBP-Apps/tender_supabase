/**
 * Helper to calculate and format "Tender Fee + GST" based on user inputs or extracted text.
 *
 * Rules:
 * - Total Tender Fee = Tender Fee + Applicable GST Amount.
 * - If GST is explicitly specified as applicable to the tender fee, calculate it using the specified rate.
 * - If the tender document specifies an inclusive amount, use that amount without adding GST again.
 * - Do not assume a GST rate when the tender document does not specify it.
 * - Clearly distinguish between the base tender fee, GST amount, and total amount.
 */

export interface FeeCalculationResult {
  baseFee: number | null
  baseFeeFormatted: string
  gstRate: number | null
  gstAmount: number | null
  gstAmountFormatted: string
  totalFee: number | null
  totalFeeFormatted: string
  isInclusive: boolean
  isExempt: boolean
  displayString: string
}

export function parseAmount(val: string | null | undefined): number | null {
  if (!val) return null
  // Strip out currency symbols, commas, trailing "/-", spaces
  const cleaned = val.replace(/,/g, '').replace(/[^\d.]/g, ' ').trim()
  const match = cleaned.match(/\d+(?:\.\d+)?/)
  if (!match) return null
  const num = parseFloat(match[0])
  return isNaN(num) ? null : num
}

export function formatInr(val: number): string {
  return val.toLocaleString('en-IN')
}

export function calculateTenderFeePlusGst(
  tenderFee: string | null | undefined,
  gstSection: string | null | undefined
): string {
  const feeStr = (tenderFee || '').trim()
  if (!feeStr) return ''

  const feeLower = feeStr.toLowerCase()
  if (feeLower === 'nil' || feeLower === 'free' || feeLower === 'exempt' || feeLower === '0' || feeLower === '₹ 0') {
    return 'Nil (Exempt)'
  }

  const baseNum = parseAmount(feeStr)
  if (baseNum === null || baseNum <= 0) {
    return feeStr
  }

  const baseFormatted = `₹ ${formatInr(baseNum)}`
  const gstLower = (gstSection || '').toLowerCase().trim()

  if (!gstLower) {
    return `${baseFormatted} (GST rate not specified in tender)`
  }

  // 1. Check if exempt or Nil
  if (
    gstLower.includes('exempt') ||
    gstLower.includes('nil gst') ||
    gstLower.includes('gst nil') ||
    gstLower.includes('zero gst') ||
    gstLower.includes('0%')
  ) {
    return `${baseFormatted} (GST Exempt / Nil)`
  }

  // 2. Check if explicitly stated inclusive
  if (
    gstLower.includes('inclusive') ||
    gstLower.includes('including gst') ||
    gstLower.includes('incl. gst') ||
    gstLower.includes('incl gst') ||
    feeLower.includes('inclusive') ||
    feeLower.includes('incl. gst')
  ) {
    return `${baseFormatted} (Inclusive of GST)`
  }

  // 3. Check for percentage rate (e.g. 18%, 18 %, 12%, 5%, 28%)
  // Prefer rate specifically tied to fee if specified, e.g. "18% on fee" or "18% GST"
  const feeRateMatch = gstLower.match(/(?:tender\s*fee|fee)[^.\n]*?(\d+(?:\.\d+)?)\s*%/i)
  const generalRateMatch = gstLower.match(/(\d+(?:\.\d+)?)\s*%/)
  const rateMatch = feeRateMatch || generalRateMatch

  if (rateMatch) {
    const rate = parseFloat(rateMatch[1])
    if (!isNaN(rate) && rate > 0) {
      const gstAmt = Math.round((baseNum * rate) / 100)
      const total = baseNum + gstAmt
      return `₹ ${formatInr(total)} (Base: ${baseFormatted} + ${rate}% GST: ₹ ${formatInr(gstAmt)})`
    }
  }

  // 4. Check for explicit GST rupee amount mentioned (e.g. "GST: ₹ 1,800" or "GST of 1800")
  const explicitGstAmountMatch = gstLower.match(/gst[^0-9]*?(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.\d+)?)/i)
  if (explicitGstAmountMatch) {
    const parsedGst = parseAmount(explicitGstAmountMatch[1])
    if (parsedGst !== null && parsedGst > 0 && parsedGst < baseNum * 2) {
      const total = baseNum + parsedGst
      return `₹ ${formatInr(total)} (Base: ${baseFormatted} + GST: ₹ ${formatInr(parsedGst)})`
    }
  }

  // 5. If GST condition exists but no rate or amount is specified, do NOT assume a rate
  return `${baseFormatted} (GST rate not specified in document)`
}
