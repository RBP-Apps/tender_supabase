import { calculateTenderFeePlusGst } from '../lib/fee-calculation.ts'
import assert from 'assert'

console.log('Testing calculateTenderFeePlusGst...')

// Case 1: Standard 18% calculation
const res1 = calculateTenderFeePlusGst('10,000', '18% GST applicable')
console.log('Case 1:', res1)
assert.strictEqual(res1, '₹ 11,800 (Base: ₹ 10,000 + 18% GST: ₹ 1,800)')

// Case 2: Stated inclusive
const res2 = calculateTenderFeePlusGst('10,000', 'Tender fee is inclusive of GST')
console.log('Case 2:', res2)
assert.strictEqual(res2, '₹ 10,000 (Inclusive of GST)')

// Case 3: GST Exempt / Nil
const res3 = calculateTenderFeePlusGst('5,000', 'GST is exempt for this bid')
console.log('Case 3:', res3)
assert.strictEqual(res3, '₹ 5,000 (GST Exempt / Nil)')

// Case 4: Nil Fee
const res4 = calculateTenderFeePlusGst('Nil', '18% GST')
console.log('Case 4:', res4)
assert.strictEqual(res4, 'Nil (Exempt)')

// Case 5: No GST rate specified in document (Must NOT assume 18%)
const res5 = calculateTenderFeePlusGst('10,000', '')
console.log('Case 5:', res5)
assert.strictEqual(res5, '₹ 10,000 (GST rate not specified in tender)')

// Case 6: Explicit GST amount mentioned
const res6 = calculateTenderFeePlusGst('25,000', 'Base fee ₹ 25,000 + GST ₹ 4,500 extra')
console.log('Case 6:', res6)
assert.strictEqual(res6, '₹ 29,500 (Base: ₹ 25,000 + GST: ₹ 4,500)')

// Case 7: Multiple GST rates with fee-specific rate (18% on fee, 12% on works)
const res7 = calculateTenderFeePlusGst('10,000', 'Tender fee has 18% GST. Works contract has 12% GST.')
console.log('Case 7:', res7)
assert.strictEqual(res7, '₹ 11,800 (Base: ₹ 10,000 + 18% GST: ₹ 1,800)')

console.log('All fee calculation tests passed successfully!')
