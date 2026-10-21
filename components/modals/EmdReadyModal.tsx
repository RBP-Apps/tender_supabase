'use client'

import React, { useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Building,
  Calendar,
  Check,
  CheckCircle2,
  FileText,
  Hash,
  IndianRupee,
  Info,
  Landmark,
  Save,
  Sparkles,
  X,
} from 'lucide-react'
import { BankAccountDetails, EmdReadyData, EmdReadyHistoryEntry, Tender } from '@/types/tender'
import { autoFetchEmdDetails } from '@/lib/emd-ready-autofetch'
import { useTenders } from '@/context/TenderContext'

interface EmdReadyModalProps {
  tender: Tender
  mode: 'action' | 'view'
  onClose: () => void
  onComplete?: (updatedTender: Tender) => void
}

export function EmdReadyModal({
  tender,
  mode,
  onClose,
  onComplete,
}: EmdReadyModalProps) {
  const isViewOnly = mode === 'view'
  const { selfAccounts, saveSelfAccount, notify } = useTenders()

  // 1 & 2: Dynamic Auto-Fetch from Tender & Corrigendum (NO HARDCODING)
  const autoFetched = autoFetchEmdDetails(tender)

  // 3: Self Account Details (From User Configuration - NO HARDCODING)
  const initialSelfAccount: BankAccountDetails =
    tender.emdReady?.selfAccount ||
    (selfAccounts.length > 0
      ? selfAccounts[0]
      : {
          bankName: '',
          accountHolder: '',
          accountNo: '',
          ifsc: '',
          branch: '',
        })

  const [amount, setAmount] = useState(autoFetched.amount)
  const [deptAccount, setDeptAccount] = useState<BankAccountDetails>(autoFetched.departmentAccount)
  const [selfAccount, setSelfAccount] = useState<BankAccountDetails>(initialSelfAccount)
  const [selectedSelfIndex, setSelectedSelfIndex] = useState<number>(selfAccounts.length > 0 ? 0 : -1)
  const [saveSelfConfig, setSaveSelfConfig] = useState(false)
  const [utrNumber, setUtrNumber] = useState(tender.emdReady?.utrNumber || '')
  const [date, setDate] = useState(tender.emdReady?.date || new Date().toISOString().slice(0, 10))
  const [remarks, setRemarks] = useState(tender.emdReady?.remarks || '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSelectConfiguredSelf = (idx: number) => {
    setSelectedSelfIndex(idx)
    if (selfAccounts[idx]) {
      setSelfAccount({ ...selfAccounts[idx] })
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return // Prevent duplicate submission
    setError(null)

    if (!amount.trim()) {
      setError('Please provide the confirmed EMD Amount.')
      return
    }

    if (!deptAccount.accountNo.trim() || !deptAccount.ifsc.trim() || !deptAccount.bankName.trim()) {
      setError('Please provide Department Bank Name, Account Number, and IFSC code.')
      return
    }

    if (!selfAccount.accountNo.trim() || !selfAccount.ifsc.trim() || !selfAccount.bankName.trim()) {
      setError('Please provide Self Account Bank Name, Account Number, and IFSC code.')
      return
    }

    if (!utrNumber.trim()) {
      setError('Please enter the manual UTR Number / Transaction Reference.')
      return
    }

    if (!date.trim()) {
      setError('Please specify the payment / transaction date.')
      return
    }

    setSubmitting(true)

    // Optionally save self account to company configuration if requested
    if (saveSelfConfig && selfAccount.accountNo.trim()) {
      saveSelfAccount(selfAccount)
    }

    const nowIso = new Date().toISOString()
    const historyEntry: EmdReadyHistoryEntry = {
      id: `emd-hist-${Date.now()}`,
      submittedAt: nowIso,
      submittedBy: 'Bid Manager',
      amount: amount.trim(),
      amountSource: autoFetched.amountSource,
      departmentAccount: { ...deptAccount },
      selfAccount: { ...selfAccount },
      utrNumber: utrNumber.trim(),
      date: date.trim(),
      remarks: remarks.trim(),
    }

    const existingHistory = tender.emdReady?.history || []

    const emdData: EmdReadyData = {
      amount: amount.trim(),
      amountSource: autoFetched.amountSource,
      departmentAccount: { ...deptAccount },
      selfAccount: { ...selfAccount },
      utrNumber: utrNumber.trim(),
      date: date.trim(),
      remarks: remarks.trim(),
      completedAt: nowIso,
      completedBy: 'Bid Manager',
      history: [historyEntry, ...existingHistory],
    }

    const updatedTender: Tender = {
      ...tender,
      stage: 'Document Ready',
      status: 'In Progress',
      remarks: remarks.trim() || tender.remarks,
      emdReady: emdData,
    }

    if (onComplete) {
      onComplete(updatedTender)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide" style={{ maxWidth: '800px', maxHeight: '92vh', overflowY: 'auto' }}>
        {/* Modal Head */}
        <div className="modal-head sticky top-0 bg-white z-20 pb-3 border-b border-slate-100">
          <div>
            <p className="eyebrow">WORKFLOW STAGE 03 • EMD DEPOSIT VERIFICATION</p>
            <h2>{isViewOnly ? 'EMD Payment & Bank Account Details' : 'Verify & Submit EMD Details'}</h2>
          </div>
          <button type="button" onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tender Record Pill */}
        <div className="modal-record-pill border-b border-slate-100 pb-3 mb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <strong className="text-slate-900 text-sm">{tender.title}</strong>
              <span className="badge badge-slate text-[10px]">{tender.id}</span>
              {tender.bid?.rfsNo && (
                <span className="text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  RfS: {tender.bid.rfsNo}
                </span>
              )}
              {tender.corrigenda && tender.corrigenda.length > 0 && (
                <span className="text-[11px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  {tender.corrigenda.length} Corrigendum Applied
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Authority: <span className="text-slate-700 font-medium">{tender.authority}</span>
              {tender.value ? ` • Estimated Value: ${tender.value}` : ''}
              {tender.bid?.tenderFeePerPackage ? ` • Fee: ₹ ${tender.bid.tenderFeePerPackage}` : ''}
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 1. AMOUNT (AI / Document Extracted with Source Citation) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-blue-600" />
                1. EMD Amount <span className="text-red-500">*</span>
              </label>

              {autoFetched.amountStatus === 'auto-fetched' ? (
                <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/90 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-blue-600" /> AI Auto-Fetched
                </span>
              ) : autoFetched.amountStatus === 'previously-saved' ? (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" /> Previously Saved
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" /> Not Found / Needs Review
                </span>
              )}
            </div>

            {/* Source Reference Banner */}
            <div className="p-2 mb-2.5 rounded-lg bg-white border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-700">Source: </span>
                <span>{autoFetched.amountSource}</span>
                {autoFetched.pageClauseRef && (
                  <span className="text-slate-500 ml-1">({autoFetched.pageClauseRef})</span>
                )}
              </div>
              {autoFetched.amountStatus === 'not-found' && (
                <span className="text-amber-700 font-medium text-[10px]">Manual Input Required</span>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                disabled={isViewOnly}
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Enter EMD Amount (e.g. ₹ 2,50,000 or ₹ 5.0 Lakh)"
                className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
              />
            </div>
          </div>

          {/* 2. DEPARTMENT ACCOUNTS DETAILS (AI Extracted from Beneficiary Bank) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-indigo-600" />
                2. Department Accounts Details (Beneficiary) <span className="text-red-500">*</span>
              </label>

              {autoFetched.deptStatus === 'auto-fetched' ? (
                <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100/90 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-600" /> Auto-Fetched from Tender
                </span>
              ) : autoFetched.deptStatus === 'previously-saved' ? (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" /> Previously Saved
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" /> Not Found in Documents
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-500 mb-2.5">
              Official tender issuing department account where the Earnest Money Deposit must be deposited:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-3.5 rounded-lg border border-slate-200">
              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Beneficiary Name / Account Holder
                </label>
                <input
                  type="text"
                  disabled={isViewOnly}
                  value={deptAccount.accountHolder || ''}
                  onChange={e => setDeptAccount({ ...deptAccount, accountHolder: e.target.value })}
                  placeholder="e.g. Executive Engineer, Public Works / DISCOM"
                  className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Bank Name</label>
                <input
                  type="text"
                  disabled={isViewOnly}
                  value={deptAccount.bankName}
                  onChange={e => setDeptAccount({ ...deptAccount, bankName: e.target.value })}
                  placeholder="e.g. State Bank of India"
                  className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Account Number</label>
                <input
                  type="text"
                  disabled={isViewOnly}
                  value={deptAccount.accountNo}
                  onChange={e => setDeptAccount({ ...deptAccount, accountNo: e.target.value })}
                  placeholder="e.g. 123456789012"
                  className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">IFSC Code</label>
                <input
                  type="text"
                  disabled={isViewOnly}
                  value={deptAccount.ifsc}
                  onChange={e => setDeptAccount({ ...deptAccount, ifsc: e.target.value.toUpperCase() })}
                  placeholder="e.g. SBIN0001234"
                  className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 font-mono uppercase focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Branch Name</label>
                <input
                  type="text"
                  disabled={isViewOnly}
                  value={deptAccount.branch || ''}
                  onChange={e => setDeptAccount({ ...deptAccount, branch: e.target.value })}
                  placeholder="e.g. Main Branch"
                  className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>

          {/* 3. SELF ACCOUNT DETAILS (Manual / Saved Configuration ONLY - NOT AI Extracted) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-emerald-600" />
                3. Self Account Details (Corporate Bidder Account) <span className="text-red-500">*</span>
              </label>
              <span className="text-[10px] font-semibold text-slate-600 bg-slate-200/80 px-2.5 py-0.5 rounded-full">
                Configuration / Manual Only (Not AI Extracted)
              </span>
            </div>

            <p className="text-[11px] text-slate-500 mb-2.5">
              Select an account from existing company configuration or enter your corporate bank details:
            </p>

            {/* Configured Accounts Selector if any exist in context */}
            {selfAccounts.length > 0 && !isViewOnly && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selfAccounts.map((account, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectConfiguredSelf(idx)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-all ${
                      selectedSelfIndex === idx
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Check className={`w-3 h-3 ${selectedSelfIndex === idx ? 'text-emerald-600' : 'opacity-0'}`} />
                    {account.bankName} (..{account.accountNo.slice(-4)})
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-3.5 rounded-lg border border-slate-200">
              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Account Holder Name</label>
                <input
                  type="text"
                  disabled={isViewOnly}
                  value={selfAccount.accountHolder || ''}
                  onChange={e => {
                    setSelectedSelfIndex(-1)
                    setSelfAccount({ ...selfAccount, accountHolder: e.target.value })
                  }}
                  placeholder="e.g. Company Name"
                  className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Our Bank Name</label>
                <input
                  type="text"
                  disabled={isViewOnly}
                  value={selfAccount.bankName}
                  onChange={e => {
                    setSelectedSelfIndex(-1)
                    setSelfAccount({ ...selfAccount, bankName: e.target.value })
                  }}
                  placeholder="e.g. State Bank of India"
                  className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Our Account Number</label>
                <input
                  type="text"
                  disabled={isViewOnly}
                  value={selfAccount.accountNo}
                  onChange={e => {
                    setSelectedSelfIndex(-1)
                    setSelfAccount({ ...selfAccount, accountNo: e.target.value })
                  }}
                  placeholder="e.g. 1234567890"
                  className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">IFSC Code</label>
                <input
                  type="text"
                  disabled={isViewOnly}
                  value={selfAccount.ifsc}
                  onChange={e => {
                    setSelectedSelfIndex(-1)
                    setSelfAccount({ ...selfAccount, ifsc: e.target.value.toUpperCase() })
                  }}
                  placeholder="e.g. SBIN0001234"
                  className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 font-mono uppercase focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Branch</label>
                <input
                  type="text"
                  disabled={isViewOnly}
                  value={selfAccount.branch || ''}
                  onChange={e => {
                    setSelectedSelfIndex(-1)
                    setSelfAccount({ ...selfAccount, branch: e.target.value })
                  }}
                  placeholder="e.g. Industrial Area Branch"
                  className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>
            </div>

            {!isViewOnly && (
              <label className="flex items-center gap-2 mt-2.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveSelfConfig}
                  onChange={e => setSaveSelfConfig(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Save this bank account to Company Configuration for future tenders</span>
              </label>
            )}
          </div>

          {/* 4. UTR ID & 5. DATE (Strictly Manual) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                <Hash className="w-3.5 h-3.5 text-purple-600" />
                4. UTR ID / Reference <span className="text-red-500">*</span>
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Manually entered RTGS / NEFT / Bank transaction reference.
              </p>
              <input
                type="text"
                disabled={isViewOnly}
                required
                value={utrNumber}
                onChange={e => setUtrNumber(e.target.value)}
                placeholder="e.g. UTR12984029482"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:border-blue-500 disabled:bg-slate-100 uppercase"
              />
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                <Calendar className="w-3.5 h-3.5 text-amber-600" />
                5. Payment Date <span className="text-red-500">*</span>
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Date when the payment transfer was executed.
              </p>
              <input
                type="date"
                disabled={isViewOnly}
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
              />
            </div>
          </div>

          {/* 6. REMARK (Strictly Manual) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70">
            <label className="text-xs font-bold text-slate-900 block mb-1">
              6. Remark (Manual Notes / Approval Reference)
            </label>
            <p className="text-[11px] text-slate-500 mb-2">
              Any special remarks, exemptions, approval references, or notes for the audit trail.
            </p>
            <textarea
              rows={3}
              disabled={isViewOnly}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Enter manual remarks..."
              className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
            />
          </div>

          {/* Modal Actions */}
          <div className="modal-actions pt-2 flex items-center justify-between border-t border-slate-100">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={submitting}
            >
              {isViewOnly ? 'Close' : 'Cancel'}
            </button>

            {!isViewOnly && (
              <button
                type="submit"
                disabled={submitting}
                className="primary-button flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Saving...' : 'Submit & Advance to Document Ready'}</span>
                <ArrowRight className="w-4 h-4 ml-0.5" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
