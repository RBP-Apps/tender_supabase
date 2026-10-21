'use client'

import React, { useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  FileUp,
  Flame,
  History,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  BeneficiaryBank,
  CorrigendumChangeItem,
  CorrigendumRecord,
  Masters,
  Stage,
  Status,
  Tender,
  TenderBidDetails,
  TenderPackage,
  TechnicalComponent,
} from '@/types/tender'
import { stagesList, useTenders } from '@/context/TenderContext'
import { emptyBid, missingDocFields } from '@/lib/tender-docs'
import { TenderExtraction } from '@/lib/tender-extraction-schema'
import { CorrigendumExtraction } from '@/lib/corrigendum-extraction-schema'
import { calculateTenderFeePlusGst } from '@/lib/fee-calculation'

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

// Prefer the existing master spelling when the extracted value matches one case-insensitively.
const matchMaster = (value: string, list: string[]) =>
  list.find(item => item.toLowerCase() === value.toLowerCase()) ?? value

function applyExtraction(form: Tender, x: TenderExtraction, masters: Masters): { tender: Tender; filled: number } {
  let filled = 0
  const pick = (value: string | null | undefined, current: string = '') => {
    const v = value?.trim()
    if (!v) return current
    filled++
    return v
  }

  const bid: TenderBidDetails = { ...(form.bid ?? emptyBid()) }
  bid.rfsNo = pick(x.rfsNo, bid.rfsNo)
  bid.rfsDate = isDate(x.rfsDate) ? pick(x.rfsDate, bid.rfsDate) : bid.rfsDate
  bid.corrigendum = pick(x.corrigendum, bid.corrigendum)
  bid.workName = pick(x.workName, bid.workName)
  bid.shortWorkName = pick(x.shortWorkName, bid.shortWorkName)
  bid.authorityFullName = pick(x.authorityFullName, bid.authorityFullName)
  bid.addresseeDesignation = pick(x.addresseeDesignation, bid.addresseeDesignation)
  bid.authorityAddress = pick(x.authorityAddress, bid.authorityAddress)
  bid.bidDeadlineTime = pick(x.bidDeadlineTime, bid.bidDeadlineTime)
  bid.tenderFeePerPackage = pick(x.tenderFeePerPackage, bid.tenderFeePerPackage)
  bid.gstSection = pick(x.gstSection, bid.gstSection)
  bid.testReportCompliance = pick(x.testReportCompliance, bid.testReportCompliance)
  bid.mafRequirement = pick(x.mafRequirement, bid.mafRequirement)
  bid.experienceRequirement = pick(x.experienceRequirement, bid.experienceRequirement)
  bid.turnoverRequirement = pick(x.turnoverRequirement, bid.turnoverRequirement)

  if (x.tenderFeePlusGst?.trim()) {
    bid.tenderFeePlusGst = pick(x.tenderFeePlusGst, bid.tenderFeePlusGst)
  } else if (bid.tenderFeePerPackage?.trim()) {
    const calculatedFee = calculateTenderFeePlusGst(bid.tenderFeePerPackage, bid.gstSection || '')
    if (calculatedFee) {
      bid.tenderFeePlusGst = calculatedFee
      filled++
    }
  }
  bid.bidValidityDays = pick(x.bidValidityDays, bid.bidValidityDays)
  bid.financialRequirementCr = pick(x.financialRequirementCr, bid.financialRequirementCr)
  bid.technicalRequirement = pick(x.technicalRequirement, bid.technicalRequirement)
  bid.jurisdiction = pick(x.jurisdiction, bid.jurisdiction)
  if (x.packages?.length) {
    bid.packages = x.packages.map(p => ({ code: p.code, region: p.region, rfx: p.rfx, emdLakh: p.emdLakh }))
    filled++
  }
  if (x.technicalComponents?.length) {
    bid.technicalComponents = x.technicalComponents.map(c => ({ item: c.item, make: c.make, compliance: c.compliance }))
    filled++
  }
  const bank = { ...bid.beneficiaryBank }
  for (const key of Object.keys(bank) as (keyof BeneficiaryBank)[]) {
    bank[key] = pick(x.beneficiaryBank?.[key] ?? null, bank[key])
  }
  bid.beneficiaryBank = bank

  const tender: Tender = {
    ...form,
    title: pick(x.title ?? x.shortWorkName, form.title),
    authority: pick(x.authority, form.authority),
    value: pick(x.estimatedValue, form.value),
    department: x.department?.trim() ? matchMaster(pick(x.department, form.department), masters.departments) : form.department,
    state: x.state?.trim() ? matchMaster(pick(x.state, form.state), masters.states) : form.state,
    due: isDate(x.bidDeadlineDate) ? pick(x.bidDeadlineDate, form.due) : form.due,
    bid,
  }
  return { tender, filled }
}

// Keep a value that is not in the master list selectable (e.g. a state read from a PDF).
const withCurrent = (list: string[], current: string) =>
  current && !list.includes(current) ? [...list, current] : list

interface TenderModalProps {
  mode: 'new' | 'edit' | 'process'
  tender?: Tender
  initial?: Tender
  masters: Masters
  onClose: () => void
  onSave: (tender: Tender) => void
}

