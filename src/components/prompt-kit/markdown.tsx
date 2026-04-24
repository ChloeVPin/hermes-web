"use client"

import React, { useMemo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

type MarkdownProps = {
  content: string
  className?: string
}

export function Markdown({ content, className }: MarkdownProps) {
  const components = useMemo<Components>(
    () => ({
      p({ children }) {
        // Check if children contains a CodeBlock (div with mb-4 class)
        const hasCodeBlock = React.Children.toArray(children).some((child) => 
          typeof child === "object" && child !== null && 
          "type" in child && child.type === "div" && 
          "props" in child && typeof child.props === "object" && child.props !== null &&
          "className" in child.props && typeof child.props.className === "string" &&
          child.props.className.includes("mb-4")
        )
        if (hasCodeBlock) {
          return <>{children}</>
        }
        return <p className="mb-4 text-[15px] leading-7 text-white/84 last:mb-0">{children}</p>
      },
      ul({ children }) {
        return <ul className="mb-4 list-disc space-y-2 pl-5 text-white/84">{children}</ul>
      },
      ol({ children }) {
        return <ol className="mb-4 list-decimal space-y-2 pl-5 text-white/84">{children}</ol>
      },
      li({ children }) {
        return <li className="pl-1">{children}</li>
      },
      a({ children, href }) {
        return (
          <a href={href} target="_blank" rel="noreferrer" className="text-hermes-green underline decoration-hermes-green/30 underline-offset-4 transition hover:text-hermes-yellow">
            {children}
          </a>
        )
      },
      blockquote({ children }) {
        return (
          <blockquote className="mb-4 border-l-2 border-hermes-green/50 bg-hermes-green/5 px-4 py-3 text-white/76">
            {children}
          </blockquote>
        )
      },
      h1({ children }) {
        return <h1 className="mb-3 text-xl font-semibold tracking-tight text-white">{children}</h1>
      },
      h2({ children }) {
        return <h2 className="mb-3 text-lg font-semibold tracking-tight text-white">{children}</h2>
      },
      h3({ children }) {
        return <h3 className="mb-2 text-base font-semibold tracking-tight text-white">{children}</h3>
      },
      code(props: any) {
        const { inline, className, children, ...rest } = props
        const match = /language-(\w+)/.exec(className ?? "")
        const code = String(children).replace(/\n$/, "")

        if (inline) {
          return (
            <code className="rounded border border-white/10 bg-white/6 px-1.5 py-0.5 font-mono text-[0.84em] text-hermes-yellow" {...rest}>
              {children}
            </code>
          )
        }

        return <CodeBlock code={code} language={match?.[1] ?? "text"} />
      },
      pre({ children }) {
        return <>{children}</>
      },
    }),
    [],
  )

  return (
    <div className={cn("prose prose-invert max-w-none", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

// Simple CodeBlock for inline code in markdown
function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="mb-4 overflow-hidden rounded-md border border-white/10 bg-[#090909]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/42">{language}</span>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-[13px] leading-6 text-white/84">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}
