"use client"

import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"
import { LoaderCircle } from "lucide-react"

type ThinkingBarProps = HTMLAttributes<HTMLDivElement> & {
  label?: string
}

export function ThinkingBar({ label = "Thinking", className, ...props }: ThinkingBarProps) {
  return (
    <div className={cn("flex items-center gap-2 rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] px-3 py-2 text-xs text-[hsl(var(--app-muted))]", className)} {...props}>
      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      <span className="font-mono uppercase tracking-[0.18em]">{label}</span>
    </div>
  )
}