export function TenderModal({
  mode,
  tender: tenderProp,
  initial,
  masters,
  onClose,
  onSave,
}: TenderModalProps) {
  const { currentUser } = useTenders()
  const tender = tenderProp || initial
  const currentStageIndex = tender
    ? stagesList.findIndex(s => s.label === tender.stage)
    : 0

  const defaultNextStage =
    currentStageIndex >= 0 && currentStageIndex < stagesList.length - 1
      ? stagesList[currentStageIndex + 1].label
      : tender?.stage || 'Eligibility Check'

  const [form, setForm] = useState<Tender>(
    tender || {
      id: '',
      title: '',
      authority: '',
      department: masters.departments[0] || '',
      state: masters.states[0] || '',
      value: '',
      stage: 'Eligibility Check',
      status: 'In Progress',
      due: new Date().toISOString().slice(0, 10),
      owner: currentUser?.username || '',
      remarks: '',
      bid: emptyBid(),
    }
  )

  const [targetStage, setTargetStage] = useState<Stage>(
    mode === 'process' ? defaultNextStage : form.stage
  )

  const set = (key: keyof Tender, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const showBidDetails = mode !== 'process'
  const bid = form.bid ?? emptyBid()

  const setBid = <K extends keyof TenderBidDetails>(key: K, value: TenderBidDetails[K]) =>
    setForm(prev => ({ ...prev, bid: { ...(prev.bid ?? emptyBid()), [key]: value } }))

  const handleTenderFeeChange = (val: string) => {
    setBid('tenderFeePerPackage', val)
    const calc = calculateTenderFeePlusGst(val, bid.gstSection || '')
    if (calc) {
      setBid('tenderFeePlusGst', calc)
    }
  }

  const handleGstSectionChange = (val: string) => {
    setBid('gstSection', val)
    if (bid.tenderFeePerPackage?.trim()) {
      const calc = calculateTenderFeePlusGst(bid.tenderFeePerPackage, val)
      if (calc) {
        setBid('tenderFeePlusGst', calc)
      }
    }
  }

  const setBank = (key: keyof BeneficiaryBank, value: string) =>
    setBid('beneficiaryBank', { ...bid.beneficiaryBank, [key]: value })

  const setPackage = (index: number, key: keyof TenderPackage, value: string) =>
    setBid('packages', bid.packages.map((p, i) => (i === index ? { ...p, [key]: value } : p)))

  const addPackage = () =>
    setBid('packages', [...bid.packages, { code: `P-${bid.packages.length + 1}`, region: '', rfx: '', emdLakh: '' }])

  const removePackage = (index: number) =>
    setBid('packages', bid.packages.filter((_, i) => i !== index))

  const setComponent = (index: number, key: keyof TechnicalComponent, value: string) =>
    setBid('technicalComponents', bid.technicalComponents.map((c, i) => (i === index ? { ...c, [key]: value } : c)))

  const addComponent = () =>
    setBid('technicalComponents', [...bid.technicalComponents, { item: '', make: '', compliance: '' }])

  const removeComponent = (index: number) =>
    setBid('technicalComponents', bid.technicalComponents.filter((_, i) => i !== index))

  const [extracting, setExtracting] = useState(false)
  const [extractMessage, setExtractMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Corrigendum Feature State
  const [corrigendumExtracting, setCorrigendumExtracting] = useState(false)
  const [corrigendumMessage, setCorrigendumMessage] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null)
  const [activeCorrigendumId, setActiveCorrigendumId] = useState<string | null>(null)
  const [showCorrigendumReview, setShowCorrigendumReview] = useState(false)
  const [selectedChanges, setSelectedChanges] = useState<Record<string, boolean>>({})
  const [appliedFeedback, setAppliedFeedback] = useState<string | null>(null)

  const corrigenda: CorrigendumRecord[] = form.corrigenda || []
  const activeCorrigendum =
    corrigenda.find(c => c.id === activeCorrigendumId) ||
    (corrigenda.length > 0 ? corrigenda[corrigenda.length - 1] : null)

  const handleCorrigendumUpload = async (file: File | undefined) => {
    if (!file) return
    setCorrigendumExtracting(true)
    setCorrigendumMessage(null)
    setAppliedFeedback(null)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append(
        'currentTender',
        JSON.stringify({
          rfsNo: form.bid?.rfsNo || '',
          rfsDate: form.bid?.rfsDate || '',
          title: form.title || '',
          authority: form.authority || '',
          due: form.due || '',
          bidDeadlineTime: form.bid?.bidDeadlineTime || '',
          value: form.value || '',
          tenderFeePerPackage: form.bid?.tenderFeePerPackage || '',
          financialRequirementCr: form.bid?.financialRequirementCr || '',
          technicalRequirement: form.bid?.technicalRequirement || '',
          corrigendum: form.bid?.corrigendum || '',
          workName: form.bid?.workName || '',
        })
      )
      const res = await fetch('/api/extract-corrigendum', { method: 'POST', body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.data) throw new Error(json.error || 'Could not analyze the Corrigendum PDF.')
      const data = json.data as CorrigendumExtraction

      const newRecordId = `corr-${Date.now()}`
      const changesWithIds: CorrigendumChangeItem[] = (data.changes || []).map((ch, idx) => ({
        id: `ch-${Date.now()}-${idx}`,
        type: ch.type,
        category: ch.isCritical ? 'critical' : 'standard',
        targetField: ch.targetField,
        originalValue: ch.originalValue,
        revisedValue: ch.revisedValue,
        description: ch.description,
        pageClauseRef: ch.pageClauseRef,
        isCritical: ch.isCritical,
        applied: false,
      }))

      const newRecord: CorrigendumRecord = {
        id: newRecordId,
        corrigendumNo: data.corrigendumNo || `Corrigendum-${corrigenda.length + 1}`,
        issueDate: data.issueDate,
        tenderRef: data.tenderRef,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        overview: data.overview || 'Official corrigendum updates processed by AI.',
        changes: changesWithIds,
      }

      // Pre-select mappable changes so user can easily review & apply
      const initialSelection: Record<string, boolean> = {}
      changesWithIds.forEach(c => {
        if (c.targetField && c.targetField !== 'none') {
          initialSelection[c.id] = true
        }
      })
      setSelectedChanges(initialSelection)

      setForm(prev => {
        const existing = prev.corrigenda || []
        return { ...prev, corrigenda: [...existing, newRecord] }
      })

      setActiveCorrigendumId(newRecordId)
      setShowCorrigendumReview(true)

      const currentRfs = (form.bid?.rfsNo || '').trim().toLowerCase()
      const docRef = (data.tenderRef || '').trim().toLowerCase()
      const isMismatch = currentRfs && docRef && !currentRfs.includes(docRef) && !docRef.includes(currentRfs)

      setCorrigendumMessage({
        tone: isMismatch ? 'warn' : 'ok',
        text: isMismatch
          ? `Analyzed “${file.name}”. ⚠️ Note: Corrigendum quotes tender ref "${data.tenderRef}", differing from RfS No "${form.bid?.rfsNo}". Please review carefully.`
          : `Analyzed “${file.name}”: Identified ${changesWithIds.length} update(s) for ${newRecord.corrigendumNo}. Review and apply changes below.`,
      })
    } catch (err) {
      setCorrigendumMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Could not analyze the Corrigendum PDF.',
      })
    } finally {
      setCorrigendumExtracting(false)
    }
  }

  const applySelectedChanges = (corrId: string) => {
    const corr = (form.corrigenda || []).find(c => c.id === corrId)
    if (!corr) return

    let appliedCount = 0
    const appliedNotes: string[] = []

    setForm(prev => {
      const updatedBid = { ...(prev.bid ?? emptyBid()) }
      let updatedDue = prev.due
      let updatedValue = prev.value

      const updatedChanges = corr.changes.map(item => {
        if (!selectedChanges[item.id]) return item

        appliedCount++
        if (item.targetField === 'due' && isDate(item.revisedValue)) {
          updatedDue = item.revisedValue
          appliedNotes.push(`Submission Date -> ${item.revisedValue}`)
        } else if (item.targetField === 'due' && item.revisedValue) {
          const match = item.revisedValue.match(/\d{4}-\d{2}-\d{2}/)
          if (match) {
            updatedDue = match[0]
            appliedNotes.push(`Submission Date -> ${match[0]}`)
          }
        } else if (item.targetField === 'bidDeadlineTime') {
          updatedBid.bidDeadlineTime = item.revisedValue
          appliedNotes.push(`Deadline Time -> ${item.revisedValue}`)
        } else if (item.targetField === 'corrigendumRef') {
          updatedBid.corrigendum = item.revisedValue
          appliedNotes.push(`Corrigendum Ref -> ${item.revisedValue}`)
        } else if (item.targetField === 'value') {
          updatedValue = item.revisedValue
          appliedNotes.push(`Value -> ${item.revisedValue}`)
        } else if (item.targetField === 'tenderFeePerPackage') {
          updatedBid.tenderFeePerPackage = item.revisedValue
          appliedNotes.push(`Tender Fee -> ${item.revisedValue}`)
        } else if (item.targetField === 'gstSection') {
          updatedBid.gstSection = item.revisedValue
          appliedNotes.push(`GST Section updated`)
        } else if (item.targetField === 'tenderFeePlusGst') {
          updatedBid.tenderFeePlusGst = item.revisedValue
          appliedNotes.push(`Tender Fee + GST -> ${item.revisedValue}`)
        } else if (item.targetField === 'testReportCompliance') {
          updatedBid.testReportCompliance = item.revisedValue
          appliedNotes.push(`Test Report Compliance updated`)
        } else if (item.targetField === 'mafRequirement') {
          updatedBid.mafRequirement = item.revisedValue
          appliedNotes.push(`MAF Requirement updated`)
        } else if (item.targetField === 'experienceRequirement') {
          updatedBid.experienceRequirement = item.revisedValue
          appliedNotes.push(`Experience Requirement updated`)
        } else if (item.targetField === 'turnoverRequirement') {
          updatedBid.turnoverRequirement = item.revisedValue
          appliedNotes.push(`Turnover Requirement updated`)
        } else if (item.targetField === 'financialRequirementCr') {
          updatedBid.financialRequirementCr = item.revisedValue
          appliedNotes.push(`Financial Req -> ${item.revisedValue} Cr`)
        } else if (item.targetField === 'technicalRequirement') {
          updatedBid.technicalRequirement = item.revisedValue
          appliedNotes.push(`Technical Req updated`)
        } else if (item.targetField === 'bidValidityDays') {
          updatedBid.bidValidityDays = item.revisedValue
          appliedNotes.push(`Validity Days -> ${item.revisedValue}`)
        } else if (item.targetField === 'workName') {
          updatedBid.workName = item.revisedValue
          appliedNotes.push(`Work Name updated`)
        }

        return { ...item, applied: true }
      })

      // Sync corrigendum label on bid details if not present
      const corrLabel = corr.issueDate ? `${corr.corrigendumNo} dated ${corr.issueDate}` : corr.corrigendumNo
      if (!updatedBid.corrigendum) {
        updatedBid.corrigendum = corrLabel
      } else if (!updatedBid.corrigendum.includes(corr.corrigendumNo)) {
        updatedBid.corrigendum = `${updatedBid.corrigendum}, ${corrLabel}`
      }

      const updatedCorrigenda = (prev.corrigenda || []).map(c =>
        c.id === corrId ? { ...c, changes: updatedChanges } : c
      )

      return {
        ...prev,
        due: updatedDue,
        value: updatedValue,
        bid: updatedBid,
        corrigenda: updatedCorrigenda,
      }
    })

    setAppliedFeedback(
      `Applied ${appliedCount} change(s) from ${corr.corrigendumNo}: ${appliedNotes.slice(0, 3).join(', ')}${appliedNotes.length > 3 ? '...' : ''}. Tender fields below have been updated.`
    )
  }

  const removeCorrigendum = (corrId: string) => {
    setForm(prev => ({
      ...prev,
      corrigenda: (prev.corrigenda || []).filter(c => c.id !== corrId),
    }))
    if (activeCorrigendumId === corrId) {
      setActiveCorrigendumId(null)
      setShowCorrigendumReview(false)
    }
  }

  const handlePdfUpload = async (file: File | undefined) => {
    if (!file) return
    setExtracting(true)
    setExtractMessage(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/extract-tender', { method: 'POST', body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.data) throw new Error(json.error || 'Could not read the PDF.')
      const extracted = json.data as TenderExtraction
      const { filled } = applyExtraction(form, extracted, masters)
      setForm(prev => {
        const updated = applyExtraction(prev, extracted, masters).tender
        return updated
      })

      // Associate uploaded NIT / Tender Document with this tender so downstream modules can use it
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : undefined
        setForm(prev => ({
          ...prev,
          tenderDoc: {
            id: `nit-${Date.now()}`,
            name: file.name,
            size: file.size,
            type: file.type || 'application/pdf',
            uploadedAt: new Date().toISOString(),
            dataUrl,
            source: 'new-tender',
            referenceNote: 'Official NIT / Tender Document uploaded at New Tender creation',
          },
        }))
      }
      reader.readAsDataURL(file)

      setExtractMessage({
        tone: 'ok',
        text: `Filled ${filled} field${filled === 1 ? '' : 's'} from “${file.name}”. Document saved and associated with Tender.`,
      })
    } catch (err) {
      setExtractMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not read the PDF.' })
    } finally {
      setExtracting(false)
    }
  }

  const [reviewMissing, setReviewMissing] = useState<string[] | null>(null)
  const [showConfirmCreate, setShowConfirmCreate] = useState(false)

  const performSave = () => {
    if (mode === 'process') {
      const isFinal = targetStage === 'Financial Open Check'
      const updatedStatus: Status = isFinal ? 'Completed' : form.status === 'Completed' ? 'Completed' : 'Ready'
      onSave({
        ...form,
        stage: targetStage,
        status: updatedStatus,
      })
    } else {
      onSave(form)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.authority.trim()) return

    // Before creating/saving, review any document fields that are still empty —
    // they would otherwise print as blanks in the bid documents unnoticed.
    if (showBidDetails) {
      const missing = missingDocFields(form)
      if (missing.length > 0) {
        setReviewMissing(missing)
        return
      }
    }

    // Display confirmation popup before final tender creation
    if (mode === 'new') {
      setShowConfirmCreate(true)
      return
    }

    performSave()
  }

  return (
    <>
    <div className="modal-backdrop">
      <div className={showBidDetails ? 'modal modal-wide' : 'modal'}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">
              {mode === 'new'
                ? 'NEW TENDER RECORD'
                : mode === 'edit'
                ? 'UPDATE RECORD'
                : 'WORKFLOW ACTION'}
            </p>
            <h2>
              {mode === 'new'
                ? 'Create New Tender'
                : mode === 'edit'
                ? 'Edit Tender Details'
                : `Process Stage: ${form.stage}`}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close modal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-record-pill">
          <span className="badge badge-blue">{form.id || 'Draft Record'}</span>
          <span>All changes persist automatically to Local Storage.</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="full-col">
              Tender Title *
              <input
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="e.g. Multi-lane Highway resurfacing and drainage"
                required
              />
            </label>

            <label>
              Issuing Authority / Client *
              <input
                value={form.authority}
                onChange={e => set('authority', e.target.value)}
                placeholder="e.g. Municipal Corporation / NHAI"
                required
              />
            </label>

            <label>
              Tender Value (Estimated)
              <input
                value={form.value}
                onChange={e => set('value', e.target.value)}
                placeholder="e.g. ₹ 4.5 Cr"
              />
            </label>

            <label>
              Department
              <select
                value={form.department}
                onChange={e => set('department', e.target.value)}
              >
                {withCurrent(masters.departments, form.department).map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label>
              State / Region
              <select
                value={form.state}
                onChange={e => set('state', e.target.value)}
              >
                {withCurrent(masters.states, form.state).map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Submission Due Date
              <input
                type="date"
                value={form.due}
                onChange={e => set('due', e.target.value)}
              />
            </label>

            {mode === 'process' ? (
              <label>
                Move to Stage *
                <select
                  value={targetStage}
                  onChange={e => setTargetStage(e.target.value as Stage)}
                >
                  {stagesList.map(s => (
                    <option key={s.label} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Current Stage
                <select
                  value={form.stage}
                  onChange={e => set('stage', e.target.value as Stage)}
                >
                  {stagesList.map(s => (
                    <option key={s.label} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Status
              <select
                value={form.status}
                onChange={e => set('status', e.target.value as Status)}
              >
                <option value="In Progress">In Progress</option>
                <option value="Ready">Ready</option>
                <option value="Submitted">Submitted</option>
                <option value="Completed">Completed</option>
                <option value="At Risk">At Risk</option>
              </select>
            </label>

            <label className="full-col">
              Remarks & Stage Verification Notes
              <textarea
                value={form.remarks || ''}
                onChange={e => set('remarks', e.target.value)}
                placeholder="Enter stage completion notes, checklist items, or document references..."
              />
            </label>

            {showBidDetails && (
              <>
                {/* Side-by-side: Tender Auto-fill and Corrigendum Analysis */}
                <div className="pdf-upload-container">
                  {/* Column 1: Tender PDF Auto-fill */}
                  <div className="pdf-autofill">
                    <div className="flex items-center gap-2 text-sm font-bold text-blue-900">
                      <Sparkles className="w-4 h-4 text-blue-600" /> Auto-fill from Tender PDF (AI)
                    </div>
                    <p className="text-xs text-blue-900/70 -mt-1">
                      Upload the tender / NIT / RfS PDF and the fields below (and every generated document) will be filled
                      automatically. Review the values before saving.
                    </p>
                    <div className="flex items-center gap-3">
                      <label className="secondary-button cursor-pointer text-xs">
                        <FileUp className="w-4 h-4" />
                        {extracting ? 'Reading PDF…' : 'Upload Tender PDF'}
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          disabled={extracting}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            handlePdfUpload(file)
                          }}
                        />
                      </label>
                      {extracting && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                    </div>
                    {extractMessage && (
                      <p className={extractMessage.tone === 'ok' ? 'text-xs text-emerald-700 font-medium' : 'text-xs text-red-600'}>
                        {extractMessage.text}
                      </p>
                    )}
                  </div>

                  {/* Column 2: Corrigendum PDF Analysis */}
                  <div className="pdf-corrigendum">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-bold text-purple-950">
                        <FileText className="w-4 h-4 text-purple-600" /> Corrigendum (AI)
                      </div>
                      {corrigenda.length > 0 && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-200 text-purple-900">
                          {corrigenda.length} Corrigend{corrigenda.length === 1 ? 'um' : 'a'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-purple-950/70 -mt-1">
                      Upload corrigendum / amendment PDFs to detect deadline extensions, revised EMD, scope changes, and clarifications.
                    </p>
                    <div className="flex items-center gap-3">
                      <label className="secondary-button cursor-pointer text-xs border-purple-200 text-purple-900 hover:bg-purple-100/60">
                        <FileUp className="w-4 h-4 text-purple-600" />
                        {corrigendumExtracting ? 'Analyzing Corrigendum…' : 'Upload Corrigendum PDF'}
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          disabled={corrigendumExtracting}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            handleCorrigendumUpload(file)
                          }}
                        />
                      </label>
                      {corrigendumExtracting && <Loader2 className="w-4 h-4 animate-spin text-purple-600" />}
                    </div>
                    {corrigendumMessage && (
                      <p
                        className={
                          corrigendumMessage.tone === 'ok'
                            ? 'text-xs text-emerald-700 font-medium'
                            : corrigendumMessage.tone === 'warn'
                            ? 'text-xs text-amber-700 font-medium'
                            : 'text-xs text-red-600'
                        }
                      >
                        {corrigendumMessage.text}
                      </p>
                    )}

                    {corrigenda.length > 0 && (
                      <div className="mt-1 pt-2 border-t border-purple-200/60 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {corrigenda.map((c, idx) => {
                            const isActive = activeCorrigendum?.id === c.id
                            return (
                              <button
                                key={c.id || idx}
                                type="button"
                                onClick={() => {
                                  setActiveCorrigendumId(c.id)
                                  setShowCorrigendumReview(true)
                                }}
                                className={`text-[11px] px-2.5 py-1 rounded-md border flex items-center gap-1.5 font-medium transition-all ${
                                  isActive
                                    ? 'border-purple-600 bg-purple-600 text-white shadow-sm'
                                    : 'border-purple-300 bg-white text-purple-900 hover:bg-purple-50'
                                }`}
                              >
                                <span>{c.corrigendumNo || `Corr-${idx + 1}`}</span>
                                <span className={isActive ? 'text-purple-200 text-[10px]' : 'text-purple-600 font-bold text-[10px]'}>
                                  ({c.changes.length})
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowCorrigendumReview(prev => !prev)}
                          className="text-xs text-purple-700 hover:text-purple-900 font-semibold underline"
                        >
                          {showCorrigendumReview ? 'Hide Review' : 'Review Changes'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Corrigendum Review & Selective Update Interface */}
                {showCorrigendumReview && activeCorrigendum && (
                  <div className="corrigendum-review-box">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{activeCorrigendum.corrigendumNo}</span>
                          {activeCorrigendum.issueDate && (
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                              Dated: {activeCorrigendum.issueDate}
                            </span>
                          )}
                          <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            {activeCorrigendum.changes.length} change(s) extracted
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          File: <span className="font-medium text-slate-800">{activeCorrigendum.fileName}</span>
                          {activeCorrigendum.overview ? ` • ${activeCorrigendum.overview}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => removeCorrigendum(activeCorrigendum.id)}
                          className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50"
                          title="Remove this corrigendum record"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCorrigendumReview(false)}
                          className="text-xs text-slate-500 hover:text-slate-800 p-1 rounded hover:bg-slate-100"
                          title="Close review panel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Reference Validation Banner */}
                    {activeCorrigendum.tenderRef && (
                      <div
                        className={`text-xs p-2.5 rounded-lg flex items-start gap-2 ${
                          form.bid?.rfsNo &&
                          !form.bid.rfsNo.toLowerCase().includes(activeCorrigendum.tenderRef.toLowerCase()) &&
                          !activeCorrigendum.tenderRef.toLowerCase().includes(form.bid.rfsNo.toLowerCase())
                            ? 'bg-amber-50 text-amber-900 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                        }`}
                      >
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div>
                          <strong>Quoted Tender Reference: </strong> {activeCorrigendum.tenderRef}
                          {form.bid?.rfsNo &&
                            !form.bid.rfsNo.toLowerCase().includes(activeCorrigendum.tenderRef.toLowerCase()) &&
                            !activeCorrigendum.tenderRef.toLowerCase().includes(form.bid.rfsNo.toLowerCase()) && (
                              <span className="block mt-0.5 text-amber-800 font-medium">
                                Warning: Does not match current tender RfS No “{form.bid.rfsNo}”. Please verify before applying updates.
                              </span>
                            )}
                        </div>
                      </div>
                    )}

                    {/* Multiple Corrigenda Sequence & Conflict Alerts */}
                    {corrigenda.length > 1 && (
                      <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-700">
                          <History className="w-4 h-4 text-purple-600" />
                          <span>
                            Corrigendum Sequence: <strong>{corrigenda.findIndex(c => c.id === activeCorrigendum.id) + 1}</strong> of{' '}
                            <strong>{corrigenda.length}</strong> records.
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          Uploaded on {new Date(activeCorrigendum.uploadedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    {/* Applied Feedback Banner */}
                    {appliedFeedback && (
                      <div className="text-xs p-2.5 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-lg flex items-center gap-2 font-medium">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>{appliedFeedback}</span>
                      </div>
                    )}

                    {/* Changes List / Table */}
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {activeCorrigendum.changes.map(item => {
                        const isMapped = item.targetField && item.targetField !== 'none'
                        const isChecked = !!selectedChanges[item.id]

                        let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200'
                        if (item.type === 'Deadline Extension') badgeColor = 'bg-blue-100 text-blue-800 border-blue-200'
                        else if (item.type === 'EMD / Financial') badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        else if (item.type === 'Eligibility Criteria') badgeColor = 'bg-amber-100 text-amber-800 border-amber-200'
                        else if (item.type === 'Technical Specification') badgeColor = 'bg-indigo-100 text-indigo-800 border-indigo-200'
                        else if (item.type === 'Scope / Quantity') badgeColor = 'bg-purple-100 text-purple-800 border-purple-200'
                        else if (item.type === 'Clarification / Q&A') badgeColor = 'bg-rose-100 text-rose-800 border-rose-200'

                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-lg border text-xs transition-all ${
                              isChecked
                                ? 'border-purple-300 bg-purple-50/30'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                {isMapped ? (
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={e =>
                                      setSelectedChanges(prev => ({
                                        ...prev,
                                        [item.id]: e.target.checked,
                                      }))
                                    }
                                    className="mt-1 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    id={`check-${item.id}`}
                                  />
                                ) : (
                                  <span className="w-4 h-4 flex-shrink-0 mt-0.5 rounded-full bg-slate-200 text-slate-500 grid place-items-center text-[10px]" title="Informational change (not mapped to single scalar field)">
                                    i
                                  </span>
                                )}

                                <div className="space-y-1.5 flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded border font-semibold text-[10px] ${badgeColor}`}>
                                      {item.type}
                                    </span>
                                    {item.isCritical && (
                                      <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-bold flex items-center gap-1">
                                        <Flame className="w-3 h-3 text-rose-600" /> High Impact
                                      </span>
                                    )}
                                    {item.pageClauseRef && (
                                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                        📍 {item.pageClauseRef}
                                      </span>
                                    )}
                                    {item.applied && (
                                      <span className="text-[10px] text-emerald-700 bg-emerald-100 font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Applied to Form
                                      </span>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 bg-slate-50/80 rounded border border-slate-100">
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Original Condition / Value</span>
                                      <span className="text-slate-600 line-through font-mono text-[11px] block mt-0.5 break-words">
                                        {item.originalValue || 'As per original NIT'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] uppercase font-bold text-emerald-700 block">Revised Condition / Value</span>
                                      <strong className="text-emerald-800 font-mono text-[11px] block mt-0.5 break-words">
                                        {item.revisedValue}
                                      </strong>
                                    </div>
                                  </div>

                                  <p className="text-slate-700 leading-relaxed pt-0.5">{item.description}</p>

                                  {isMapped && (
                                    <span className="text-[11px] text-purple-700 font-medium block">
                                      → Maps to tender field: <strong>{item.targetField === 'due' ? 'Submission Due Date' : item.targetField === 'bidDeadlineTime' ? 'Bid Deadline Time' : item.targetField === 'corrigendumRef' ? 'Corrigendum Reference' : item.targetField}</strong>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-purple-100">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const all: Record<string, boolean> = {}
                            activeCorrigendum.changes.forEach(c => {
                              if (c.targetField && c.targetField !== 'none') all[c.id] = true
                            })
                            setSelectedChanges(all)
                          }}
                          className="text-xs text-purple-700 hover:text-purple-900 font-medium underline"
                        >
                          Select All Mappable
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={() => setSelectedChanges({})}
                          className="text-xs text-slate-500 hover:text-slate-700 font-medium underline"
                        >
                          Deselect All
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => applySelectedChanges(activeCorrigendum.id)}
                          className="primary-button text-xs py-1.5 px-3 bg-purple-700 hover:bg-purple-800 border-none shadow-sm flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" /> Apply Selected Changes
                        </button>
                      </div>
                    </div>
                  </div>
                )}


                <div className="form-section-title">Document Details (used to auto-fill bid documents)</div>

                <label>
                  RfS / Tender No.
                  <input
                    value={bid.rfsNo}
                    onChange={e => setBid('rfsNo', e.target.value)}
                    placeholder="e.g. CSPDCL/NIT/ULA-114.23 MW-/1095"
                  />
                </label>
                <label>
                  RfS / Tender Date
                  <input type="date" value={bid.rfsDate} onChange={e => setBid('rfsDate', e.target.value)} />
                </label>
                <label>
                  Corrigendum
                  <input
                    value={bid.corrigendum}
                    onChange={e => setBid('corrigendum', e.target.value)}
                    placeholder="e.g. Corrigendum-1 dated 03.09.2026"
                  />
                </label>
                <label>
                  Authority Full Name
                  <input
                    value={bid.authorityFullName}
                    onChange={e => setBid('authorityFullName', e.target.value)}
                    placeholder="e.g. Chhattisgarh State Power Distribution Company Limited"
                  />
                </label>
                <label>
                  Addressee Designation
                  <input
                    value={bid.addresseeDesignation}
                    onChange={e => setBid('addresseeDesignation', e.target.value)}
                    placeholder="e.g. The Executive Director (RA&PM)"
                  />
                </label>
                <label>
                  Jurisdiction (Courts at)
                  <input value={bid.jurisdiction} onChange={e => setBid('jurisdiction', e.target.value)} placeholder="e.g. Raipur" />
                </label>
                <label className="full-col">
                  Authority Address
                  <textarea
                    value={bid.authorityAddress}
                    onChange={e => setBid('authorityAddress', e.target.value)}
                    placeholder="Full postal address for bid submission"
                  />
                </label>
                <label className="full-col">
                  Name of Work
                  <textarea
                    value={bid.workName}
                    onChange={e => setBid('workName', e.target.value)}
                    placeholder="Full scope of work as per the tender"
                  />
                </label>
                <label>
                  Short Name of Work
                  <input
                    value={bid.shortWorkName}
                    onChange={e => setBid('shortWorkName', e.target.value)}
                    placeholder="One line, used on envelope stickers"
                  />
                </label>
                <label>
                  Bid Deadline Time
                  <input
                    value={bid.bidDeadlineTime}
                    onChange={e => setBid('bidDeadlineTime', e.target.value)}
                    placeholder="e.g. 15:00 Hrs."
                  />
                </label>
                <label>
                  Tender Fee (per package)
                  <input
                    value={bid.tenderFeePerPackage}
                    onChange={e => handleTenderFeeChange(e.target.value)}
                    placeholder="e.g. 10,000"
                  />
                </label>
                <label>
                  GST Section
                  <input
                    value={bid.gstSection || ''}
                    onChange={e => handleGstSectionChange(e.target.value)}
                    placeholder="e.g. 18% GST applicable (₹ 1,800)"
                  />
                </label>
                <label className="full-col">
                  Tender Fee + GST
                  <input
                    value={bid.tenderFeePlusGst || ''}
                    onChange={e => setBid('tenderFeePlusGst', e.target.value)}
                    placeholder="e.g. ₹ 11,800 (Base: ₹ 10,000 + 18% GST: ₹ 1,800)"
                  />
                </label>
                <label className="full-col">
                  Test Report Compliance (3–5 lines summary)
                  <textarea
                    rows={3}
                    value={bid.testReportCompliance || ''}
                    onChange={e => setBid('testReportCompliance', e.target.value)}
                    placeholder="Summary of required test reports, IS/IEC standards, testing laboratories, and report validity..."
                  />
                </label>
                <label className="full-col">
                  MAF Requirement (3–5 lines summary)
                  <textarea
                    rows={3}
                    value={bid.mafRequirement || ''}
                    onChange={e => setBid('mafRequirement', e.target.value)}
                    placeholder="Summary of Manufacturer Authorization Form (MAF) requirements, or 'Not Required'..."
                  />
                </label>
                <label className="full-col">
                  Experience Filed (Exact Requirement)
                  <textarea
                    rows={4}
                    value={bid.experienceRequirement || ''}
                    onChange={e => setBid('experienceRequirement', e.target.value)}
                    placeholder="Exact eligibility criteria, completed work values, capacity, completion certificates verbatim from tender..."
                  />
                </label>
                <label className="full-col">
                  Turn Over (Turnover)
                  <textarea
                    rows={3}
                    value={bid.turnoverRequirement || ''}
                    onChange={e => setBid('turnoverRequirement', e.target.value)}
                    placeholder="Exact minimum annual turnover, average turnover (MAAT), financial years, CA certificate & financial statements..."
                  />
                </label>
                <label>
                  Bid Validity (days)
                  <input value={bid.bidValidityDays} onChange={e => setBid('bidValidityDays', e.target.value)} placeholder="e.g. 180" />
                </label>
                <label>
                  Financial Requirement (Rs. Cr)
                  <input
                    value={bid.financialRequirementCr}
                    onChange={e => setBid('financialRequirementCr', e.target.value)}
                    placeholder="e.g. 301.00"
                  />
                </label>
                <label>
                  Technical Requirement
                  <input
                    value={bid.technicalRequirement}
                    onChange={e => setBid('technicalRequirement', e.target.value)}
                    placeholder="e.g. 60,100 kWp OR 10,000 installations"
                  />
                </label>

                <div className="form-section-title">Packages / Lots & EMD</div>
                <div className="full-col flex flex-col gap-2">
                  {bid.packages.map((pkg, i) => (
                    <div className="package-row" key={i}>
                      <input value={pkg.code} onChange={e => setPackage(i, 'code', e.target.value)} placeholder="P-1" />
                      <input value={pkg.region} onChange={e => setPackage(i, 'region', e.target.value)} placeholder="Region" />
                      <input value={pkg.rfx} onChange={e => setPackage(i, 'rfx', e.target.value)} placeholder="RFX No." />
                      <input value={pkg.emdLakh} onChange={e => setPackage(i, 'emdLakh', e.target.value)} placeholder="EMD (Lakh)" />
                      <button type="button" className="icon-action delete" title="Remove package" onClick={() => removePackage(i)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="secondary-button text-xs self-start" onClick={addPackage}>
                    <Plus className="w-4 h-4" /> Add Package
                  </button>
                </div>

                <div className="form-section-title">Technical Components (Format-12 — Makes & Compliance)</div>
                <div className="full-col flex flex-col gap-2">
                  {bid.technicalComponents.map((c, i) => (
                    <div className="component-row" key={i}>
                      <input value={c.item} onChange={e => setComponent(i, 'item', e.target.value)} placeholder="Item, e.g. Solar PV Module" />
                      <input value={c.make} onChange={e => setComponent(i, 'make', e.target.value)} placeholder="Make(s) proposed" />
                      <input value={c.compliance} onChange={e => setComponent(i, 'compliance', e.target.value)} placeholder="Compliance standard (IS/IEC)" />
                      <button type="button" className="icon-action delete" title="Remove component" onClick={() => removeComponent(i)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="secondary-button text-xs self-start" onClick={addComponent}>
                    <Plus className="w-4 h-4" /> Add Component
                  </button>
                </div>

                <div className="form-section-title">Beneficiary Bank Details (for EMD Bank Guarantee)</div>
                <label>
                  Account Holder
                  <input value={bid.beneficiaryBank.accountHolder} onChange={e => setBank('accountHolder', e.target.value)} />
                </label>
                <label>
                  Bank Name
                  <input value={bid.beneficiaryBank.bankName} onChange={e => setBank('bankName', e.target.value)} />
                </label>
                <label>
                  Branch
                  <input value={bid.beneficiaryBank.branch} onChange={e => setBank('branch', e.target.value)} />
                </label>
                <label>
                  Account No.
                  <input value={bid.beneficiaryBank.accountNo} onChange={e => setBank('accountNo', e.target.value)} />
                </label>
                <label>
                  IFSC Code
                  <input value={bid.beneficiaryBank.ifsc} onChange={e => setBank('ifsc', e.target.value)} />
                </label>
                <label>
                  Account Type
                  <input value={bid.beneficiaryBank.accountType} onChange={e => setBank('accountType', e.target.value)} />
                </label>
              </>
            )}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={!form.title.trim() || !form.authority.trim()}
            >
              {mode === 'new'
                ? 'Create Tender'
                : mode === 'edit'
                ? 'Save Changes'
                : 'Complete & Advance'}{' '}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>

    {reviewMissing && (
      <div className="modal-backdrop" style={{ zIndex: 60 }}>
        <div className="modal" style={{ width: 'min(480px, 100%)' }}>
          <div className="modal-head">
            <div>
              <p className="eyebrow">REVIEW BEFORE SAVING</p>
              <h2>Some fields are still empty</h2>
            </div>
            <button onClick={() => setReviewMissing(null)} aria-label="Close review">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div style={{ padding: '18px 26px' }}>
            <p className="text-sm text-slate-600 mb-3">
              These will print as blanks (<span className="font-mono">__________</span>) in the bid documents:
            </p>
            <ul className="list-disc pl-5 text-sm text-amber-800 space-y-1 mb-4">
              {reviewMissing.map(field => (
                <li key={field}>{field}</li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              You can go back and fill them now (or upload the tender PDF), or save anyway and fill them later from
              the tender&apos;s documents page.
            </p>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setReviewMissing(null)}>
              Go Back & Fill
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setReviewMissing(null)
                if (mode === 'new') {
                  setShowConfirmCreate(true)
                } else {
                  performSave()
                }
              }}
            >
              Save Anyway <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Confirmation Popup Before Creating a Tender */}
    {showConfirmCreate && (
      <div className="modal-backdrop" style={{ zIndex: 70 }}>
        <div className="modal" style={{ width: 'min(440px, 100%)' }}>
          <div className="modal-head">
            <div>
              <p className="eyebrow">CONFIRMATION</p>
              <h2 className='text-green-600'>Create Tender</h2>
            </div>
            <button onClick={() => setShowConfirmCreate(false)} aria-label="Close confirmation">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div style={{ padding: '20px 24px' }}>
            <p className="text-sm font-semibold text-red-800 mb-2">
              Are you sure you want to create this tender?
            </p>
            {form.title && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-3 text-xs text-slate-600">
                <span className="font-semibold text-slate-700 block truncate" title={form.title}>
                  {form.title}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Authority: {form.authority || '—'}
                </span>
              </div>
            )}
            <p className="text-xs text-slate-500">
              Click &quot;Confirm&quot; to proceed and save this tender to the database, or &quot;Cancel&quot; to return to editing.
            </p>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowConfirmCreate(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setShowConfirmCreate(false)
                performSave()
              }}
            >
              Confirm <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
