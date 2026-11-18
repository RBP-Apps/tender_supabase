'use client'

import React, { useState, useRef, useEffect } from 'react'
import { FileCheck, Info } from 'lucide-react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  FileUp,
  Flame,
  History,
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
import { uploadToSupabaseBucket, STAGE_FOLDERS } from '@/lib/supabase-storage'

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

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
  const [extractProgress, setExtractProgress] = useState(0)
  const [extractMessage, setExtractMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const extractTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Corrigendum Feature State
  const [corrigendumExtracting, setCorrigendumExtracting] = useState(false)
  const [corrigendumProgress, setCorrigendumProgress] = useState(0)
  const [corrigendumMessage, setCorrigendumMessage] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null)
  const corrigendumTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (extractTimerRef.current) clearInterval(extractTimerRef.current)
      if (corrigendumTimerRef.current) clearInterval(corrigendumTimerRef.current)
    }
  }, [])
  const [activeCorrigendumId, setActiveCorrigendumId] = useState<string | null>(null)
  const [showCorrigendumReview, setShowCorrigendumReview] = useState(false)
  const [selectedChanges, setSelectedChanges] = useState<Record<string, boolean>>({})
  const [appliedFeedback, setAppliedFeedback] = useState<string | null>(null)

  // Corrigendum Edit State
  const [editingCorrId, setEditingCorrId] = useState<string | null>(null)
  const [editCorrForm, setEditCorrForm] = useState<{
    corrigendumNo: string
    issueDate: string
    tenderRef: string
    overview: string
  }>({
    corrigendumNo: '',
    issueDate: '',
    tenderRef: '',
    overview: '',
  })

  const corrigenda: CorrigendumRecord[] = form.corrigenda || []
  const activeCorrigendum =
    corrigenda.find(c => c.id === activeCorrigendumId) ||
    (corrigenda.length > 0 ? corrigenda[corrigenda.length - 1] : null)

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  const startEditCorrigendum = (c: CorrigendumRecord) => {
    setEditingCorrId(c.id)
    setEditCorrForm({
      corrigendumNo: c.corrigendumNo,
      issueDate: c.issueDate || '',
      tenderRef: c.tenderRef || '',
      overview: c.overview || '',
    })
  }

  const saveEditedCorrigendum = () => {
    if (!editingCorrId || !editCorrForm) return
    setForm(prev => ({
      ...prev,
      corrigenda: (prev.corrigenda || []).map(c =>
        c.id === editingCorrId
          ? {
              ...c,
              corrigendumNo: editCorrForm.corrigendumNo.trim() || c.corrigendumNo,
              issueDate: editCorrForm.issueDate || c.issueDate,
              tenderRef: editCorrForm.tenderRef || c.tenderRef,
              overview: editCorrForm.overview || c.overview,
            }
          : c
      ),
    }))
    setEditingCorrId(null)
    setCorrigendumMessage({ tone: 'ok', text: 'Corrigendum details updated successfully.' })
  }

  const handleCorrigendumDelete = (corrId: string) => {
    const target = corrigenda.find(c => c.id === corrId)
    const name = target?.corrigendumNo || 'this corrigendum'
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      removeCorrigendum(corrId)
      setCorrigendumMessage({ tone: 'ok', text: `${name} deleted successfully. Click Save to persist changes.` })
    }
  }

  const handleCorrigendumView = (corr: CorrigendumRecord) => {
    const url = corr.fileUrl || corr.dataUrl
    if (!url) {
      alert('No PDF file attached to this corrigendum.')
      return
    }
    const win = window.open()
    if (win) {
      if (url.startsWith('data:')) {
        win.document.write(
          `<iframe src="${url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
        )
      } else {
        win.location.href = url
      }
    }
  }

  const handleCorrigendumUpload = async (file: File | undefined, replaceCorrId?: string) => {
    if (!file) return
    if (corrigendumTimerRef.current) clearInterval(corrigendumTimerRef.current)
    setCorrigendumExtracting(true)
    setCorrigendumProgress(15)
    setCorrigendumMessage(null)
    setAppliedFeedback(null)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      let finalUrl = dataUrl
      setCorrigendumProgress(28)

      try {
        const uploadRes = await uploadToSupabaseBucket({
          file,
          dataUrl,
          fileName: file.name,
          folder: 'stage-01-corrigendum',
          tenderId: form.id || 'draft',
        })
        if (uploadRes.storage === 'bucket' && uploadRes.url) {
          finalUrl = uploadRes.url
        }
      } catch (uploadErr) {
        console.warn('Corrigendum bucket upload fallback:', uploadErr)
      }
      setCorrigendumProgress(42)

      corrigendumTimerRef.current = setInterval(() => {
        setCorrigendumProgress(prev => {
          if (prev >= 95) return prev
          const step = prev < 65 ? 4 : prev < 85 ? 2 : 1
          return Math.min(prev + step, 95)
        })
      }, 350)

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
      
      if (corrigendumTimerRef.current) clearInterval(corrigendumTimerRef.current)
      setCorrigendumProgress(98)
      const data = json.data as CorrigendumExtraction

      const newRecordId = replaceCorrId || `corr-${Date.now()}`
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

      const existingRecord = replaceCorrId ? corrigenda.find(c => c.id === replaceCorrId) : null
      const updatedRecord: CorrigendumRecord = {
        id: newRecordId,
        corrigendumNo: data.corrigendumNo || existingRecord?.corrigendumNo || `Corrigendum-${corrigenda.length + 1}`,
        issueDate: data.issueDate || existingRecord?.issueDate,
        tenderRef: data.tenderRef || existingRecord?.tenderRef,
        fileName: file.name,
        fileUrl: finalUrl,
        dataUrl: finalUrl,
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
        overview: data.overview || existingRecord?.overview || 'Official corrigendum updates processed by AI.',
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
        const updatedCorrigenda = replaceCorrId
          ? existing.map(c => (c.id === replaceCorrId ? updatedRecord : c))
          : [...existing, updatedRecord]

        const corrLabel = updatedRecord.issueDate
          ? `${updatedRecord.corrigendumNo} dated ${updatedRecord.issueDate}`
          : updatedRecord.corrigendumNo

        const updatedBid = { ...(prev.bid ?? emptyBid()) }
        if (!updatedBid.corrigendum || !updatedBid.corrigendum.trim()) {
          updatedBid.corrigendum = corrLabel
        } else if (!updatedBid.corrigendum.includes(updatedRecord.corrigendumNo)) {
          updatedBid.corrigendum = `${updatedBid.corrigendum}, ${corrLabel}`
        }

        return {
          ...prev,
          corrigenda: updatedCorrigenda,
          bid: updatedBid,
        }
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
          : `Analyzed “${file.name}”: Identified ${changesWithIds.length} update(s) for ${updatedRecord.corrigendumNo}. Review and apply changes below.`,
      })
      setCorrigendumProgress(100)
    } catch (err) {
      if (corrigendumTimerRef.current) clearInterval(corrigendumTimerRef.current)
      setCorrigendumProgress(0)
      setCorrigendumMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Could not analyze the Corrigendum PDF.',
      })
    } finally {
      if (corrigendumTimerRef.current) clearInterval(corrigendumTimerRef.current)
      setTimeout(() => {
        setCorrigendumExtracting(false)
        setCorrigendumProgress(0)
      }, 650)
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
    setForm(prev => {
      const remaining = (prev.corrigenda || []).filter(c => c.id !== corrId)
      const updatedBid = { ...(prev.bid ?? emptyBid()) }
      updatedBid.corrigendum = remaining
        .map(c => `${c.corrigendumNo || 'Corrigendum'}${c.issueDate ? ` dated ${c.issueDate}` : ''}`)
        .join(', ')
      return {
        ...prev,
        corrigenda: remaining,
        bid: updatedBid,
      }
    })
    if (activeCorrigendumId === corrId) {
      setActiveCorrigendumId(null)
      setShowCorrigendumReview(false)
    }
  }

  const handlePdfDelete = () => {
    if (window.confirm('Are you sure you want to delete the uploaded Tender PDF?')) {
      setForm(prev => ({ ...prev, tenderDoc: null }))
      setExtractMessage({ tone: 'ok', text: 'Tender PDF removed successfully. Click Save to persist changes.' })
    }
  }

  const handlePdfView = () => {
    if (!form.tenderDoc?.dataUrl) {
      alert('No PDF file attached.')
      return
    }
    const url = form.tenderDoc.dataUrl
    const win = window.open()
    if (win) {
      if (url.startsWith('data:')) {
        win.document.write(
          `<iframe src="${url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
        )
      } else {
        win.location.href = url
      }
    }
  }

  const handlePdfUpload = async (file: File | undefined) => {
    if (!file) return
    if (extractTimerRef.current) clearInterval(extractTimerRef.current)
    setExtracting(true)
    setExtractProgress(15)
    setExtractMessage(null)
    try {
      // 1. Read file as base64 dataUrl immediately
      const dataUrl = await readFileAsDataUrl(file)
      let finalUrl = dataUrl
      setExtractProgress(28)

      // 2. Upload to Supabase bucket if configured
      try {
        const uploadRes = await uploadToSupabaseBucket({
          file,
          dataUrl,
          fileName: file.name,
          folder: STAGE_FOLDERS.STAGE_01_NOTICE,
          tenderId: form.id || 'draft',
        })
        if (uploadRes.storage === 'bucket' && uploadRes.url) {
          finalUrl = uploadRes.url
        }
      } catch (err) {
        console.warn('Storage bucket upload fallback:', err)
      }
      setExtractProgress(45)

      const tenderDocItem = {
        id: `nit-${Date.now()}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/pdf',
        uploadedAt: new Date().toISOString(),
        dataUrl: finalUrl,
        source: 'new-tender' as const,
        referenceNote: 'Official NIT / Tender Document uploaded at New Tender creation',
      }

      // 3. Extract tender details with AI (progress smoothly climbs from 45% to 95%)
      extractTimerRef.current = setInterval(() => {
        setExtractProgress(prev => {
          if (prev >= 95) return prev
          const step = prev < 65 ? 4 : prev < 85 ? 2 : 1
          return Math.min(prev + step, 95)
        })
      }, 350)

      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/extract-tender', { method: 'POST', body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.data) throw new Error(json.error || 'Could not read the PDF.')

      if (extractTimerRef.current) clearInterval(extractTimerRef.current)
      setExtractProgress(98)

      const extracted = json.data as TenderExtraction
      const { filled } = applyExtraction(form, extracted, masters)

      setForm(prev => {
        const updated = applyExtraction(prev, extracted, masters).tender
        return {
          ...updated,
          tenderDoc: tenderDocItem,
        }
      })

      setExtractProgress(100)
      setExtractMessage({
        tone: 'ok',
        text: `Filled ${filled} field${filled === 1 ? '' : 's'} from “${file.name}”. Document saved and associated with Tender.`,
      })
    } catch (err) {
      if (extractTimerRef.current) clearInterval(extractTimerRef.current)
      setExtractProgress(0)
      setExtractMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not read the PDF.' })
    } finally {
      if (extractTimerRef.current) clearInterval(extractTimerRef.current)
      setTimeout(() => {
        setExtracting(false)
        setExtractProgress(0)
      }, 650)
    }
  }

  const [reviewMissing, setReviewMissing] = useState<string[] | null>(null)
  const [showConfirmCreate, setShowConfirmCreate] = useState(false)

  const performSave = () => {
    const finalBid = { ...(form.bid ?? emptyBid()) }
    if ((!finalBid.corrigendum || !finalBid.corrigendum.trim()) && form.corrigenda && form.corrigenda.length > 0) {
      finalBid.corrigendum = form.corrigenda
        .map(c => `${c.corrigendumNo || 'Corrigendum'}${c.issueDate ? ` dated ${c.issueDate}` : ''}`)
        .join(', ')
    }

    const tenderToSave: Tender = {
      ...form,
      bid: finalBid,
    }

    if (mode === 'process') {
      const isFinal = targetStage === 'Financial Open Check'
      const updatedStatus: Status = isFinal ? 'Completed' : form.status === 'Completed' ? 'Completed' : 'Ready'
      onSave({
        ...tenderToSave,
        stage: targetStage,
        status: updatedStatus,
      })
    } else {
      onSave(tenderToSave)
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
      <div
        className={showBidDetails ? 'modal modal-wide' : 'modal'}
        style={{
          width: showBidDetails ? 'min(1180px, 96vw)' : undefined,
          maxWidth: showBidDetails ? '96vw' : undefined,
        }}
      >
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
                    <div className="flex items-center gap-2 text-sm font-bold text-blue-900 whitespace-nowrap">
                      <Sparkles className="w-4 h-4 text-blue-600 shrink-0" /> Auto-fill from Tender PDF (AI)
                    </div>
                    <p className="text-xs text-blue-900/70 -mt-1">
                      Upload the tender / NIT / RfS PDF and the fields below (and every generated document) will be filled
                      automatically. Review the values before saving.
                    </p>

                    {form.tenderDoc ? (
                      <div className="bg-blue-50/90 border border-blue-200 rounded-lg p-3 space-y-2 mt-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded bg-red-100 text-red-600 grid place-items-center flex-shrink-0 mt-0.5">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-800 block truncate" title={form.tenderDoc.name}>
                                {form.tenderDoc.name}
                              </span>
                              <span className="text-[11px] text-slate-500 block">
                                {formatBytes(form.tenderDoc.size)} {form.tenderDoc.uploadedAt ? `• Uploaded ${new Date(form.tenderDoc.uploadedAt).toLocaleDateString()}` : ''}
                              </span>
                            </div>
                          </div>
                          <span className="badge badge-emerald text-[10px] px-2 py-0.5 whitespace-nowrap shrink-0">
                            Attached
                          </span>
                        </div>

                        {extracting && (
                          <div className="bg-blue-100/70 border border-blue-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-[11px] font-semibold text-blue-900 whitespace-nowrap">
                                AI Reading PDF:
                              </span>
                              <div className="flex-1 bg-white/80 rounded-full h-2 overflow-hidden border border-blue-200 min-w-[60px]">
                                <div
                                  className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                                  style={{ width: `${extractProgress}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-xs font-bold text-blue-700 tabular-nums shrink-0">
                              {extractProgress}%
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1 border-t border-blue-100 flex-wrap sm:flex-nowrap">
                          {form.tenderDoc.dataUrl && (
                            <button
                              type="button"
                              onClick={handlePdfView}
                              className="text-xs text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-100/60 whitespace-nowrap"
                              title="View uploaded PDF"
                            >
                              <Eye className="w-3.5 h-3.5" /> View PDF
                            </button>
                          )}

                          <label className="text-xs text-indigo-700 hover:text-indigo-900 font-semibold flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-100/60 cursor-pointer whitespace-nowrap">
                            <FileUp className="w-3.5 h-3.5" />
                            {extracting ? `Replacing (${extractProgress}%)` : 'Edit / Replace PDF'}
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

                          <button
                            type="button"
                            onClick={handlePdfDelete}
                            className="text-xs text-red-600 hover:text-red-800 font-semibold flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 ml-auto whitespace-nowrap"
                            title="Delete Tender PDF"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete PDF
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <label className="secondary-button cursor-pointer text-xs whitespace-nowrap">
                          <FileUp className="w-4 h-4" />
                          {extracting ? `Reading PDF (${extractProgress}%)` : 'Upload Tender PDF'}
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
                        {extracting && (
                          <div className="flex items-center gap-2">
                            <div className="w-24 sm:w-28 bg-blue-100 rounded-full h-2 overflow-hidden border border-blue-200">
                              <div
                                className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${extractProgress}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-blue-700 tabular-nums shrink-0">
                              {extractProgress}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {extractMessage && (
                      <p className={extractMessage.tone === 'ok' ? 'text-xs text-emerald-700 font-medium' : 'text-xs text-red-600'}>
                        {extractMessage.text}
                      </p>
                    )}
                  </div>

                  {/* Column 2: Corrigendum PDF Analysis */}
                  <div className="pdf-corrigendum">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-purple-950 whitespace-nowrap">
                        <FileText className="w-4 h-4 text-purple-600 shrink-0" /> Corrigendum (AI)
                      </div>
                      {corrigenda.length > 0 && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-200 text-purple-900 whitespace-nowrap shrink-0">
                          {corrigenda.length} Corrigend{corrigenda.length === 1 ? 'um' : 'a'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-purple-950/70 -mt-1">
                      Upload corrigendum / amendment PDFs to detect deadline extensions, revised EMD, scope changes, and clarifications.
                    </p>

                    {activeCorrigendum ? (
                      <div className="bg-purple-50/90 border border-purple-200 rounded-lg p-3 space-y-2 mt-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded bg-purple-100 text-purple-600 grid place-items-center flex-shrink-0 mt-0.5">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-800 block truncate" title={activeCorrigendum.fileName}>
                                {activeCorrigendum.fileName}
                              </span>
                              <span className="text-[11px] text-slate-500 block">
                                {formatBytes(activeCorrigendum.fileSize ?? undefined)} • {activeCorrigendum.corrigendumNo} {activeCorrigendum.issueDate ? `(${activeCorrigendum.issueDate})` : ''}
                              </span>
                            </div>
                          </div>
                          <span className="badge badge-purple text-[10px] px-2 py-0.5 whitespace-nowrap bg-purple-100 text-purple-800 border border-purple-200 font-semibold shrink-0">
                            {activeCorrigendum.changes.length} Change{activeCorrigendum.changes.length === 1 ? '' : 's'}
                          </span>
                        </div>

                        {corrigendumExtracting && (
                          <div className="bg-purple-100/70 border border-purple-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-[11px] font-semibold text-purple-900 whitespace-nowrap">
                                AI Analyzing Corrigendum:
                              </span>
                              <div className="flex-1 bg-white/80 rounded-full h-2 overflow-hidden border border-purple-200 min-w-[60px]">
                                <div
                                  className="bg-purple-600 h-full rounded-full transition-all duration-300 ease-out"
                                  style={{ width: `${corrigendumProgress}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-xs font-bold text-purple-700 tabular-nums shrink-0">
                              {corrigendumProgress}%
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-1 border-t border-purple-100 flex-wrap sm:flex-nowrap">
                          {(activeCorrigendum.fileUrl || activeCorrigendum.dataUrl) && (
                            <button
                              type="button"
                              onClick={() => handleCorrigendumView(activeCorrigendum)}
                              className="text-xs text-purple-700 hover:text-purple-900 font-semibold flex items-center gap-1 px-2 py-1 rounded hover:bg-purple-100/60 whitespace-nowrap"
                              title="View Corrigendum PDF"
                            >
                              <Eye className="w-3.5 h-3.5" /> View PDF
                            </button>
                          )}

                          <label className="text-xs text-purple-700 hover:text-purple-900 font-semibold flex items-center gap-1 px-2 py-1 rounded hover:bg-purple-100/60 cursor-pointer whitespace-nowrap">
                            <FileUp className="w-3.5 h-3.5" />
                            {corrigendumExtracting ? `Replacing (${corrigendumProgress}%)` : 'Replace PDF'}
                            <input
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              disabled={corrigendumExtracting}
                              onChange={e => {
                                const file = e.target.files?.[0]
                                e.target.value = ''
                                handleCorrigendumUpload(file, activeCorrigendum.id)
                              }}
                            />
                          </label>

                          <label className="text-xs text-indigo-700 hover:text-indigo-900 font-semibold flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50 cursor-pointer whitespace-nowrap" title="Add another corrigendum">
                            <Plus className="w-3.5 h-3.5" /> Add
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

                          <button
                            type="button"
                            onClick={() => handleCorrigendumDelete(activeCorrigendum.id)}
                            className="text-xs text-red-600 hover:text-red-800 font-semibold flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 ml-auto whitespace-nowrap"
                            title="Delete Corrigendum"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <label className="secondary-button cursor-pointer text-xs border-purple-200 text-purple-900 hover:bg-purple-100/60 whitespace-nowrap">
                          <FileUp className="w-4 h-4 text-purple-600" />
                          {corrigendumExtracting ? `Analyzing (${corrigendumProgress}%)` : 'Upload Corrigendum PDF'}
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
                        {corrigendumExtracting && (
                          <div className="flex items-center gap-2">
                            <div className="w-24 sm:w-28 bg-purple-100 rounded-full h-2 overflow-hidden border border-purple-200">
                              <div
                                className="bg-purple-600 h-full rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${corrigendumProgress}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-purple-700 tabular-nums shrink-0">
                              {corrigendumProgress}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}

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
                              <div
                                key={c.id || idx}
                                className={`inline-flex items-center rounded-md border text-[11px] overflow-hidden ${
                                  isActive
                                    ? 'border-purple-600 bg-purple-600 text-white shadow-sm'
                                    : 'border-purple-300 bg-white text-purple-900 hover:bg-purple-50'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveCorrigendumId(c.id)
                                    setShowCorrigendumReview(true)
                                  }}
                                  className="px-2 py-1 flex items-center gap-1 font-medium whitespace-nowrap"
                                >
                                  <span>{c.corrigendumNo || `Corr-${idx + 1}`}</span>
                                  <span className={isActive ? 'text-purple-200 text-[10px]' : 'text-purple-600 font-bold text-[10px]'}>
                                    ({c.changes.length})
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleCorrigendumDelete(c.id)
                                  }}
                                  className={`px-1.5 py-1 transition-colors ${
                                    isActive
                                      ? 'text-purple-200 hover:bg-purple-700 hover:text-white'
                                      : 'text-slate-400 hover:bg-red-50 hover:text-red-600'
                                  }`}
                                  title={`Delete ${c.corrigendumNo}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowCorrigendumReview(prev => !prev)}
                          className="text-xs text-purple-700 hover:text-purple-900 font-semibold underline whitespace-nowrap ml-auto"
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

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* View PDF */}
                        {(activeCorrigendum.fileUrl || activeCorrigendum.dataUrl) && (
                          <button
                            type="button"
                            onClick={() => handleCorrigendumView(activeCorrigendum)}
                            className="text-xs text-purple-700 hover:text-purple-900 font-semibold flex items-center gap-1 px-2 py-1 rounded hover:bg-purple-50 border border-purple-200"
                            title="View Corrigendum PDF"
                          >
                            <Eye className="w-3.5 h-3.5" /> View PDF
                          </button>
                        )}

                        {/* Replace / Edit PDF */}
                        <label
                          className="text-xs text-indigo-700 hover:text-indigo-900 font-semibold flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50 border border-indigo-200 cursor-pointer"
                          title="Replace PDF file for this Corrigendum"
                        >
                          <FileUp className="w-3.5 h-3.5" />
                          {corrigendumExtracting ? `Uploading (${corrigendumProgress}%)` : 'Replace PDF'}
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            disabled={corrigendumExtracting}
                            onChange={e => {
                              const file = e.target.files?.[0]
                              e.target.value = ''
                              handleCorrigendumUpload(file, activeCorrigendum.id)
                            }}
                          />
                        </label>

                        {/* Edit details */}
                        <button
                          type="button"
                          onClick={() => {
                            if (editingCorrId === activeCorrigendum.id) {
                              setEditingCorrId(null)
                            } else {
                              startEditCorrigendum(activeCorrigendum)
                            }
                          }}
                          className="text-xs text-slate-700 hover:text-slate-900 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 border border-slate-200"
                          title="Edit Corrigendum Details"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> {editingCorrId === activeCorrigendum.id ? 'Cancel Edit' : 'Edit Details'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCorrigendumDelete(activeCorrigendum.id)}
                          className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 border border-red-200"
                          title="Delete this corrigendum record"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
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

                    {/* Inline Corrigendum Editor */}
                    {editingCorrId === activeCorrigendum.id && (
                      <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg space-y-2.5 text-xs mb-3">
                        <div className="font-bold text-purple-950 flex items-center gap-1.5">
                          <Edit3 className="w-3.5 h-3.5 text-purple-600" /> Edit Corrigendum Details
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold text-slate-700">Corrigendum No.</span>
                            <input
                              className="border border-slate-300 rounded px-2 py-1 bg-white text-xs"
                              value={editCorrForm.corrigendumNo}
                              onChange={e => setEditCorrForm(prev => ({ ...prev, corrigendumNo: e.target.value }))}
                              placeholder="e.g. Corrigendum-1"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold text-slate-700">Issue Date</span>
                            <input
                              type="date"
                              className="border border-slate-300 rounded px-2 py-1 bg-white text-xs"
                              value={editCorrForm.issueDate}
                              onChange={e => setEditCorrForm(prev => ({ ...prev, issueDate: e.target.value }))}
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold text-slate-700">Quoted Tender Ref</span>
                            <input
                              className="border border-slate-300 rounded px-2 py-1 bg-white text-xs"
                              value={editCorrForm.tenderRef}
                              onChange={e => setEditCorrForm(prev => ({ ...prev, tenderRef: e.target.value }))}
                              placeholder="e.g. CSPDCL/NIT/1095"
                            />
                          </label>
                        </div>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold text-slate-700">Overview / Scope Summary</span>
                          <textarea
                            rows={2}
                            className="border border-slate-300 rounded px-2 py-1 bg-white text-xs resize-none"
                            value={editCorrForm.overview}
                            onChange={e => setEditCorrForm(prev => ({ ...prev, overview: e.target.value }))}
                            placeholder="Brief summary of changes..."
                          />
                        </label>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingCorrId(null)}
                            className="secondary-button text-xs py-1 px-2.5"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveEditedCorrigendum}
                            className="primary-button text-xs py-1 px-3 bg-purple-700 hover:bg-purple-800"
                          >
                            Save Details
                          </button>
                        </div>
                      </div>
                    )}

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

  


    
{showConfirmCreate && (
  <div
    className="modal-backdrop"
    style={{
      zIndex: 70,
      backdropFilter: 'blur(5px)',
      background: 'rgba(15, 23, 42, 0.55)',
    }}
  >
    <div
      className="modal"
      style={{
        width: 'min(460px, 94%)',
        borderRadius: '18px',
        overflow: 'hidden',
        boxShadow: '0 25px 70px rgba(0,0,0,0.22)',
        border: '1px solid #e2e8f0',
      }}
    >
      {/* Header */}
      <div
        className="modal-head"
        style={{
          padding: '22px 24px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div>
          <p className="eyebrow" style={{ color: '#64748b' }}>
            TENDER MANAGEMENT
          </p>
          <h2
            className="text-green-700"
            style={{ fontSize: '21px', fontWeight: 700 }}
          >
            Confirm Tender Creation
          </h2>
        </div>

        <button
          onClick={() => setShowConfirmCreate(false)}
          aria-label="Close confirmation"
          style={{
            padding: '7px',
            borderRadius: '8px',
            background: '#e2e8f0',
            color: '#475569',
          }}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '26px 24px' }}>

        {/* Confirmation Icon */}
        <div
          style={{
            width: '58px',
            height: '58px',
            borderRadius: '50%',
            background: '#dcfce7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '18px',
          }}
        >
          <FileCheck
            className="w-7 h-7"
            style={{ color: '#15803d' }}
          />
        </div>

        <h3
          style={{
            fontSize: '17px',
            fontWeight: 700,
            color: '#0f172a',
            marginBottom: '8px',
          }}
        >
          Are you sure?
        </h3>

        <p
          style={{
            fontSize: '13px',
            color: '#64748b',
            lineHeight: '1.7',
            marginBottom: '20px',
          }}
        >
          You are about to create a new tender. Please review the
          details below before proceeding.
        </p>

        {/* Tender Details */}
        {form.title && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '15px',
              marginBottom: '18px',
            }}
          >
            <p
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#64748b',
                marginBottom: '6px',
                letterSpacing: '0.5px',
              }}
            >
              TENDER DETAILS
            </p>

            <p
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#1e293b',
                overflowWrap: 'anywhere',
                marginBottom: '12px',
              }}
            >
              {form.title}
            </p>

            <div
              style={{
                borderTop: '1px solid #e2e8f0',
                paddingTop: '10px',
              }}
            >
              <p style={{ fontSize: '11px', color: '#64748b' }}>
                ISSUING AUTHORITY
              </p>

              <p
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#334155',
                  marginTop: '3px',
                }}
              >
                {form.authority || 'Not specified'}
              </p>
            </div>
          </div>
        )}

        {/* Notice */}
        <div
          style={{
            display: 'flex',
            gap: '9px',
            alignItems: 'flex-start',
            padding: '11px 12px',
            background: '#eff6ff',
            borderRadius: '9px',
            border: '1px solid #dbeafe',
          }}
        >
          <Info
            className="w-4 h-4"
            style={{
              color: '#2563eb',
              flexShrink: 0,
              marginTop: '2px',
            }}
          />

          <p
            style={{
              fontSize: '12px',
              color: '#1e40af',
              lineHeight: '1.6',
            }}
          >
            Confirming will save this tender to the database.
            Please ensure all entered information is correct.
          </p>
        </div>
      </div>

      {/* Footer Actions */}
      <div
        className="modal-actions"
        style={{
          padding: '16px 24px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          gap: '10px',
        }}
      >
        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowConfirmCreate(false)}
          style={{
            borderRadius: '9px',
            padding: '10px 20px',
          }}
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
          style={{
            borderRadius: '9px',
            padding: '10px 22px',
            background: '#15803d',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          Confirm & Create
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
)}

    </>
  )
}
