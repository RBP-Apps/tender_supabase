'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  LogIn,
  ShieldAlert,
  AlertCircle,
  Lock,
  User,
} from 'lucide-react'
import { useTenders } from '@/context/TenderContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { hydrated, loggedIn, login, toast, currentUser, canAccessPage } = useTenders()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  // Load sidebar collapsed preference from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('tender_fms_sidebar_collapsed')
      if (saved === 'true') {
        setSidebarCollapsed(true)
      }
    } catch (e) {
      // ignore
    }
  }, [])

  // Automatically ensure sidebar stays expanded and never hidden on Tender Query page
  useEffect(() => {
    if (pathname === '/tender-query') {
      setSidebarCollapsed(false)
      try {
        sessionStorage.setItem('tender_fms_sidebar_collapsed', 'false')
      } catch (e) {
        // ignore
      }
    }
  }, [pathname])

  const handleToggleCollapse = () => {
    setSidebarCollapsed(prev => {
      const next = !prev
      try {
        sessionStorage.setItem('tender_fms_sidebar_collapsed', String(next))
      } catch (e) {
        // ignore
      }
      return next
    })
  }

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)
    try {
      const res = await login(usernameOrEmail, password)
      if (!res.success) {
        setLoginError(res.error || 'Login failed. Please check credentials.')
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Login failed.')
    } finally {
      setLoginLoading(false)
    }
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-blue-400 gap-3">
        <FileCheck2 className="w-10 h-10 animate-bounce" />
        <span className="font-semibold tracking-wide text-slate-200">Initializing Tender FMS...</span>
      </div>
    )
  }

  if (!loggedIn) {
    return (
      <main className="min-h-screen grid lg:grid-cols-2 bg-white">
        <section className="bg-slate-900 p-12 lg:p-20 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <FileCheck2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <strong className="block text-lg">Tender FMS</strong>
              <span className="text-xs text-blue-400 tracking-wider uppercase font-semibold">Workflow Engine</span>
            </div>
          </div>
          <div className="max-w-md my-12">
            <p className="text-blue-400 font-bold text-xs tracking-wider uppercase mb-3">TENDER OPERATIONS SIMPLIFIED</p>
            <h1 className="text-4xl font-extrabold tracking-tight leading-tight text-white mb-4">
              Move every tender forward with speed and precision.
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Complete workflow tracking from Eligibility verification to Financial Bid Opening.
            </p>
          </div>
          <div className="border-t border-slate-800 pt-6 flex items-center gap-6">
            <div>
              <strong className="text-2xl font-bold text-white block">100%</strong>
              <span className="text-xs text-slate-400">Database & Local Sync</span>
            </div>
            <div className="w-px h-8 bg-slate-800" />
            <div>
              <strong className="text-2xl font-bold text-white block">11 Stages</strong>
              <span className="text-xs text-slate-400">Milestone Pipeline</span>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center p-8 lg:p-16">
          <div className="w-full max-w-sm">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
              <LogIn className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Sign in to Tender FMS</h2>
            <p className="text-slate-500 text-xs mb-6">Enter your username or email and password to access your workspace.</p>

            {loginError && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
                Username or Email
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="text"
                    value={usernameOrEmail}
                    onChange={e => setUsernameOrEmail(e.target.value)}
                    placeholder="admin or user@company.com"
                    required
                    className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
                Password
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={loginLoading}
                className="primary-button w-full py-3 mt-2 bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                {loginLoading ? 'Signing in...' : 'Sign in to Workspace'} <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </section>
      </main>
    )
  }

  const isPageAllowed = canAccessPage(pathname)
  const isSidebarCollapsed = pathname === '/tender-query' ? false : sidebarCollapsed

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      <div className={`main-content ${isSidebarCollapsed ? 'content-expanded' : ''}`}>
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        {!isPageAllowed ? (
          <section className="page flex flex-col items-center justify-center min-h-[60vh] text-center p-6 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mb-4 shadow-sm">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <span className="text-[11px] font-bold tracking-wider uppercase text-amber-700 bg-amber-100/70 border border-amber-300/50 px-2.5 py-0.5 rounded-full mb-2">
              Access Restricted
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Module Access Not Permitted</h1>
            <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-6">
              Your account (<strong>{currentUser?.username || 'Current User'}</strong> · <em>{currentUser?.role || 'User'}</em>) does not have permission to view <code className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">{pathname}</code>.
              Please contact an administrator to request access.
            </p>
            <div className="flex items-center gap-3">
              <Link href="/" className="primary-button text-xs py-2.5 px-4 bg-blue-600 hover:bg-blue-700">
                Return to Dashboard
              </Link>
            </div>
          </section>
        ) : (
          children
        )}
      </div>

      {toast && (
        <div className="toast">
          <CheckCircle2 className="w-5 h-5" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  )
}

