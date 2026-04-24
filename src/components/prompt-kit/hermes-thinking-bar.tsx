"use client"

import { Circle } from "lucide-react"

type HermesThinkingBarProps = {
  label?: string
  stage?: string
}

export function HermesThinkingBar({ label = "Hermes is thinking", stage }: HermesThinkingBarProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-hermes-border bg-[#0a0a0a] px-3 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-6 items-end gap-1">
          <span className="h-2.5 w-1 rounded-full bg-hermes-green animate-hermes-pulse" />
          <span className="h-3.5 w-1 rounded-full bg-hermes-green animate-hermes-pulse [animation-delay:120ms]" />
          <span className="h-2 w-1 rounded-full bg-hermes-yellow animate-hermes-pulse [animation-delay:240ms]" />
        </div>
        <div>
          <div className="text-xs font-medium text-white/80">{label}</div>
          {stage ? <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/35">{stage}</div> : null}
        </div>
      </div>
      <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/58">
        <Circle className="h-3 w-3 fill-hermes-green text-hermes-green" />
        Live
      </div>
    </div>
  )
}
