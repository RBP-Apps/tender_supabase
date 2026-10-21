'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, ChevronDown, Database, Menu } from 'lucide-react'
import { useTenders } from '@/context/TenderContext'

const routeTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/tender-query': 'Tender Query',
  '/tender-details': 'Tender Details',
  '/eligibility-check': 'Eligibility Check',
  '/sample-details': 'Sample Details',
  '/emd-ready': 'EMD Ready',
  '/document-ready': 'Document Ready',
  '/document-upload-in-portal': 'Document Upload in portal',
  '/submit-in-website': 'Submit in website',
  '/technical-open-check': 'Technical Open Check',
  '/financial-open-check': 'Financial Open Check',
  '/negotiation': 'Negotiation',
  '/work-order': 'Work Order',
  '/doc1': 'All Document',
  '/settings': 'Settings',
}

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const pathname = usePathname()
  const title = routeTitles[pathname] || 'Tender FMS'
  const { supabaseConnected } = useTenders()

  return (
    <header className="topbar">
      <div className="flex items-center gap-3">
        <button
          className="mobile-menu"
          aria-label="Open menu"
          onClick={onOpenMobile}
        >
          <Menu />
        </button>
        <div className="breadcrumbs">
          <span>Tender FMS</span>
          <span>/</span>
          <strong>{title}</strong>
        </div>
      </div>

      <div className="top-actions flex items-center gap-3">
        <Link
          href="/settings"
          title="Supabase Cloud Database Status (Click to inspect)"
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
            supabaseConnected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${supabaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <Database className="w-3.5 h-3.5" />
          <span>{supabaseConnected ? 'Supabase Live' : 'Supabase Connecting...'}</span>
        </Link>

        <button className="icon-button" aria-label="Notifications">
          <Bell />
          <i />
        </button>
        <div className="flex items-center gap-2 text-slate-500 cursor-pointer">
          <div className="avatar">AS</div>
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>
    </header>
  )
}
