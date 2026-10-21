// Pure JS test to verify the fee calculation rules
function parseAmount(val) {
  if (!val) return null
  const cleaned = val.replace(/,/g, '').replace(/[^\d.]/g, ' ').trim()
  const match = cleaned.match(/\d+(?:\.\d+)?/)
  if (!match) return null
  const num = parseFloat(match[0])
  return isNaN(num) ? null : num
}

function formatInr(val) {
  return val.toLocaleString('en-IN')
}

function calculateTenderFeePlusGst(tenderFee, gstSection) {
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

  // 4. Check for explicit GST rupee amount mentioned
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

const assert = require('assert')

console.log('Testing calculateTenderFeePlusGst...')

const res1 = calculateTenderFeePlusGst('10,000', '18% GST applicable')
console.log('Case 1 (18% GST):', res1)
assert.strictEqual(res1, '₹ 11,800 (Base: ₹ 10,000 + 18% GST: ₹ 1,800)')

const res2 = calculateTenderFeePlusGst('10,000', 'Tender fee is inclusive of GST')
console.log('Case 2 (Inclusive):', res2)
assert.strictEqual(res2, '₹ 10,000 (Inclusive of GST)')

const res3 = calculateTenderFeePlusGst('5,000', 'GST is exempt for this bid')
console.log('Case 3 (Exempt):', res3)
assert.strictEqual(res3, '₹ 5,000 (GST Exempt / Nil)')

const res4 = calculateTenderFeePlusGst('Nil', '18% GST')
console.log('Case 4 (Nil):', res4)
assert.strictEqual(res4, 'Nil (Exempt)')

const res5 = calculateTenderFeePlusGst('10,000', '')
console.log('Case 5 (Not specified):', res5)
assert.strictEqual(res5, '₹ 10,000 (GST rate not specified in tender)')

const res6 = calculateTenderFeePlusGst('25,000', 'Base fee ₹ 25,000 + GST ₹ 4,500 extra')
console.log('Case 6 (Explicit amount):', res6)
assert.strictEqual(res6, '₹ 29,500 (Base: ₹ 25,000 + GST: ₹ 4,500)')

const res7 = calculateTenderFeePlusGst('10,000', 'Tender fee has 18% GST. Works contract has 12% GST.')
console.log('Case 7 (Multiple rates):', res7)
assert.strictEqual(res7, '₹ 11,800 (Base: ₹ 10,000 + 18% GST: ₹ 1,800)')

console.log('All 7 fee calculation test cases passed successfully!')
