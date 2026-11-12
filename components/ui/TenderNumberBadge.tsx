'use client'

import React, { useState } from 'react'
import { Copy, Check, Hash } from 'lucide-react'

interface TenderNumberBadgeProps {
  id?: string | null
  className?: string
  showCopy?: boolean
  prefix?: string
  variant?: 'blue' | 'indigo' | 'purple' | 'emerald' | 'amber'
  size?: 'sm' | 'md'
}

const variantStyles: Record<string, string> = {
  blue: 'bg-blue-50 hover:bg-blue-100/90 text-blue-700 border-blue-200/90 shadow-2xs',
  indigo: 'bg-indigo-50 hover:bg-indigo-100/90 text-indigo-700 border-indigo-200/90 shadow-2xs',
  purple: 'bg-purple-50 hover:bg-purple-100/90 text-purple-700 border-purple-200/90 shadow-2xs',
  emerald: 'bg-emerald-50 hover:bg-emerald-100/90 text-emerald-700 border-emerald-200/90 shadow-2xs',
  amber: 'bg-amber-50 hover:bg-amber-100/90 text-amber-800 border-amber-200/90 shadow-2xs',
}

const prefixColors: Record<string, string> = {
  blue: 'text-blue-500',
  indigo: 'text-indigo-500',
  purple: 'text-purple-500',
  emerald: 'text-emerald-500',
  amber: 'text-amber-500',
}

export function TenderNumberBadge({
  id,
  className = '',
  showCopy = true,
  prefix = '#',
  variant = 'blue',
  size = 'sm',
}: TenderNumberBadgeProps) {
  const [copied, setCopied] = useState(false)

  if (!id || !id.trim()) {
    return <span className="text-slate-300 italic text-xs">—</span>
  }

  const cleanId = id.trim()

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(cleanId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const sizeClass = size === 'md' ? 'text-xs px-2.5 py-1' : 'text-[11px] px-2 py-0.5'

  return (
    <span
      onClick={showCopy ? handleCopy : undefined}
      title={showCopy ? `${copied ? 'Copied to clipboard!' : 'Click to copy Tender Number: ' + cleanId}` : `Tender Number: ${cleanId}`}
      className={`group/tid inline-flex items-center gap-1 rounded-md font-mono font-bold border transition-all cursor-pointer select-all ${variantStyles[variant] || variantStyles.blue} ${sizeClass} ${className}`}
    >
      {prefix && (
        <span className={`font-semibold text-[10px] select-none ${prefixColors[variant] || prefixColors.blue}`}>
          {prefix}
        </span>
      )}
      <span className="tracking-tight whitespace-nowrap">{cleanId}</span>
      {showCopy && (
        <span className="opacity-0 group-hover/tid:opacity-100 transition-opacity ml-0.5 inline-flex items-center">
          {copied ? (
            <Check className="w-2.5 h-2.5 text-emerald-600 animate-in zoom-in" />
          ) : (
            <Copy className={`w-2.5 h-2.5 opacity-60 hover:opacity-100 ${prefixColors[variant] || prefixColors.blue}`} />
          )}
        </span>
      )}
    </span>
  )
}

