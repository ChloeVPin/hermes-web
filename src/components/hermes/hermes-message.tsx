import { useState } from "react";
import { Markdown } from "@/components/prompt-kit/index";
import { AnsiText } from "@/lib/ansi-to-react";
import type { ChatMessage } from "@/lib/use-gateway";
import { Loader2, Terminal, ChevronDown, Wrench, Brain } from "lucide-react";

export function HermesMessage({ message }: { message: ChatMessage }) {
  // Hide intermediate tool messages - they're just for debugging
  // The final message has a tool summary dropdown at the bottom
  // System messages (slash command responses) should still be shown
  if (message.role === "tool") {
    return null;
  }

  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const hasAnsi = isSystem && message.content.includes("\x1b[");

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={[
          "rounded-md border px-4 py-3",
          isUser
            ? "max-w-md border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-text))]"
            : "w-full border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-text))]",
        ].join(" ")}
      >
        <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-mono uppercase tracking-[0.18em]">
          <span className="text-[hsl(var(--app-muted))]">{isUser ? "You" : isSystem ? "System" : "Hermes"}</span>
          {message.isStreaming && (
            <Loader2 className="h-3 w-3 animate-spin text-[hsl(var(--app-muted))]" />
          )}
          {message.usage && (
            <span className="text-[hsl(var(--app-muted))]">
              {message.usage.total} tokens
              {message.usage.cost_usd != null && ` · $${message.usage.cost_usd.toFixed(4)}`}
            </span>
          )}
        </div>

        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-[hsl(var(--app-text))]">{message.content}</p>
        ) : isSystem ? (
          <div className={hasAnsi ? "font-mono text-sm leading-6" : "text-sm leading-6"}>
            <AnsiText text={message.content} />
          </div>
        ) : (
          <Markdown content={message.content || (message.isStreaming ? "..." : "")} />
        )}

        {/* Thinking/reasoning, compact collapsible, only latest shown */}
        {!isUser && (message.thinking || message.reasoning) ? (
          <ThinkingSection thinking={message.thinking} reasoning={message.reasoning} />
        ) : null}

        {/* Tool summary, compact collapsible */}
        {!isUser && message.tools?.length ? (
          <ToolSummary tools={message.tools} />
        ) : null}
      </div>
    </div>
  );
}

// ── Compact thinking/reasoning section ──────────────────────────────
function ThinkingSection({ thinking, reasoning }: { thinking?: string; reasoning?: string }) {
  const [open, setOpen] = useState(false);
  const content = reasoning || thinking || "";
  const label = reasoning ? "Reasoning" : "Thinking";
  // Show only the last ~200 chars as a preview
  const preview = content.length > 200 ? "…" + content.slice(-200) : content;

  return (
    <div className="mt-3 border-t border-[hsl(var(--app-border))] pt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--app-muted))] hover:text-[hsl(var(--app-text))] transition-colors"
      >
        <Brain className="h-3 w-3" />
        <span>{label}</span>
        <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded bg-[hsl(var(--app-surface-2))] px-3 py-2 text-xs text-[hsl(var(--app-muted))] whitespace-pre-wrap">
          {content}
        </div>
      )}
      {!open && content && (
        <div className="mt-1 text-[11px] text-[hsl(var(--app-muted))] truncate opacity-60">
          {preview.replace(/\n/g, " ").slice(0, 80)}…
        </div>
      )}
    </div>
  );
}

// ── Compact tool summary with inline dropdowns ──────────────────────
function ToolSummary({ tools }: { tools: ChatMessage["tools"] }) {
  const [open, setOpen] = useState(false);
  if (!tools || tools.length === 0) return null;

  // Group tools by name
  const grouped = tools.reduce((acc, tool) => {
    if (!acc[tool.name]) acc[tool.name] = [];
    acc[tool.name].push(tool);
    return acc;
  }, {} as Record<string, typeof tools>);

  return (
    <div className="mt-3 border-t border-[hsl(var(--app-border))] pt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--app-muted))] hover:text-[hsl(var(--app-text))] transition-colors"
      >
        <Wrench className="h-3 w-3" />
        <span>Tools used</span>
        <span className="ml-1 text-[10px] opacity-60">({tools.length})</span>
        <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {!open && (
        <div className="mt-1 flex flex-wrap gap-1">
          {Object.entries(grouped).map(([name, items]) => (
            <span key={name} className="inline-flex items-center gap-1 rounded bg-[hsl(var(--app-surface-2))] px-1.5 py-0.5 text-[10px] font-mono text-[hsl(var(--app-muted))]">
              {name}
              {items.length > 1 && <span className="opacity-60">×{items.length}</span>}
              {items.some(t => t.status === "running") && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              {items.every(t => t.status === "complete") && <span className="text-green-400">✓</span>}
              {items.some(t => t.status === "error") && <span className="text-red-400">✗</span>}
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
          {tools.map((tool) => (
            <div key={tool.id} className="flex items-start gap-2 rounded bg-[hsl(var(--app-surface-2))] px-2 py-1.5 text-[11px]">
              <span className="font-mono font-medium text-[hsl(var(--app-text))]">{tool.name}</span>
              <span className="text-[hsl(var(--app-muted))]">·</span>
              <span className={tool.status === "error" ? "text-red-400" : tool.status === "complete" ? "text-green-400" : "text-blue-400"}>
                {tool.status}
              </span>
              {tool.summary && <span className="text-[hsl(var(--app-muted))] truncate"> · {tool.summary}</span>}
              {tool.error && <span className="text-red-400 truncate"> · {tool.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
