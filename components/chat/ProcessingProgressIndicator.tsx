'use client'

import React from 'react'
import {
  UploadCloud,
  Layers,
  FileSearch,
  ShieldCheck,
  Sparkles,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { ProcessingProgress, ProcessingStage } from '@/types/document-understanding'

interface ProcessingProgressIndicatorProps {
  progress?: ProcessingProgress | null
  fileName?: string
}

const STAGES: Array<{
  stage: ProcessingStage
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { stage: 'uploading', label: 'Document Uploading', icon: UploadCloud },
  { stage: 'extracting_content', label: 'Extracting Content', icon: Layers },
  { stage: 'processing_pages', label: 'Processing Pages', icon: FileSearch },
  { stage: 'analyzing_document', label: 'Analyzing Context', icon: Sparkles },
  { stage: 'verifying_information', label: 'Verifying Information', icon: ShieldCheck },
  { stage: 'generating_answer', label: 'Generating Answer', icon: Sparkles },
]

export function ProcessingProgressIndicator({
  progress,
  fileName,
}: ProcessingProgressIndicatorProps) {
  if (!progress || progress.stage === 'idle' || progress.stage === 'completed') {
    return null
  }

  const currentStageIndex = STAGES.findIndex(s => s.stage === progress.stage)
  const percent = progress.percent ?? Math.min(95, Math.max(10, (currentStageIndex + 1) * 16))

  return (
    <div className="w-full max-w-xl mx-auto my-3 p-3.5 bg-white dark:bg-slate-900 border border-blue-200/80 dark:border-blue-900/50 rounded-xl shadow-sm text-slate-800 dark:text-slate-200 space-y-2.5 transition-all">
      {/* Top Header */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {progress.stageLabel || 'Processing Document...'}
          </span>
          {fileName && (
            <span className="text-slate-500 max-w-[150px] truncate text-[11px]">
              ({fileName})
            </span>
          )}
        </div>
        <span className="font-mono font-medium text-blue-600 dark:text-blue-400 text-xs">
          {percent}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Stage Icons Row */}
      <div className="grid grid-cols-6 gap-1 pt-1">
        {STAGES.map((s, idx) => {
          const Icon = s.icon
          const isDone = currentStageIndex > idx
          const isCurrent = currentStageIndex === idx
          return (
            <div
              key={s.stage}
              className={`flex flex-col items-center text-center transition-opacity ${
                isCurrent
                  ? 'opacity-100 text-blue-600 dark:text-blue-400 scale-105 font-medium'
                  : isDone
                  ? 'opacity-80 text-emerald-600 dark:text-emerald-400'
                  : 'opacity-40 text-slate-400'
              }`}
            >
              <div
                className={`p-1.5 rounded-full mb-1 ${
                  isCurrent
                    ? 'bg-blue-100 dark:bg-blue-950/80 ring-2 ring-blue-500/30'
                    : isDone
                    ? 'bg-emerald-100 dark:bg-emerald-950/50'
                    : 'bg-slate-100 dark:bg-slate-800'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
              </div>
              <span className="text-[9px] leading-tight line-clamp-1">{s.label}</span>
            </div>
          )
        })}
      </div>

      {/* Dynamic Status Message */}
      {progress.message && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 text-center italic">
          {progress.message}
        </div>
      )}
    </div>
  )
}

