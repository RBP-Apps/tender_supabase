'use client'

import { supabase } from '@/lib/supabaseClient'
import { ParsedFileInfo } from '@/lib/document-parser'
import { DownloadableFileInfo } from '@/components/chat/DownloadableFileCard'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  sourceCount?: number
  grounded?: boolean
  attachedFiles?: ParsedFileInfo[]
  generatedFiles?: DownloadableFileInfo[]
}

export interface ChatConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  tenderScope?: string
  isArchived?: boolean
  messages: ChatMessage[]
}

const LOCAL_STORAGE_KEY = 'tender_fms_all_conversations_v2'
const ACTIVE_CONV_KEY = 'tender_fms_active_conversation_id_v2'

/**
 * Generate a clean, descriptive title from user's first query
 */
export function generateConversationTitle(query: string, attachedFileNames: string[] = []): string {
  const q = query.trim().toLowerCase()

  if (attachedFileNames.length > 0) {
    const baseName = attachedFileNames[0].replace(/\.[^/.]+$/, '').slice(0, 22)
    return `File: ${baseName}`
  }

  // Common pattern detections
  const tenderIdMatch = query.match(/TND-\d{4}-\d+/i)
  if (tenderIdMatch) {
    return `${tenderIdMatch[0].toUpperCase()} Status & Details`
  }

  if (q.includes('pending') || q.includes('kaun-kaun se')) {
    return 'Pending Tenders Review'
  }
  if (q.includes('eligibility') || q.includes('turnover') || q.includes('qualification')) {
    return 'Eligibility Check & Criteria'
  }
  if (q.includes('sample') || q.includes('maf') || q.includes('bis') || q.includes('test report')) {
    return 'Sample Details & Verification'
  }
  if (q.includes('emd') || q.includes('guarantee') || q.includes('utr')) {
    return 'EMD Ready & Bank Accounts'
  }
  if (q.includes('workflow') || q.includes('complete process') || q.includes('stage')) {
    return 'Tender FMS Workflow Guide'
  }
  if (q.includes('word') || q.includes('docx')) {
    return 'Word Report Generation'
  }
  if (q.includes('excel') || q.includes('xlsx') || q.includes('csv')) {
    return 'Excel Data & Sheet Export'
  }
  if (q.includes('pdf')) {
    return 'PDF Summary Export'
  }

  // Fallback: take first 4-6 words up to 32 chars
  const words = query.trim().split(/\s+/)
  const snippet = words.slice(0, 5).join(' ')
  if (snippet.length > 32) {
    return snippet.slice(0, 32).trim() + '...'
  }
  return snippet ? snippet.charAt(0).toUpperCase() + snippet.slice(1) : 'New Conversation'
}

/**
 * Create a fresh blank conversation with default welcome message
 */
export function createNewConversation(scope: string = 'all'): ChatConversation {
  const now = new Date()
  const convId = `conv-${Date.now()}-${Math.random().toString(36).substring(7)}`

  return {
    id: convId,
    title: 'New Conversation',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    tenderScope: scope,
    isArchived: false,
    messages: [
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content:
          'Hello! Welcome to **Tender Query**. Ask me anything about your Tender FMS system, tender records, workflows, documents, or project-related information.\n\n📎 You can **attach PDF, Word, Excel, CSV, or Image files** for instant document reading, or ask me to generate downloadable **Word (.docx)**, **Excel (.xlsx)**, or **PDF** reports directly in chat!',
        timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        grounded: true,
      },
    ],
  }
}

/**
 * 1. LOAD ALL CONVERSATIONS (Local Storage + Supabase Sync)
 */
