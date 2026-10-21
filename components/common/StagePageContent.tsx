'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, FileText, Filter, Plus, Search } from 'lucide-react'
import { Stage, Tender } from '@/types/tender'
import { stagesList, useTenders } from '@/context/TenderContext'
import { TenderTable } from '@/components/tables/TenderTable'
import { TenderModal } from '@/components/modals/TenderModal'

interface StagePageContentProps {
  stage: Stage
  description: string
  stageNumber: number
}

export function StagePageContent({
  stage,
  description,
  stageNumber,
}: StagePageContentProps) {
  const { tenders, masters, updateTender, deleteTender, advanceStage } = useTenders()
  const router = useRouter()
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<{ mode: 'edit' | 'process'; tender: Tender } | null>(null)

  const stageTenders = useMemo(() => {
    return tenders.filter(t => t.stage === stage)
  }, [tenders, stage])

  const filtered = useMemo(() => {
    const list =
      tab === 'completed'
        ? stageTenders.filter(t => t.status === 'Completed')
        : stageTenders.filter(t => t.status !== 'Completed')

    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter(
      t =>
        t.title.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.authority.toLowerCase().includes(q) ||
        t.department.toLowerCase().includes(q)
    )
  }, [stageTenders, tab, query])

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

  const nextStage =
    stageNumber < stagesList.length ? stagesList[stageNumber].label : null

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKFLOW STAGE 0{stageNumber}</p>
          <h1>{stage}</h1>
          <p>{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/tender-details" className="secondary-button text-xs">
            View All Tenders
          </Link>
          <div className="badge badge-blue py-2 px-3 text-xs font-semibold">
            {stageTenders.length} active in this stage
          </div>
        </div>
      </div>

      <div className="card list-card">
        <div className="tabs">
          <button
            className={tab === 'pending' ? 'tab active' : 'tab'}
            onClick={() => setTab('pending')}
          >
            Pending Action{' '}
            <span>{stageTenders.filter(t => t.status !== 'Completed').length}</span>
          </button>
          <button
            className={tab === 'completed' ? 'tab active' : 'tab'}
            onClick={() => setTab('completed')}
          >
            Completed / History{' '}
            <span>{stageTenders.filter(t => t.status === 'Completed').length}</span>
          </button>
        </div>

        <div className="filters-bar">
          <div className="search-box">
            <Search />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search in ${stage}...`}
            />
          </div>
        </div>

        <TenderTable
          tenders={filtered}
          onProcess={t => setModal({ mode: 'process', tender: t })}
          onEdit={tab === 'completed' ? (t => setModal({ mode: 'edit', tender: t })) : undefined}
          onDelete={id => {
            if (window.confirm('Delete this tender record?')) {
              deleteTender(id)
            }
          }}
          history={tab === 'completed'}
          emptyMessage={`No tenders currently in '${stage}'. Advance a tender from the previous stage or create a new tender in Tender Details.`}
          showCreateButton={stageTenders.length === 0}
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
