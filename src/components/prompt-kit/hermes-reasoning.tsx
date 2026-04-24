"use client"

import type { ReactNode } from "react"
import { ChevronDown, Wand2 } from "lucide-react"

type HermesReasoningProps = {
  title?: string
  children: ReactNode
  open?: boolean
}

export function HermesReasoning({ title = "Working notes", children, open = false }: HermesReasoningProps) {
  return (
    <details
      open={open}
      className="mb-4 rounded-md border border-hermes-border bg-[#0a0a0a] px-3 py-2 text-sm text-white/72"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-medium text-white/82">
          <Wand2 className="h-4 w-4 text-hermes-yellow" />
          {title}
        </span>
        <ChevronDown className="h-4 w-4 text-white/36" />
      </summary>
      <div className="mt-3 space-y-2 border-t border-white/8 pt-3">{children}</div>
    </details>
  )
}