export async function loadAllConversations(): Promise<ChatConversation[]> {
  // 1.1 Read from localStorage first for instant rendering
  let localList: ChatConversation[] = []
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (saved) {
        localList = JSON.parse(saved)
      }
    } catch (e) {
      console.warn('Failed to parse conversations from localStorage:', e)
    }
  }

  // 1.2 Try fetching from Supabase in background
  try {
    const { data: convData, error: convErr } = await supabase
      .from('tender_chat_conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(50)

    if (!convErr && convData && convData.length > 0) {
      // Fetch messages for these conversations
      const convIds = convData.map(c => c.id)
      const { data: msgData, error: msgErr } = await supabase
        .from('tender_chat_messages')
        .select('*')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: true })

      if (!msgErr && msgData) {
        const dbList: ChatConversation[] = convData.map(c => {
          const msgs: ChatMessage[] = msgData
            .filter(m => m.conversation_id === c.id)
            .map(m => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              timestamp: m.timestamp,
              grounded: m.grounded,
              sourceCount: m.source_count,
              attachedFiles: m.attached_files || undefined,
              generatedFiles: m.generated_files || undefined,
            }))

          return {
            id: c.id,
            title: c.title,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
            tenderScope: c.tender_scope || 'all',
            isArchived: c.is_archived || false,
            messages: msgs.length > 0 ? msgs : createNewConversation(c.tender_scope).messages,
          }
        })

        // Save DB list to local storage
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dbList))
        }
        return dbList
      }
    }
  } catch (err) {
    // Supabase table not created yet or network offline - fallback to local storage
    console.log('Supabase chat sync notice (using resilient local storage):', err)
  }

  // If local list was empty, return array with a new conversation
  if (localList.length === 0) {
    const initial = createNewConversation('all')
    localList = [initial]
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localList))
    }
  }

  return localList
}

/**
 * 2. SAVE CONVERSATION (Optimistic Local Storage + Supabase Persistence)
 */
export async function saveConversation(
  conv: ChatConversation,
  allConversations: ChatConversation[]
): Promise<void> {
  const updatedList = [
    conv,
    ...allConversations.filter(c => c.id !== conv.id),
  ]

  // 2.1 Instant LocalStorage Save
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedList))
    } catch (e) {
      console.warn('LocalStorage save error:', e)
    }
  }

  // 2.2 Background Supabase Sync
  try {
    // Upsert conversation row
    await supabase.from('tender_chat_conversations').upsert(
      {
        id: conv.id,
        title: conv.title,
        updated_at: new Date().toISOString(),
        tender_scope: conv.tenderScope || 'all',
        is_archived: conv.isArchived || false,
      },
      { onConflict: 'id' }
    )

    // Upsert latest messages
    if (conv.messages && conv.messages.length > 0) {
      const messagesToUpsert = conv.messages.map(m => ({
        id: m.id,
        conversation_id: conv.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        attached_files: m.attachedFiles || [],
        generated_files: m.generatedFiles || [],
        grounded: m.grounded ?? true,
        source_count: m.sourceCount ?? 0,
      }))

      await supabase.from('tender_chat_messages').upsert(messagesToUpsert, {
        onConflict: 'id',
      })
    }
  } catch (err) {
    // Non-blocking error handling
    console.log('Supabase chat save notice:', err)
  }
}

/**
 * 3. DELETE CONVERSATION
 */
export async function deleteConversation(
  convId: string,
  allConversations: ChatConversation[]
): Promise<ChatConversation[]> {
  const filtered = allConversations.filter(c => c.id !== convId)

  // 3.1 Remove from local storage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered))
    } catch (e) {
      console.warn('LocalStorage delete error:', e)
    }
  }

  // 3.2 Remove from Supabase
  try {
    await supabase.from('tender_chat_conversations').delete().eq('id', convId)
  } catch (err) {
    console.log('Supabase chat delete notice:', err)
  }

  return filtered
}

/**
 * 4. RENAME CONVERSATION
 */
export async function renameConversation(
  convId: string,
  newTitle: string,
  allConversations: ChatConversation[]
): Promise<ChatConversation[]> {
  const updated = allConversations.map(c => {
    if (c.id === convId) {
      return { ...c, title: newTitle.trim() || 'Untitled Chat', updatedAt: new Date().toISOString() }
    }
    return c
  })

  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated))
  }

  try {
    await supabase
      .from('tender_chat_conversations')
      .update({ title: newTitle.trim(), updated_at: new Date().toISOString() })
      .eq('id', convId)
  } catch (err) {
    console.log('Supabase rename notice:', err)
  }

  return updated
}

/**
 * Active conversation tracking helper
 */
export function getSavedActiveConversationId(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(ACTIVE_CONV_KEY)
  }
  return null
}

export function setSavedActiveConversationId(id: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ACTIVE_CONV_KEY, id)
  }
}
