"use client"

import { forwardRef } from "react"
import type { ReactNode, TextareaHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

type PromptInputProps = {
  children: ReactNode
  className?: string
}

export function PromptInput({ children, className }: PromptInputProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))]",
        className,
      )}
    >
      {children}
    </div>
  )
}

export const PromptInputTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function PromptInputTextarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[120px] w-full resize-none bg-transparent px-4 py-4 text-sm leading-6 text-[hsl(var(--app-text))] placeholder:text-[hsl(var(--app-muted))] focus:outline-none",
        className,
      )}
      {...props}
    />
  )
})
