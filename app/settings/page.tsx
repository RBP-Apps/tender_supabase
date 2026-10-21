'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { CompanyDocumentItem, CompanyMasterDocuments, MasterKey } from '@/types/tender'
import { useTenders } from '@/context/TenderContext'
import {
  addMasterCategoryToSupabase,
  deleteMasterCategoryFromSupabase,
} from '@/lib/supabase-service'
import { dataUrlToBlobUrl } from '@/lib/utils'

function formatBytes(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getDocBadge(name?: string, type?: string) {
  const n = (name || '').toLowerCase()
  if (n.endsWith('.pdf') || type?.includes('pdf')) {
    return <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px]">PDF</span>
  }
  if (n.match(/\.(jpg|jpeg|png|webp|bmp|gif)$/) || type?.includes('image')) {
    return <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-bold text-[10px]">IMAGE</span>
  }
  return <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[10px]">DOCUMENT</span>
}

interface CompanyDocUploadCardProps {
  stepNum: string
  id: string
  title: string
  subtitle: string
  doc: CompanyDocumentItem | null | undefined
  valueLabel: string
  valuePlaceholder: string
  notesLabel: string
  notesPlaceholder: string
  onSave: (doc: CompanyDocumentItem | null) => void
  onPreview: (doc: CompanyDocumentItem, title: string) => void
  notify: (msg: string) => void
}

