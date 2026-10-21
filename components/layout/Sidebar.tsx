'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bot,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FolderKanban,
  Globe,
  LayoutDashboard,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  ShieldCheck,
  Upload,
  X,
  Handshake,
  Award,
  Zap,
  Users,
} from 'lucide-react'
import { useTenders } from '@/context/TenderContext'

const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Tender Query', path: '/tender-query', icon: Bot, key: 'Tender Query', badge: 'AI' },
  { label: '1. Tender Details', path: '/tender-details', icon: FileText, key: 'Tender Details' },
  { label: '2. Eligibility Check', path: '/eligibility-check', icon: ClipboardCheck, key: 'Eligibility Check' },
  { label: '3. Sample Details', path: '/sample-details', icon: Package, key: 'Sample Details' },
  { label: '4. EMD Ready', path: '/emd-ready', icon: ShieldCheck, key: 'EMD Ready' },
  { label: '5. Document Ready', path: '/document-ready', icon: FileCheck2, key: 'Document Ready' },
  { label: '6. Document Upload in portal', path: '/document-upload-in-portal', icon: Upload, key: 'Document Upload in portal' },
  { label: '7. Submit in website', path: '/submit-in-website', icon: Globe, key: 'Submit in website' },
  { label: '8. Technical Open Check', path: '/technical-open-check', icon: Settings2, key: 'Technical Open Check' },
  { label: '9. Financial Open Check', path: '/financial-open-check', icon: Zap, key: 'Financial Open Check' },
  { label: '10. Negotiation', path: '/negotiation', icon: Handshake, key: 'Negotiation' },
  { label: '11. Work Order', path: '/work-order', icon: Award, key: 'Work Order' },
  { label: 'All Document', path: '/doc1', icon: FileText, key: 'All Document' },
]

