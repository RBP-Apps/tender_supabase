'use client'

import React, { useState } from 'react'
import {
  X,
  User,
  Shield,
  Phone,
  Mail,
  Calendar,
  Lock,
  Layers,
  CheckCircle2,
  XCircle,
  KeyRound,
  ShieldAlert,
  Eye,
  EyeOff,
} from 'lucide-react'
import { AppUser, APP_MODULES } from '@/types/user'

interface ViewUserModalProps {
  user: AppUser
  onClose: () => void
  onEdit?: () => void
}

export function ViewUserModal({ user, onClose, onEdit }: ViewUserModalProps) {
  const [showPassword, setShowPassword] = useState(false)
  const permittedModules = APP_MODULES.filter(m => user.pageAccess?.includes(m.path))
  const initials = user.username.slice(0, 2).toUpperCase()

  const roleBadgeStyle: Record<string, string> = {
    Administrator: 'bg-purple-100 text-purple-800 border-purple-200',
    'Tender Manager': 'bg-blue-100 text-blue-800 border-blue-200',
    'Tender Executive': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'Auditor / Viewer': 'bg-slate-100 text-slate-800 border-slate-200',
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden my-auto animate-scale-in">
        {/* Header with profile banner */}
        <div className="p-6 bg-gradient-to-r from-slate-900 to-blue-950 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-500 text-white flex items-center justify-center font-extrabold text-2xl shadow-lg border border-white/20">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">{user.username}</h2>
                {user.isPrimaryAdmin && (
                  <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/40 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Shield className="w-3 h-3" /> Primary Admin
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${
                    roleBadgeStyle[user.role] || 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {user.role}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                    user.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {user.isActive ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" /> Active Account
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3" /> Deactivated
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700">
          {/* Contact & Meta Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Mail className="w-3 h-3" /> Email Address
              </span>
              <p className="font-semibold text-slate-800 text-xs truncate">
                {user.email || '— Not Provided —'}
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Phone className="w-3 h-3" /> Mobile Number
              </span>
              <p className="font-semibold text-slate-800 text-xs">
                {user.mobileNumber || '— Not Provided —'}
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <KeyRound className="w-3 h-3 text-blue-600" /> Password
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {showPassword ? <EyeOff className="w-3 h-3 text-blue-600" /> : <Eye className="w-3 h-3 text-blue-600" />}
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <p className="font-mono text-slate-800 text-xs font-semibold">
                {showPassword ? (user.passwordPlain || '••••••••') : '••••••••'}
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Account Created
              </span>
              <p className="font-semibold text-slate-800 text-xs">
                {new Date(user.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {/* Permitted Pages Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                Permitted Pages & Modules
              </h3>
              <span className="text-[11px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-200">
                {permittedModules.length} of {APP_MODULES.length} Accessible
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
              {APP_MODULES.map(mod => {
                const hasAccess = user.isPrimaryAdmin || user.pageAccess?.includes(mod.path)
                return (
                  <div
                    key={mod.key}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                      hasAccess
                        ? 'bg-white border border-emerald-200 text-slate-800'
                        : 'bg-white/40 border border-slate-200 text-slate-400 opacity-60'
                    }`}
                  >
                    <span className="font-semibold truncate mr-2">{mod.name}</span>
                    {hasAccess ? (
                      <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" /> Allowed
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400">Restricted</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="secondary-button text-xs py-2 px-4"
          >
            Close
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onEdit()
              }}
              className="primary-button text-xs py-2 px-4 bg-blue-600 hover:bg-blue-700"
            >
              Edit User Details
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
