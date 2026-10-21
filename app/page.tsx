'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  FolderKanban,
  Sparkles,
} from 'lucide-react'
import { useTenders, stagesList } from '@/context/TenderContext'
import { TenderTable } from '@/components/tables/TenderTable'
import { TenderModal } from '@/components/modals/TenderModal'
import { Tender } from '@/types/tender'

export default function DashboardPage() {
  const { tenders, masters, updateTender, deleteTender, advanceStage } = useTenders()
  const router = useRouter()
  const [modal, setModal] = useState<{ mode: 'edit' | 'process'; tender: Tender } | null>(null)

  const activeCount = tenders.length
  const readyCount = tenders.filter(t => t.status === 'Ready').length
  const atRiskCount = tenders.filter(t => t.status === 'At Risk').length
  const completedCount = tenders.filter(t => t.status === 'Completed').length

  const handleSaveModal = (saved: Tender) => {
    if (modal?.mode === 'edit') {
      updateTender(saved.id, saved)
      setModal(null)
      router.push(`/tender-documents/${encodeURIComponent(saved.id)}`)
      return
    } else if (modal?.mode === 'process') {
      advanceStage(saved.id, saved.stage, saved.status, saved.remarks)
    }
    setModal(null)
  }

  return (
    <section className="page">
      {/* Requirement 1: 'Add new tender' button REMOVED from Dashboard */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">TENDER OPERATIONS DASHBOARD</p>
          <h1>Overview & Pipeline</h1>
          <p>Real-time workflow monitoring across all tender milestones.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/bid-dossier"
            className="flex items-center gap-2 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-md shadow-blue-600/30 transition-all hover:scale-105"
          >
            <FolderKanban className="w-4 h-4" />
            <span>Rotomag Bid Dossier (5 Docs)</span>
          </Link>
          <Link href="/tender-details" className="secondary-button text-xs font-semibold">
            Manage All Tenders <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi card">
          <div className="kpi-icon blue">
            <FileText />
          </div>
          <div>
            <p>Total Tenders</p>
            <strong>{String(activeCount).padStart(2, '0')}</strong>
            <small>Active workspace records</small>
          </div>
        </div>

        <div className="kpi card">
          <div className="kpi-icon green">
            <CheckCircle2 />
          </div>
          <div>
            <p>Ready for Next Action</p>
            <strong>{String(readyCount).padStart(2, '0')}</strong>
            <small>Verification complete</small>
          </div>
        </div>

        <div className="kpi card">
          <div className="kpi-icon red">
            <AlertCircle />
          </div>
          <div>
            <p>At Risk / Attention</p>
            <strong>{String(atRiskCount).padStart(2, '0')}</strong>
            <small>Urgent compliance needed</small>
          </div>
        </div>

        <div className="kpi card">
          <div className="kpi-icon amber">
            <CalendarDays />
          </div>
          <div>
            <p>Completed Workflow</p>
            <strong>{String(completedCount).padStart(2, '0')}</strong>
            <small>Final evaluations done</small>
          </div>
        </div>
      </div>

      {/* Dashboard Main Grid */}
      <div className="dashboard-grid">
        {/* Pipeline Distribution Card */}
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Tender Pipeline ({stagesList.length} Stages)</h2>
              <p>Stage-by-stage distribution</p>
            </div>
            <Link href="/tender-details" className="text-link">
              View All <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="pipeline">
            {stagesList.map((stage, idx) => {
              const count = tenders.filter(t => t.stage === stage.label).length
              const percentage = activeCount > 0 ? (count / activeCount) * 100 : 0

              return (
                <Link
                  href={stage.path}
                  key={stage.label}
                  className="pipeline-row"
                >
                  <div className="stage-icon-box">
                    <span className="text-xs font-bold">{idx + 1}</span>
                  </div>
                  <span className="font-medium">{stage.short}</span>
                  <div className="bar-track">
                    <i
                      className="bar-fill"
                      style={{ width: `${Math.max(count > 0 ? 10 : 0, percentage)}%` }}
                    />
                  </div>
                  <span className="pipeline-count">{count}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </Link>
              )
            })}
          </div>
        </div>

        {/* Upcoming Due Dates Card */}
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Upcoming Deadlines</h2>
              <p>Tenders requiring submission</p>
            </div>
            <CalendarDays className="w-4 h-4 text-slate-400" />
          </div>
          <div className="p-4 flex flex-col gap-3">
            {tenders.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No tender deadlines scheduled yet.
              </div>
            ) : (
              tenders.slice(0, 5).map(t => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-white border border-slate-200 flex flex-col items-center justify-center font-bold text-slate-700 leading-tight">
                      <span className="text-sm">
                        {t.due ? new Date(t.due).getDate() : '--'}
                      </span>
                      <span className="text-[9px] uppercase text-slate-400 font-semibold">
                        {t.due
                          ? new Date(t.due).toLocaleDateString('en-IN', { month: 'short' })
                          : ''}
                      </span>
                    </div>
                    <div>
                      <strong className="block text-xs text-slate-800 font-semibold">
                        {t.title}
                      </strong>
                      <small className="text-slate-500 text-[11px]">
                        {t.id} · {t.authority}
                      </small>
                    </div>
                  </div>
                  <span className="badge badge-blue text-[11px] font-semibold">{t.stage}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Requirement 4: Fixed 400px Table with Action as Column 1 */}
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Recent Tenders Activity</h2>
            <p>Fixed 400px scrollable view with pinned header</p>
          </div>
          <Link href="/tender-details" className="text-link">
            Tender Details <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <TenderTable
          tenders={tenders}
          onProcess={t => setModal({ mode: 'process', tender: t })}
          onEdit={t => setModal({ mode: 'edit', tender: t })}
          onDelete={id => {
            if (window.confirm('Delete this tender?')) {
              deleteTender(id)
            }
          }}
          emptyMessage="No tenders added yet. Click below to add your first tender in Tender Details."
          showCreateButton={true}
        />
      </div>

      {modal && (
        <TenderModal
          mode={modal.mode}
          tender={modal.tender}
          masters={masters}
          onClose={() => setModal(null)}
          onSave={handleSaveModal}
        />
      )}
    </section>
  )
}