function CompanyDocUploadCard({
  stepNum,
  id,
  title,
  subtitle,
  doc,
  valueLabel,
  valuePlaceholder,
  notesLabel,
  notesPlaceholder,
  onSave,
  onPreview,
  notify,
}: CompanyDocUploadCardProps) {
  const [val, setVal] = useState(doc?.value || '')
  const [notes, setNotes] = useState(doc?.notes || '')
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (doc) {
      setVal(doc.value || '')
      setNotes(doc.notes || '')
    }
  }, [doc])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(file.name)

    if (!isPdf && !isImage) {
      notify('Please upload a valid PDF or Image file (PDF, PNG, JPG, JPEG, WEBP)')
      return
    }

    if (file.size > 15 * 1024 * 1024) {
      notify('File is larger than 15MB. Please upload a compressed document.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : undefined
      onSave({
        name: file.name,
        size: file.size,
        type: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
        uploadedAt: new Date().toISOString(),
        dataUrl,
        value: val.trim() || doc?.value,
        notes: notes.trim() || doc?.notes,
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSaveDetails = () => {
    if (!doc) return
    onSave({
      ...doc,
      value: val.trim(),
      notes: notes.trim(),
    })
    setIsEditingDetails(false)
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-xs overflow-hidden transition-all hover:border-slate-300">
      {/* Card Header */}
      <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800">
              {stepNum}
            </span>
            <h3 className="text-sm font-bold text-slate-900 m-0">{title}</h3>
            {doc ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Uploaded (PDF / Image)
              </span>
            ) : (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Pending Upload
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {doc ? (
          /* When Document is Uploaded */
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 flex-shrink-0">
                  {getDocBadge(doc.name, doc.type)}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-900 block truncate max-w-[420px]" title={doc.name}>
                    {doc.name}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span>{formatBytes(doc.size)}</span>
                    <span>•</span>
                    <span>Uploaded on {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => onPreview(doc, title)}
                  className="secondary-button text-xs py-1.5 px-2.5 flex items-center gap-1"
                  title="Preview document"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span>Preview</span>
                </button>

                {doc.dataUrl && (
                  <a
                    href={doc.dataUrl}
                    download={doc.name}
                    className="secondary-button text-xs py-1.5 px-2.5 flex items-center gap-1"
                    title="Download document"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-700" />
                    <span>Download</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="secondary-button text-xs py-1.5 px-2.5 flex items-center gap-1"
                  title="Replace with new file"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-slate-700" />
                  <span>Replace</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to remove ${title} (${doc.name})?`)) {
                      onSave(null)
                    }
                  }}
                  className="icon-action delete"
                  title="Remove document"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Document Values / Details */}
            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                  Configured Parameters & Reference
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingDetails(!isEditingDetails)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  <span>{isEditingDetails ? 'Cancel Edit' : 'Edit Details'}</span>
                </button>
              </div>

              {isEditingDetails ? (
                <div className="space-y-2.5 pt-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        {valueLabel}
                      </label>
                      <input
                        value={val}
                        onChange={e => setVal(e.target.value)}
                        placeholder={valuePlaceholder}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        {notesLabel}
                      </label>
                      <input
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder={notesPlaceholder}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleSaveDetails}
                      className="primary-button text-xs py-1.5 px-3"
                    >
                      Save Parameters
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-medium">{valueLabel}</span>
                    <strong className="text-slate-900 block mt-0.5">
                      {doc.value || <span className="text-slate-400 font-normal italic">— None specified —</span>}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-medium">{notesLabel}</span>
                    <span className="text-slate-700 block mt-0.5">
                      {doc.notes || <span className="text-slate-400 font-normal italic">— None specified —</span>}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* When Document is NOT Uploaded */
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  {valueLabel}
                </label>
                <input
                  value={val}
                  onChange={e => setVal(e.target.value)}
                  placeholder={valuePlaceholder}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  {notesLabel}
                </label>
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={notesPlaceholder}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group">
              <div className="w-10 h-10 rounded-full bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center text-blue-600 transition-colors">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="text-center">
                <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700 block">
                  Click to Upload {title} (PDF or Image)
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Supported formats: PDF, JPG, PNG, WEBP (Max 15MB)
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>
        )}

        {/* Hidden File Input for Replace Action */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const {
    masters,
    setMasters,
    selfAccounts,
    saveSelfAccount,
    deleteSelfAccount,
    companyDocs,
    saveCompanyDoc,
    notify,
    supabaseConnected,
    supabaseHealth,
    checkHealth,
    refreshFromDatabase,
    tenders,
  } = useTenders()

  const [testingDb, setTestingDb] = useState(false)

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  const handleTestConnection = async () => {
    setTestingDb(true)
    try {
      const res = await checkHealth()
      if (res.connected) {
        notify(`Supabase Connected successfully! Found ${res.tendersCount} tenders in database.`)
      } else {
        notify(`Supabase check returned error: ${res.error || 'Connection failed'}`)
      }
    } catch (e: any) {
      notify(`Connection error: ${e?.message || 'Failed'}`)
    } finally {
      setTestingDb(false)
    }
  }

  const handleSyncData = async () => {
    setTestingDb(true)
    try {
      await refreshFromDatabase()
      notify('Refreshed all tenders, masters, and accounts from Supabase!')
    } catch (e: any) {
      notify(`Sync error: ${e?.message || 'Failed to refresh'}`)
    } finally {
      setTestingDb(false)
    }
  }

  const labels: Record<MasterKey, string> = {
    states: 'States & Regions',
    departments: 'Departments',
    firms: 'Bidding Firms',
    tenderTypes: 'Tender Types',
  }

  const [selected, setSelected] = useState<MasterKey | 'selfAccounts' | 'companyDocs'>('companyDocs')
  const [newValue, setNewValue] = useState('')

  // State for Document Lightbox Preview Modal
  const [previewDoc, setPreviewDoc] = useState<{
    title: string
    name: string
    type?: string
    size?: number
    dataUrl?: string
  } | null>(null)

  // New Bank Account Form State
  const [newBank, setNewBank] = useState({
    bankName: '',
    accountHolder: '',
    accountNo: '',
    ifsc: '',
    branch: '',
  })

  // Count configured company documents
  const configuredDocsCount = [
    companyDocs?.turnoverDoc,
    companyDocs?.networthDoc,
    companyDocs?.experienceDoc,
  ].filter(Boolean).length

  const handleAdd = () => {
    if (selected === 'selfAccounts' || selected === 'companyDocs') return
    const trimmed = newValue.trim()
    if (!trimmed) return
    if (masters[selected].includes(trimmed)) {
      notify(`'${trimmed}' already exists in ${labels[selected]}`)
      return
    }

    setMasters(prev => ({
      ...prev,
      [selected]: [...prev[selected], trimmed],
    }))
    setNewValue('')
    notify(`Added '${trimmed}' to ${labels[selected]}`)

    addMasterCategoryToSupabase(selected, trimmed).catch(err => {
      console.error('Failed to sync master category to Supabase:', err)
      notify(`Warning: failed to sync '${trimmed}' to Supabase`)
    })
  }

  const handleRemove = (item: string) => {
    if (selected === 'selfAccounts' || selected === 'companyDocs') return
    if (window.confirm(`Delete '${item}' from ${labels[selected]}?`)) {
      setMasters(prev => ({
        ...prev,
        [selected]: prev[selected].filter(x => x !== item),
      }))
      notify(`Removed '${item}' from ${labels[selected]}`)

      deleteMasterCategoryFromSupabase(selected, item).catch(err => {
        console.error('Failed to delete master category from Supabase:', err)
        notify(`Warning: failed to delete '${item}' from Supabase`)
      })
    }
  }

  const handleAddBank = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBank.bankName.trim() || !newBank.accountNo.trim() || !newBank.ifsc.trim()) {
      notify('Please fill Bank Name, Account Number, and IFSC code.')
      return
    }

    saveSelfAccount({
      bankName: newBank.bankName.trim(),
      accountHolder: newBank.accountHolder.trim(),
      accountNo: newBank.accountNo.trim(),
      ifsc: newBank.ifsc.trim().toUpperCase(),
      branch: newBank.branch.trim(),
    })

    setNewBank({
      bankName: '',
      accountHolder: '',
      accountNo: '',
      ifsc: '',
      branch: '',
    })
  }

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONFIGURATION & MASTERS</p>
          <h1>System Settings</h1>
          <p>Configure dropdown options, master categories, corporate bank accounts, and statutory eligibility documents.</p>
        </div>
        <div className={`badge ${supabaseConnected ? 'badge-green' : 'badge-amber'} flex items-center gap-1.5 py-1.5 px-3`}>
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{supabaseConnected ? 'Supabase Connected' : 'Supabase Connecting...'}</span>
        </div>
      </div>

      {/* Supabase Realtime Database Status & Diagnostic Card */}
      <div className="card p-5 mb-6 border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shadow-xs ${
                supabaseConnected
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : 'bg-rose-50 text-rose-600 border border-rose-200'
              }`}
            >
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800">Supabase Cloud Database Connection</h3>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    supabaseConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      supabaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                    }`}
                  />
                  {supabaseConnected ? 'Connected & Live' : 'Not Connected'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-mono truncate max-w-[500px]">
                {supabaseHealth?.url || 'https://vypmvumfxzxvhtqcbmuv.supabase.co'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingDb}
              className="secondary-button text-xs font-semibold flex items-center gap-1.5 py-2 px-3"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingDb ? 'animate-spin' : ''}`} />
              <span>Test Connection</span>
            </button>
            <button
              type="button"
              onClick={handleSyncData}
              disabled={testingDb}
              className="primary-button text-xs font-semibold flex items-center gap-1.5 py-2 px-3"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Force Re-sync DB</span>
            </button>
          </div>
        </div>

        {/* Database Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] font-medium text-slate-500">Tenders in Database</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5">
              {supabaseHealth?.tendersCount ?? tenders.length}
            </p>
            <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> tenders table ok
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] font-medium text-slate-500">Eligibility Check</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5">
              {supabaseHealth?.tables.stage_01_eligibility_check ? 'Active' : 'Checking'}
            </p>
            <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> stage_01 ok
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] font-medium text-slate-500">Master Categories</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5">
              {supabaseHealth?.tables.master_categories ? 'Active' : 'Checking'}
            </p>
            <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> categories synced
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
            <p className="text-[11px] font-medium text-slate-500">Self Bank Accounts</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5">
              {selfAccounts.length}
            </p>
            <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-1">
              <CheckCircle2 className="w-3 h-3" /> accounts synced
            </span>
          </div>

          <div
            className="p-3 rounded-lg bg-slate-50 border border-slate-100 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
            onClick={() => setSelected('companyDocs')}
            title="Click to view and configure Company Eligibility Documents"
          >
            <p className="text-[11px] font-medium text-slate-500">Company Eligibility Docs</p>
            <p className="text-lg font-bold text-blue-700 mt-0.5">
              {configuredDocsCount} / 3
            </p>
            <span className="text-[10px] text-blue-600 font-medium flex items-center gap-1 mt-1">
              <FileCheck2 className="w-3 h-3" /> Turnover, Networth, Exp
            </span>
          </div>
        </div>

        {supabaseHealth?.error && (
          <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Database Notice: </strong>
              <span>{supabaseHealth.error}</span>
            </div>
          </div>
        )}
      </div>

      <div className="card grid lg:grid-cols-[250px_1fr] min-h-[460px] overflow-hidden border border-slate-200">
        {/* Settings Navigation Tabs */}
        <aside className="border-r border-slate-100 p-4 bg-slate-50/70 flex flex-col gap-1">
          {/* Master Categories */}
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2">
            Master Data
          </p>
          {(Object.keys(labels) as MasterKey[]).map(key => {
            const isSel = selected === key
            return (
              <button
                key={key}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  isSel
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
                onClick={() => setSelected(key)}
              >
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  <span>{labels[key]}</span>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                    isSel ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {masters[key].length}
                </span>
              </button>
            )
          })}

          {/* Company Accounts */}
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2 mt-3">
            Company Accounts
          </p>
          <button
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              selected === 'selfAccounts'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
            onClick={() => setSelected('selfAccounts')}
          >
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              <span>Self Bank Accounts</span>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                selected === 'selfAccounts' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {selfAccounts.length}
            </span>
          </button>

          {/* Company Statutory & Eligibility Documents */}
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2 mt-3">
            Company Documents
          </p>
          <button
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              selected === 'companyDocs'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/60'
            }`}
            onClick={() => setSelected('companyDocs')}
          >
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4" />
              <span>Eligibility & Financial Docs</span>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                selected === 'companyDocs' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'
              }`}
            >
              {configuredDocsCount} / 3
            </span>
          </button>
        </aside>

        {/* Content Pane */}
        <div className="p-7">
          {selected === 'companyDocs' ? (
            /* 3 Core Fields: Turnover, Networth, Experience */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 m-0">
                    Company Eligibility & Statutory Documents
                  </h2>
                  <p className="text-xs text-slate-500 m-1">
                    Upload and manage the 3 core company credential documents in PDF or Image format (PNG, JPG, WEBP).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-green text-xs">Persistent Storage</span>
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                    {configuredDocsCount} of 3 Configured
                  </span>
                </div>
              </div>

              {/* Notice / Guidance */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
                <FileCheck2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Permanent Organization Repository:</strong>
                  <p className="text-blue-800/80 mt-0.5">
                    Files uploaded here are saved for your company profile and can be referenced in <strong>Stage 01: Eligibility Check</strong>, <strong>Stage 04: Document Ready</strong>, and bid submission dossiers.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Field 1: Turnover */}
                <CompanyDocUploadCard
                  stepNum="FIELD 01"
                  id="turnoverDoc"
                  title="1. Turnover"
                  subtitle="Audited balance sheets, CA certified annual turnover certificate, or 3-year turnover summary."
                  doc={companyDocs?.turnoverDoc}
                  valueLabel="Annual / Average Turnover (₹ / Cr)"
                  valuePlaceholder="e.g. ₹ 938.73 Cr (3-Year MAAT) or ₹ 1,088.36 Cr"
                  notesLabel="Certificate Reference / Financial Years"
                  notesPlaceholder="e.g. FY 2021-22 to FY 2023-24 • CA Momin & Co."
                  onSave={doc => saveCompanyDoc('turnoverDoc', doc)}
                  onPreview={(doc, title) => setPreviewDoc({ ...doc, title })}
                  notify={notify}
                />

                {/* Field 2: Networth */}
                <CompanyDocUploadCard
                  stepNum="FIELD 02"
                  id="networthDoc"
                  title="2. Networth"
                  subtitle="Chartered Accountant Networth Certificate, capital reserve certificate, or financial solvency proof."
                  doc={companyDocs?.networthDoc}
                  valueLabel="Total Net Worth (₹ / Cr)"
                  valuePlaceholder="e.g. ₹ 482.92 Cr or ₹ 662.80 Cr"
                  notesLabel="Auditor UDIN / Certificate Reference"
                  notesPlaceholder="e.g. UDIN 26135345MAGIVP6707 • CA Hasan Bariawala"
                  onSave={doc => saveCompanyDoc('networthDoc', doc)}
                  onPreview={(doc, title) => setPreviewDoc({ ...doc, title })}
                  notify={notify}
                />

                {/* Field 3: Experience / Work Completion Certificate */}
                <CompanyDocUploadCard
                  stepNum="FIELD 03"
                  id="experienceDoc"
                  title="3. Experience / Work Completion Certificate"
                  subtitle="Client work completion certificates, past execution performance letter, LOA, or work orders."
                  doc={companyDocs?.experienceDoc}
                  valueLabel="Client Authority / Executed Capacity"
                  valuePlaceholder="e.g. APSPDCL (Andhra Pradesh DISCOM) • 36.76 MW Solar"
                  notesLabel="LOA / Certificate Ref & Issue Date"
                  notesPlaceholder="e.g. LOA NREDCAP/PMSG/SC&ST/07/2025/1123 dated 30.06.2026"
                  onSave={doc => saveCompanyDoc('experienceDoc', doc)}
                  onPreview={(doc, title) => setPreviewDoc({ ...doc, title })}
                  notify={notify}
                />
              </div>
            </div>
          ) : selected === 'selfAccounts' ? (
            /* Corporate Bank Accounts */
            <div>
              <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 m-0">Corporate Bank Accounts (Self Accounts)</h2>
                  <p className="text-xs text-slate-500 m-1">
                    Manage your company&apos;s configured bank accounts. These are automatically available in EMD Ready stage.
                  </p>
                </div>
                <span className="badge badge-green">Persistent Storage</span>
              </div>

              {/* Add Account Form */}
              <form onSubmit={handleAddBank} className="p-4 mb-6 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                <h3 className="text-xs font-bold text-slate-800">Add New Company Bank Account</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Bank Name *</label>
                    <input
                      required
                      value={newBank.bankName}
                      onChange={e => setNewBank({ ...newBank, bankName: e.target.value })}
                      placeholder="e.g. State Bank of India"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Account Holder Name</label>
                    <input
                      value={newBank.accountHolder}
                      onChange={e => setNewBank({ ...newBank, accountHolder: e.target.value })}
                      placeholder="e.g. Company Legal Name"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Account Number *</label>
                    <input
                      required
                      value={newBank.accountNo}
                      onChange={e => setNewBank({ ...newBank, accountNo: e.target.value })}
                      placeholder="e.g. 38920194821"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">IFSC Code *</label>
                    <input
                      required
                      value={newBank.ifsc}
                      onChange={e => setNewBank({ ...newBank, ifsc: e.target.value.toUpperCase() })}
                      placeholder="e.g. SBIN0001234"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono uppercase text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">Branch Name</label>
                    <input
                      value={newBank.branch}
                      onChange={e => setNewBank({ ...newBank, branch: e.target.value })}
                      placeholder="e.g. Industrial Area Branch"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button type="submit" className="primary-button text-xs py-1.5 px-3">
                    <Plus className="w-3.5 h-3.5" /> Save Corporate Account
                  </button>
                </div>
              </form>

              {/* List of Configured Accounts */}
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {selfAccounts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 italic bg-white">
                    No corporate bank accounts configured yet. Add your company&apos;s bank account above.
                  </div>
                ) : (
                  selfAccounts.map(account => (
                    <div
                      key={account.accountNo}
                      className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <strong className="text-xs text-slate-900 block">{account.bankName}</strong>
                        <span className="text-[11px] text-slate-600 font-mono">
                          A/c: {account.accountNo} • IFSC: {account.ifsc}
                          {account.branch ? ` • Branch: ${account.branch}` : ''}
                        </span>
                        {account.accountHolder && (
                          <small className="text-[10px] text-slate-400 block">{account.accountHolder}</small>
                        )}
                      </div>
                      <button
                        className="icon-action delete"
                        title={`Delete account ${account.accountNo}`}
                        onClick={() => {
                          if (window.confirm(`Delete account ${account.bankName} (${account.accountNo})?`)) {
                            deleteSelfAccount(account.accountNo)
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Master Categories */
            <div>
              <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 m-0">{labels[selected]}</h2>
                  <p className="text-xs text-slate-500 m-1">
                    These values are populated in dropdown menus throughout tender forms.
                  </p>
                </div>
                <span className="badge badge-blue">Active Master</span>
              </div>

              {/* Add input */}
              <div className="flex gap-2 max-w-md mb-6">
                <input
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder={`Add new ${labels[selected].toLowerCase()}...`}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-xs flex-1 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button className="primary-button text-xs py-2" onClick={handleAdd}>
                  <Plus className="w-3.5 h-3.5" /> Add Value
                </button>
              </div>

              {/* List of items */}
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {masters[selected].map(item => (
                  <div
                    key={item}
                    className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-xs font-medium text-slate-700">{item}</span>
                    <button
                      className="icon-action delete"
                      title={`Delete ${item}`}
                      onClick={() => handleRemove(item)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox / Preview Modal for PDF and Images */}
      {previewDoc && (
        <div className="modal-backdrop">
          <div className="modal modal-wide" style={{ maxWidth: '850px' }}>
            <div className="modal-head">
              <div className="flex items-center gap-2">
                {getDocBadge(previewDoc.name, previewDoc.type)}
                <div>
                  <h2 className="text-base font-bold text-slate-900 m-0">{previewDoc.title}</h2>
                  <p className="text-xs text-slate-500 font-mono m-0 mt-0.5">{previewDoc.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {previewDoc.dataUrl && (
                  <a
                    href={previewDoc.dataUrl}
                    download={previewDoc.name}
                    className="secondary-button text-xs py-1.5 px-3 flex items-center gap-1.5"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                )}
                <button type="button" onClick={() => setPreviewDoc(null)} title="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-100 flex items-center justify-center min-h-[380px] max-h-[75vh] overflow-auto">
              {previewDoc.dataUrl ? (
                previewDoc.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp|gif)$/i.test(previewDoc.name) ? (
                  <img
                    src={previewDoc.dataUrl}
                    alt={previewDoc.name}
                    className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-md bg-white p-2"
                  />
                ) : (
                  <iframe
                    src={dataUrlToBlobUrl(previewDoc.dataUrl)}
                    className="w-full h-[70vh] rounded-lg border border-slate-300 bg-white shadow-sm"
                    title={previewDoc.name}
                  />
                )
              ) : (
                <div className="text-center p-8 text-slate-500">
                  <FileText className="w-12 h-12 mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-semibold">Preview not available for this file.</p>
                </div>
              )}
            </div>

            <div className="modal-foot justify-between">
              <span className="text-xs text-slate-500">
                {previewDoc.size ? formatBytes(previewDoc.size) : ''}
              </span>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="secondary-button text-xs py-1.5 px-4"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
