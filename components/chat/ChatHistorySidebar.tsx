'use client'

import React, { useState } from 'react'
import {
  Plus,
  MessageSquare,
  Search,
  Pencil,
  Trash2,
  Check,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
  Database,
  Archive,
  MoreVertical,
} from 'lucide-react'
import { ChatConversation } from '@/lib/chat-history-service'

interface ChatHistorySidebarProps {
  conversations: ChatConversation[]
  activeConversationId: string
  onSelectConversation: (id: string) => void
  onNewChat: () => void
  onDeleteConversation: (id: string) => void
  onRenameConversation: (id: string, newTitle: string) => void
  isOpen: boolean
  onToggleOpen: () => void
}

/**
 * Group conversations into time intervals: Today, Yesterday, Previous 7 Days, Older
 */
function groupConversationsByDate(conversations: ChatConversation[]) {
  const groups: { [key: string]: ChatConversation[] } = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    Older: [],
  }

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const last7DaysStart = todayStart - 7 * 86400000

  // Sort descending by updatedAt
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  for (const c of sorted) {
    const time = new Date(c.updatedAt).getTime()
    if (time >= todayStart) {
      groups.Today.push(c)
    } else if (time >= yesterdayStart) {
      groups.Yesterday.push(c)
    } else if (time >= last7DaysStart) {
      groups['Previous 7 Days'].push(c)
    } else {
      groups.Older.push(c)
    }
  }

  return groups
}

export function ChatHistorySidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  isOpen,
  onToggleOpen,
}: ChatHistorySidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Filter conversations by search
  const filtered = conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const groups = groupConversationsByDate(filtered)

  const handleStartRename = (c: ChatConversation) => {
    setEditingId(c.id)
    setEditingTitle(c.title)
  }

  const handleSaveRename = (id: string) => {
    if (editingTitle.trim()) {
      onRenameConversation(id, editingTitle.trim())
    }
    setEditingId(null)
    setEditingTitle('')
  }

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div
          onClick={onToggleOpen}
          className="md:hidden fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-2xs"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 flex-shrink-0 bg-slate-50/90 border-r border-slate-200/90 flex flex-col transition-all duration-200 shadow-sm md:shadow-none h-full overflow-hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:opacity-0 md:overflow-hidden md:border-r-0'
        }`}
      >
        {/* 1. TOP HEADER & NEW CHAT BUTTON (FIXED AT TOP OF SIDEBAR) */}
        <div className="flex-shrink-0 p-3 border-b border-slate-200/80 space-y-2 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-blue-600" />
              Chat History
            </span>
            <button
              onClick={onToggleOpen}
              className="md:hidden w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 flex items-center justify-center hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* New Chat Button (ChatGPT Style) */}
          <button
            onClick={onNewChat}
            className="w-full inline-flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer group"
          >
            <span className="flex items-center gap-2">
              <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
              <span>New Chat</span>
            </span>
            <kbd className="px-1.5 py-0.5 rounded bg-blue-700/60 text-[10px] text-blue-100 font-mono">
              +
            </kbd>
          </button>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white focus:bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* 2. CONVERSATION LIST (Scrollable, Grouped by Time) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-4">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              No conversations found.
            </div>
          ) : (
            Object.entries(groups).map(([groupName, convList]) => {
              if (convList.length === 0) return null

              return (
                <div key={groupName} className="space-y-1">
                  <p className="px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {groupName}
                  </p>

                  <div className="space-y-0.5">
                    {convList.map(c => {
                      const isActive = c.id === activeConversationId
                      const isEditing = editingId === c.id

                      return (
                        <div
                          key={c.id}
                          onClick={() => {
                            if (!isEditing) onSelectConversation(c.id)
                          }}
                          className={`group relative flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all ${
                            isActive
                              ? 'bg-blue-50 text-blue-900 font-semibold border border-blue-200/90 shadow-2xs'
                              : 'text-slate-700 hover:bg-white hover:text-slate-900 border border-transparent hover:border-slate-200/60'
                          }`}
                        >
                          {/* Chat Title or Edit Input */}
                          <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                            <MessageSquare
                              className={`w-3.5 h-3.5 flex-shrink-0 ${
                                isActive ? 'text-blue-600' : 'text-slate-400'
                              }`}
                            />

                            {isEditing ? (
                              <input
                                autoFocus
                                value={editingTitle}
                                onChange={e => setEditingTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveRename(c.id)
                                  if (e.key === 'Escape') setEditingId(null)
                                }}
                                onClick={e => e.stopPropagation()}
                                className="w-full bg-white px-2 py-0.5 rounded border border-blue-400 text-xs text-slate-900 focus:outline-hidden"
                              />
                            ) : (
                              <span className="truncate leading-tight">{c.title}</span>
                            )}
                          </div>

                          {/* Action Buttons (Rename / Delete / Save) */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleSaveRename(c.id)
                                  }}
                                  className="w-5 h-5 rounded hover:bg-emerald-100 text-emerald-700 flex items-center justify-center"
                                  title="Save Title"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    setEditingId(null)
                                  }}
                                  className="w-5 h-5 rounded hover:bg-slate-200 text-slate-500 flex items-center justify-center"
                                  title="Cancel"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleStartRename(c)
                                  }}
                                  className="w-5 h-5 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 flex items-center justify-center"
                                  title="Rename Chat"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>

                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    setConfirmDeleteId(c.id)
                                  }}
                                  className="w-5 h-5 rounded hover:bg-red-100 text-slate-400 hover:text-red-600 flex items-center justify-center"
                                  title="Delete Chat"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* 3. SIDEBAR FOOTER (FIXED AT BOTTOM OF SIDEBAR) */}
        <div className="flex-shrink-0 p-3 border-t border-slate-200/80 bg-white flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{conversations.length} Saved Chats</span>
          </div>
          <span className="text-[10px] text-slate-400">Auto-saved</span>
        </div>
      </aside>

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 animate-scale-in">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">Delete Conversation?</h4>
            <p className="text-xs text-slate-600 mb-4">
              Are you sure you want to delete this chat history? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteConversation(confirmDeleteId)
                  setConfirmDeleteId(null)
                }}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
