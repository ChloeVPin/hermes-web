"use client"

import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"
import { CheckCircle, Circle, LoaderCircle } from "lucide-react"

type ToolProps = HTMLAttributes<HTMLDivElement> & {
  name: string
  status?: "pending" | "running" | "completed" | "error"
  detail?: string
}

export function Tool({ name, status = "pending", detail, className, ...props }: ToolProps) {
  return (
    <div className={cn("flex items-center gap-2 text-sm", className)} {...props}>
      <div className="shrink-0">
        {status === "pending" && <Circle className="h-4 w-4 text-[hsl(var(--app-muted))]" />}
        {status === "running" && <LoaderCircle className="h-4 w-4 animate-spin text-[hsl(var(--app-primary))]" />}
        {status === "completed" && <CheckCircle className="h-4 w-4 text-green-500" />}
        {status === "error" && <Circle className="h-4 w-4 text-red-500" />}
      </div>
      <div className="flex-1">
        <span className={cn("font-medium", status === "pending" && "text-[hsl(var(--app-muted))]", status !== "pending" && "text-[hsl(var(--app-text))]")}>
          {name}
        </span>
        {detail && <span className="ml-2 text-[hsl(var(--app-muted))]">· {detail}</span>}
      </div>
    </div>
  )
}

type ToolListProps = HTMLAttributes<HTMLDivElement>

export function ToolList({ children, className, ...props }: ToolListProps) {
  return (
    <div className={cn("space-y-1", className)} {...props}>
      <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--app-muted))]">Tools</div>
      {children}
    </div>
  )
}
