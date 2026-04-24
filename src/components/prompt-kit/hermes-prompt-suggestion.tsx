"use client"

import { Sparkles } from "lucide-react"

type HermesPromptSuggestionProps = {
  label: string
  onClick: () => void
}

export function HermesPromptSuggestion({ label, onClick }: HermesPromptSuggestionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md border border-hermes-border bg-[#0b0b0b] px-3 py-2 text-left text-xs font-medium text-white/72 transition hover:border-hermes-green/35 hover:text-white"
    >
      <Sparkles className="h-3.5 w-3.5 text-hermes-yellow" />
      <span>{label}</span>
    </button>
  )
}
