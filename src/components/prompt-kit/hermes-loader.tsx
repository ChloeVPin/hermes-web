"use client"

import { LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type HermesLoaderProps = {
  label?: string
  className?: string
}

export function HermesLoader({ label = "Hermes is thinking", className }: HermesLoaderProps) {
  return (
    <div className={cn("inline-flex items-center gap-2 text-xs font-medium text-white/50", className)}>
      <LoaderCircle className="h-4 w-4 animate-spin text-hermes-green" />
      <span>{label}</span>
    </div>
  )
}
