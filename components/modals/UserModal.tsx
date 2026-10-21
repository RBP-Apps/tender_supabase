'use client'

import React, { useState, useId } from 'react'
import {
  X,
  User,
  Lock,
  Phone,
  Mail,
  Shield,
  Layers,
  Check,
  CheckSquare,
  Square,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react'
import { AppUser, APP_MODULES, UserFormData, UserRole } from '@/types/user'

interface UserModalProps {
  mode: 'create' | 'edit'
  user?: AppUser | null
  onClose: () => void
  onSave: (userData: UserFormData) => Promise<void>
}

const ROLES: { role: UserRole; desc: string; badgeClass: string }[] = [
  {
    role: 'Administrator',
    desc: 'Full system access across all stages, user management, and system settings.',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    role: 'Tender Manager',
    desc: 'Manage all tender stages, pricing, bidding, and stage progression.',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    role: 'Tender Executive',
    desc: 'Upload documents, fill stage verification checklists, and inspect tenders.',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    role: 'Auditor / Viewer',
    desc: 'Read-only access to view tender dossiers, documents, and audit trails.',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
  },
]

export function UserModal({ mode, user, onClose, onSave }: UserModalProps) {
  const isEdit = mode === 'edit'
  const isPrimaryAdmin = !!user?.isPrimaryAdmin

  const [username, setUsername] = useState(user?.username || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mobileNumber, setMobileNumber] = useState(user?.mobileNumber || '')
  const [email, setEmail] = useState(user?.email || '')
  const [role, setRole] = useState<UserRole>(user?.role || 'Tender Executive')
  const [isActive, setIsActive] = useState<boolean>(user?.isActive ?? true)
  const [pageAccess, setPageAccess] = useState<string[]>(() => {
    if (user?.pageAccess) return [...user.pageAccess]
    if (role === 'Administrator') return APP_MODULES.map(m => m.path)
    return [
      '/',
      '/tender-details',
      '/eligibility-check',
      '/sample-details',
      '/emd-ready',
      '/document-ready',
      '/document-upload-in-portal',
      '/doc1',
    ]
  })

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Toggle single page
  const togglePage = (path: string) => {
    setPageAccess(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    )
  }

  // Select all
  const selectAllPages = () => {
    setPageAccess(APP_MODULES.map(m => m.path))
  }

  // Deselect all
  const clearAllPages = () => {
    setPageAccess([])
  }

  // Apply Role Presets
  const applyRolePreset = (selectedRole: UserRole) => {
    setRole(selectedRole)
    if (selectedRole === 'Administrator') {
      setPageAccess(APP_MODULES.map(m => m.path))
    } else if (selectedRole === 'Tender Manager') {
      setPageAccess(
        APP_MODULES.filter(m => m.path !== '/settings' && m.path !== '/user-management').map(
          m => m.path
        )
      )
    } else if (selectedRole === 'Tender Executive') {
      setPageAccess([
        '/',
        '/tender-details',
        '/eligibility-check',
        '/sample-details',
        '/emd-ready',
        '/document-ready',
        '/document-upload-in-portal',
        '/doc1',
      ])
    } else {
      // Viewer
      setPageAccess(['/', '/tender-query', '/tender-details', '/doc1'])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const cleanUsername = username.trim()
    if (!cleanUsername) {
      setError('Username is required.')
      return
    }

    if (!isEdit && !password.trim()) {
      setError('Password is required when creating a new user.')
      return
    }

    if (password && password.length < 4) {
      setError('Password must be at least 4 characters.')
      return
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }

    try {
      setSubmitting(true)
      await onSave({
        username: cleanUsername,
        password: password.trim() || undefined,
        mobileNumber: mobileNumber.trim() || undefined,
        email: email.trim().toLowerCase() || undefined,
        role: isPrimaryAdmin ? 'Administrator' : role,
        pageAccess: isPrimaryAdmin ? APP_MODULES.map(m => m.path) : pageAccess,
        isActive: isPrimaryAdmin ? true : isActive,
      })
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to save user. Please check entered details.')
    } finally {
      setSubmitting(false)
    }
  }

  // Categories
  const categories: ('Overview' | 'Tender Workflow' | 'Documentation' | 'System')[] = [
    'Overview',
    'Tender Workflow',
    'Documentation',
    'System',
  ]

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden my-auto animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">
                {isEdit ? `Edit User: ${user?.username}` : 'Create New User'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isEdit
                  ? 'Update user credentials, role, and granular module access.'
                  : 'Add a new member, configure role, and select permitted application pages.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 p-2 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isPrimaryAdmin && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-800 flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-600 flex-shrink-0" />
              <span>
                <strong>Primary Administrator:</strong> This account has permanent Administrator privileges
                and full access to all system modules.
              </span>
            </div>
          )}

          {/* Section 1: User Credentials */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" />
              1. User Credentials
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Username (Required) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Username <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="e.g. arjun.sharma"
                    disabled={isPrimaryAdmin}
                    className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Used for workspace login. Must be unique.
                </p>
              </div>

              {/* Password (Required for create, optional for edit) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Password {!isEdit && <span className="text-red-500">*</span>}
                  {isEdit && <span className="text-slate-400 font-normal"> (Leave blank to keep unchanged)</span>}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!isEdit}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={isEdit ? '••••••••' : 'Enter strong password'}
                    className="w-full border border-slate-300 rounded-lg pl-9 pr-9 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Stored securely using SHA-256 encryption.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Contact Information (Optional) */}
          <div className="space-y-4 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-blue-600" />
              2. Contact Information <span className="text-slate-400 font-normal lowercase">(optional)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mobile Number (Optional) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Mobile Number <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={e => setMobileNumber(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Email (Optional) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Email Address <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="user@company.com"
                    className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Role & Status */}
          <div className="space-y-4 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              3. Role & Account Status
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Role Selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Application Role
                </label>
                <select
                  value={role}
                  disabled={isPrimaryAdmin}
                  onChange={e => applyRolePreset(e.target.value as UserRole)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium disabled:bg-slate-100"
                >
                  {ROLES.map(r => (
                    <option key={r.role} value={r.role}>
                      {r.role}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  {ROLES.find(r => r.role === role)?.desc}
                </p>
              </div>

              {/* Account Status Toggle */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Account Status
                </label>
                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      disabled={isPrimaryAdmin}
                      onChange={e => setIsActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                  <div>
                    <span
                      className={`text-xs font-bold ${
                        isActive ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {isActive ? 'Active User' : 'Deactivated'}
                    </span>
                    <p className="text-[10px] text-slate-400">
                      {isActive
                        ? 'User can log in and access permitted pages.'
                        : 'User is blocked from signing in.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Page Access & Module Permissions */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  4. Page Access & Module Permissions
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Select which application pages and workflow modules this user is permitted to view.
                </p>
              </div>

              {!isPrimaryAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllPages}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded border border-blue-200 flex items-center gap-1"
                  >
                    <CheckSquare className="w-3 h-3" /> Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearAllPages}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 px-2 py-1 rounded border border-slate-200 flex items-center gap-1"
                  >
                    <Square className="w-3 h-3" /> Clear All
                  </button>
                </div>
              )}
            </div>

            <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 space-y-4">
              {categories.map(cat => {
                const modules = APP_MODULES.filter(m => m.category === cat)
                if (modules.length === 0) return null
                return (
                  <div key={cat} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                        {cat}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {modules.filter(m => pageAccess.includes(m.path)).length} of {modules.length} enabled
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {modules.map(mod => {
                        const isChecked = isPrimaryAdmin || pageAccess.includes(mod.path)
                        return (
                          <label
                            key={mod.key}
                            className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                              isChecked
                                ? 'bg-white border-blue-300 shadow-xs'
                                : 'bg-white/60 border-slate-200 hover:border-slate-300 opacity-75'
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={isPrimaryAdmin}
                              checked={isChecked}
                              onChange={() => togglePage(mod.path)}
                              className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <div className="min-w-0">
                              <span className="font-bold text-slate-800 block truncate">
                                {mod.name}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono block">
                                {mod.path}
                              </span>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </form>

        {/* Modal Actions */}
        <div className="flex items-center justify-between p-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="text-xs text-slate-500">
            <strong>{isPrimaryAdmin ? APP_MODULES.length : pageAccess.length}</strong> of {APP_MODULES.length} modules granted
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="secondary-button text-xs py-2 px-4"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="primary-button text-xs py-2 px-5 bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              {submitting ? 'Saving...' : isEdit ? 'Update User' : 'Create User'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
