import { CheckCircle, AlertCircle, Loader2, Users } from "lucide-react";
import type { ActiveTool, ActiveSubagent } from "@/lib/use-gateway";

export function HermesToolActivity({
  tools,
  subagents,
}: {
  tools: ActiveTool[];
  subagents: ActiveSubagent[];
}) {
  return (
    <div className="space-y-2">
      {tools.map((tool) => (
        <div
          key={tool.id}
          className="flex items-start gap-2 rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] px-3 py-2 text-xs"
        >
          {tool.status === "running" ? (
            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-blue-400" />
          ) : tool.status === "error" ? (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
          ) : (
            <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400" />
          )}
          <div className="min-w-0">
            <span className="font-mono font-medium text-[hsl(var(--app-text))]">{tool.name}</span>
            {tool.context && (
              <span className="ml-2 text-[hsl(var(--app-muted))]">{tool.context}</span>
            )}
            {tool.summary && (
              <div className="mt-1 text-[hsl(var(--app-muted))]">{tool.summary}</div>
            )}
            {tool.error && (
              <div className="mt-1 text-red-400">{tool.error}</div>
            )}
          </div>
        </div>
      ))}

      {subagents.filter((s) => s.status === "running").length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] px-3 py-2 text-xs text-[hsl(var(--app-muted))]">
          <Users className="h-3.5 w-3.5 text-purple-400" />
          <span>
            {subagents.filter((s) => s.status === "running").length} subagent(s) active
          </span>
          <div className="flex flex-wrap gap-1">
            {subagents
              .filter((s) => s.status === "running")
              .map((s) => (
                <span key={s.id} className="rounded bg-purple-500/20 px-1.5 py-0.5 text-purple-300">
                  {s.goal.slice(0, 40)}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