export function Sidebar({
  mobileOpen,
  onCloseMobile,
  collapsed = false,
  onToggleCollapse,
}: {
  mobileOpen: boolean
  onCloseMobile: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const pathname = usePathname()
  const { tenders, logout, currentUser, canAccessPage } = useTenders()
  const [tooltip, setTooltip] = useState<{
    text: string
    top: number
    badge?: string
    count?: number | null
  } | null>(null)

  const getCount = (key?: string) => {
    if (!key) return null
    if (key === 'Tender Details') return tenders.length
    return tenders.filter(t => t.stage === key).length
  }

  const handleMouseEnter = (
    e: React.MouseEvent<HTMLElement>,
    text: string,
    badge?: string,
    count?: number | null
  ) => {
    if (!collapsed) return
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({
      text,
      top: rect.top + rect.height / 2,
      badge,
      count,
    })
  }

  const handleMouseLeave = () => {
    setTooltip(null)
  }

  return (
    <>
      {mobileOpen && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={onCloseMobile}
        />
      )}

      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-open' : ''}`}>
        {/* 1. FIXED HEADER - Does NOT scroll */}
        <div className="sidebar-header">
          <Link href="/" className="brand" onClick={onCloseMobile} title="Tender FMS Workflow Hub">
            <div className="brand-mark">
              <FileCheck2 />
            </div>
            <div className="brand-text">
              <strong>Tender FMS</strong>
              <span>Workflow Hub</span>
            </div>
          </Link>

          <div className="sidebar-header-actions">
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={onToggleCollapse}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onMouseEnter={(e) => handleMouseEnter(e, collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
              onMouseLeave={handleMouseLeave}
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>

            <button
              className="close-mobile"
              aria-label="Close menu"
              onClick={onCloseMobile}
            >
              <X />
            </button>
          </div>
        </div>

        {/* 2. SCROLLABLE NAVIGATION - ONLY this area scrolls */}
        <nav className="sidebar-nav" onScroll={() => tooltip && setTooltip(null)}>
          <p className="sidebar-section-title">Navigation</p>
          {navItems.filter(item => canAccessPage(item.path)).map(item => {
            const Icon = item.icon
            const isActive =
              item.path === '/'
                ? pathname === '/'
                : pathname.startsWith(item.path)
            const count = getCount(item.key)
            const badge = (item as any).badge

            return (
              <Link
                key={item.path}
                href={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  handleMouseLeave()
                  onCloseMobile()
                }}
                onMouseEnter={(e) => handleMouseEnter(e, item.label, badge, count)}
                onMouseLeave={handleMouseLeave}
              >
                <Icon />
                <span className="nav-label">{item.label}</span>
                {badge ? (
                  <>
                    <span className="nav-count bg-gradient-to-r from-blue-600/40 to-indigo-600/40 text-blue-300 font-bold border border-blue-400/40 text-[10px] px-1.5 py-0.5 rounded">
                      {badge}
                    </span>
                    <span className="nav-count-dot" />
                  </>
                ) : count !== null && count > 0 ? (
                  <>
                    <span className="nav-count">{count}</span>
                    <span className="nav-count-dot" />
                  </>
                ) : null}
              </Link>
            )
          })}
        </nav>

        {/* 3. FIXED FOOTER - Does NOT scroll, includes User Management, Settings, Logout, and User Card */}
        <div className="sidebar-footer">
          {/* User Management placed immediately above Settings */}
          {canAccessPage('/user-management') && (
            <Link
              href="/user-management"
              className={`nav-item ${pathname === '/user-management' ? 'active' : ''}`}
              onClick={() => {
                handleMouseLeave()
                onCloseMobile()
              }}
              onMouseEnter={(e) => handleMouseEnter(e, 'User Management')}
              onMouseLeave={handleMouseLeave}
            >
              <Users />
              <span className="nav-label">User Management</span>
            </Link>
          )}

          {canAccessPage('/settings') && (
            <Link
              href="/settings"
              className={`nav-item ${pathname === '/settings' ? 'active' : ''}`}
              onClick={() => {
                handleMouseLeave()
                onCloseMobile()
              }}
              onMouseEnter={(e) => handleMouseEnter(e, 'Settings')}
              onMouseLeave={handleMouseLeave}
            >
              <Settings2 />
              <span className="nav-label">Settings</span>
            </Link>
          )}

          {/* Logout button permanently fixed in footer */}
          <button
            type="button"
            className="nav-item logout-nav"
            onClick={() => {
              handleMouseLeave()
              onCloseMobile()
              logout()
            }}
            onMouseEnter={(e) => handleMouseEnter(e, 'Logout')}
            onMouseLeave={handleMouseLeave}
          >
            <LogOut />
            <span className="nav-label">Logout</span>
          </button>

          <div
            className="profile-card"
            onMouseEnter={(e) =>
              handleMouseEnter(
                e,
                `${currentUser?.username || 'Arjun Sharma'} • ${currentUser?.role || 'Administrator'}`
              )
            }
            onMouseLeave={handleMouseLeave}
          >
            <div className="avatar">
              {(currentUser?.username || 'AS').slice(0, 2).toUpperCase()}
            </div>
            <div className="profile-info">
              <strong className="truncate block max-w-[130px]" title={currentUser?.username || 'Arjun Sharma'}>
                {currentUser?.username || 'Arjun Sharma'}
              </strong>
              <small className="truncate block max-w-[130px]">{currentUser?.role || 'Administrator'}</small>
            </div>
          </div>
        </div>

        {/* Floating Tooltip rendered directly under aside to prevent overflow clipping */}
        {collapsed && tooltip && (
          <div
            className="sidebar-floating-tooltip"
            style={{ top: `${tooltip.top}px` }}
          >
            <span>{tooltip.text}</span>
            {tooltip.badge ? (
              <span className="tooltip-badge">{tooltip.badge}</span>
            ) : tooltip.count !== null && tooltip.count !== undefined && tooltip.count > 0 ? (
              <span className="tooltip-count">{tooltip.count}</span>
            ) : null}
          </div>
        )}
      </aside>
    </>
  )
}
