'use client'

import React, { useState, useMemo } from 'react'
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Phone,
  Mail,
  Calendar,
  Lock,
  Layers,
  CheckCircle2,
  XCircle,
  Eye,
  Pencil,
  Trash2,
  AlertTriangle,
  Filter,
  ShieldCheck,
  Check,
} from 'lucide-react'
import { useTenders } from '@/context/TenderContext'
import { AppUser, APP_MODULES, UserFormData, UserRole } from '@/types/user'
import { UserModal } from '@/components/modals/UserModal'
import { ViewUserModal } from '@/components/modals/ViewUserModal'

const ROLE_BADGE: Record<string, string> = {
  Administrator: 'bg-purple-100 text-purple-800 border-purple-200',
  'Tender Manager': 'bg-blue-100 text-blue-800 border-blue-200',
  'Tender Executive': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Auditor / Viewer': 'bg-slate-100 text-slate-800 border-slate-200',
}

export default function UserManagementPage() {
  const {
    users,
    currentUser,
    addUser,
    updateUser,
    deleteUser,
    notify,
  } = useTenders()

  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('All')

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editUser, setEditUser] = useState<AppUser | null>(null)
  const [viewUser, setViewUser] = useState<AppUser | null>(null)
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<AppUser | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Filter users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Role filter
      if (roleFilter !== 'All' && user.role !== roleFilter) {
        return false
      }

      // Search query (username, email, or mobile number)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchUsername = user.username.toLowerCase().includes(q)
        const matchEmail = (user.email || '').toLowerCase().includes(q)
        const matchMobile = (user.mobileNumber || '').includes(q)
        const matchRole = user.role.toLowerCase().includes(q)
        if (!matchUsername && !matchEmail && !matchMobile && !matchRole) {
          return false
        }
      }

      return true
    })
  }, [users, roleFilter, searchQuery])

  // Summary Metrics
  const totalUsers = users.length
  const activeCount = users.filter(u => u.isActive).length
  const adminCount = users.filter(u => u.role === 'Administrator').length

  // Handlers
  const handleCreate = async (formData: UserFormData) => {
    await addUser(formData)
  }

  const handleUpdate = async (formData: UserFormData) => {
    if (!editUser) return
    await updateUser(editUser.id, formData)
    setEditUser(null)
  }

  const handleDelete = async () => {
    if (!deleteConfirmUser) return
    try {
      setDeleteLoading(true)
      await deleteUser(deleteConfirmUser.id)
      setDeleteConfirmUser(null)
    } catch (err: any) {
      notify(err?.message || 'Could not delete user.')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <section className="page animate-fade-in">
      {/* 1. Page Header */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">SYSTEM & ACCESS CONTROL</p>
          <h1 className="flex items-center gap-2.5">
            <Users className="w-8 h-8 text-blue-600" />
            User Management
          </h1>
          <p>
            Create users, set passwords, assign roles, and grant granular page access permissions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="badge badge-blue py-2 px-3 text-xs font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>{activeCount} Active / {totalUsers} Users</span>
          </div>

          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="primary-button text-xs py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 flex items-center gap-1.5 shadow-md"
          >
            <UserPlus className="w-4 h-4" />
            Create New User
          </button>
        </div>
      </div>

      {/* 2. Metrics & Search Filter Bar */}
      <div className="card p-4 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by username, email, or mobile number..."
              className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          {/* Role Filter & Status */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="w-3.5 h-3.5" />
              <span>Role:</span>
            </div>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="All">All Roles ({totalUsers})</option>
              <option value="Administrator">Administrator ({adminCount})</option>
              <option value="Tender Manager">Tender Manager</option>
              <option value="Tender Executive">Tender Executive</option>
              <option value="Auditor / Viewer">Auditor / Viewer</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Users Table */}
      <div className="card list-card overflow-hidden">
        <div className="table-wrapper">
          <table className="tender-table">
            <thead>
              <tr>
                <th className="w-14 text-center">ACTION</th>
                <th>USER / USERNAME</th>
                <th>ROLE</th>
                <th>CONTACT DETAILS</th>
                <th>PAGE ACCESS</th>
                <th>STATUS</th>
                <th>CREATED</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">No users found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchQuery
                        ? `No users match "${searchQuery}"`
                        : 'Click "Create New User" to add the first user.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => {
                  const isPrimary = !!user.isPrimaryAdmin
                  const isSelf = currentUser?.id === user.id
                  const canDelete = !isPrimary && !isSelf
                  const initials = user.username.slice(0, 2).toUpperCase()
                  const accessCount = isPrimary
                    ? APP_MODULES.length
                    : user.pageAccess?.length || 0

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Action Buttons */}
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          {/* View Button */}
                          <button
                            type="button"
                            onClick={() => setViewUser(user)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="View User Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => setEditUser(user)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                            title="Edit User"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Delete Button */}
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmUser(user)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Delete User"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span
                              className="p-1.5 text-slate-300 cursor-not-allowed"
                              title={
                                isPrimary
                                  ? 'Primary Administrator cannot be deleted'
                                  : 'You cannot delete your own logged-in account'
                              }
                            >
                              <Trash2 className="w-4 h-4 opacity-30" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* User Info */}
                      <td>
                        <div className="flex items-center gap-3 min-w-[160px]">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-slate-700 to-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 text-xs block truncate" title={user.username}>
                                {user.username}
                              </span>
                              {isPrimary && (
                                <span className="text-[9px] bg-purple-100 text-purple-700 border border-purple-200 font-bold px-1.5 py-0.2 rounded-full">
                                  Primary
                                </span>
                              )}
                              {isSelf && (
                                <span className="text-[9px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.2 rounded-full">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 block font-mono">
                              ••••••••
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td>
                        <span
                          className={`inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                            ROLE_BADGE[user.role] || 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>

                      {/* Contact Details */}
                      <td>
                        <div className="space-y-0.5 text-xs text-slate-600 min-w-[160px]">
                          {user.email ? (
                            <div className="flex items-center gap-1.5 text-slate-700 truncate" title={user.email}>
                              <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span className="truncate">{user.email}</span>
                            </div>
                          ) : null}
                          {user.mobileNumber ? (
                            <div className="flex items-center gap-1.5 text-slate-600">
                              <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span>{user.mobileNumber}</span>
                            </div>
                          ) : null}
                          {!user.email && !user.mobileNumber && (
                            <span className="text-slate-400 italic text-[11px]">— Not Provided —</span>
                          )}
                        </div>
                      </td>

                      {/* Page Access */}
                      <td>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewUser(user)}
                            className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                            title="Click to view accessible pages"
                          >
                            <Layers className="w-3 h-3" />
                            {accessCount} / {APP_MODULES.length} Pages
                          </button>
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={`badge ${
                            user.isActive ? 'badge-green' : 'badge-slate'
                          } inline-flex items-center gap-1 text-[11px] font-semibold`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              user.isActive ? 'bg-emerald-600' : 'bg-slate-400'
                            }`}
                          />
                          {user.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>

                      {/* Created At */}
                      <td>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          {new Date(user.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Modals */}

      {/* Create User Modal */}
      {createModalOpen && (
        <UserModal
          mode="create"
          onClose={() => setCreateModalOpen(false)}
          onSave={handleCreate}
        />
      )}

      {/* Edit User Modal */}
      {editUser && (
        <UserModal
          mode="edit"
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={handleUpdate}
        />
      )}

      {/* View User Modal */}
      {viewUser && (
        <ViewUserModal
          user={viewUser}
          onClose={() => setViewUser(null)}
          onEdit={() => setEditUser(viewUser)}
        />
      )}

      {/* Delete Confirmation Popup */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-in">
            <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-red-50/60">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Delete User Account</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="p-5 space-y-3 text-xs text-slate-700">
              <p>
                Are you sure you want to delete user <strong>"{deleteConfirmUser.username}"</strong> ({deleteConfirmUser.role})?
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-[11px] text-slate-600">
                <div><strong>Username:</strong> {deleteConfirmUser.username}</div>
                {deleteConfirmUser.email && <div><strong>Email:</strong> {deleteConfirmUser.email}</div>}
                <div><strong>Role:</strong> {deleteConfirmUser.role}</div>
              </div>
              <p className="text-slate-500">
                This user will permanently lose all access to Tender FMS and will be removed from the database.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => setDeleteConfirmUser(null)}
                className="secondary-button text-xs py-2 px-4"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleDelete}
                className="primary-button text-xs py-2 px-4 bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteLoading ? 'Deleting...' : 'Yes, Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
