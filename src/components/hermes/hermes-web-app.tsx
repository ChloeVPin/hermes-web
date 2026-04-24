import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, Loader2, MoonStar, Sun, Bug, Zap, Boxes } from "lucide-react";
import { useGateway } from "@/lib/use-gateway";
import { HermesSidebar } from "./hermes-sidebar";
import { HermesWeb } from "./hermes-web";
import type { GatewayClient } from "@/lib/gateway-client";
import { cn } from "@/lib/utils";

interface DebugLog {
  timestamp: string;
  level: "info" | "warning" | "error";
  message: string;
}

interface SkillItem {
  name: string;
  description?: string;
  category?: string;
}

interface ToolsetItem {
  name: string;
  description?: string;
  tool_count?: number;
  enabled?: boolean;
}

export function HermesWebApp() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [draft, setDraft] = useState("");
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [configChecked, setConfigChecked] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolsetItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [skillDetail, setSkillDetail] = useState<Record<string, unknown> | null>(null);
  const [toolDetail, setToolDetail] = useState<Record<string, unknown> | null>(null);
  const [skillBreadcrumb, setSkillBreadcrumb] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const gw = useGateway();

  const addDebugLog = (level: "info" | "warning" | "error", message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev, { timestamp, level, message }].slice(-100));
  };

  // Check hermes-agent configuration on mount
  useEffect(() => {
    if (configChecked) return;
    
    const checkConfig = async () => {
      try {
        const result = await gw.client.request("config.check") as { configured: boolean; reason?: string };
        if (!result.configured) {
          setConfigError(result.reason || "Hermes-agent not configured");
          addDebugLog("error", `Hermes-agent not configured: ${result.reason}`);
        }
        setConfigChecked(true);
      } catch (err) {
        // Only log warning if bridge is connected
        if (gw.connectionState === "connected") {
          addDebugLog("warning", "Could not check hermes-agent configuration");
        }
        setConfigChecked(true);
      }
    };
    
    checkConfig();
  }, [configChecked, gw.connectionState]);

  // Connect on mount
  useEffect(() => {
    gw.connect();
    return () => gw.disconnect();
  }, []);

  // Apply theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Load session list on connect and auto-create session if needed
  const didInitRef = useRef(false);
  useEffect(() => {
    if (gw.connectionState !== "connected") {
      didInitRef.current = false;
      return;
    }
    if (didInitRef.current) return;
    didInitRef.current = true;
    
    (async () => {
      try {
        await gw.listSessions();
      } catch {
        // gateway not ready yet
      }
      if (!gw.sessionId) {
        try {
          await gw.createSession();
        } catch (err) {
          addDebugLog("error", `Failed to auto-create session: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    })();
  }, [gw.connectionState]);

  // Log connection errors to debug panel
  useEffect(() => {
    if (gw.connectionStatus.error && (gw.connectionState === "disconnected" || gw.connectionState === "error")) {
      addDebugLog("error", gw.connectionStatus.error);
    }
    // Clear errors when connected
    if (gw.connectionState === "connected") {
      setDebugLogs(prev => prev.filter(log => log.level !== "error"));
    }
  }, [gw.connectionStatus.error, gw.connectionState]);

  // Log gateway events
  useEffect(() => {
    const unsubscribe = gw.client.onAny((event: any) => {
      if (event.type === "gateway.protocol_error" || event.type === "gateway.start_timeout") {
        addDebugLog("error", `Gateway error: ${event.type}`);
      }
    });
    return unsubscribe;
  }, [gw.client]);

  const handleNewChat = async () => {
    try {
      await gw.createSession();
      setDraft("");
      inputRef.current?.focus();
      addDebugLog("info", "Created new session");
    } catch (err) {
      addDebugLog("error", `Failed to create session: ${err instanceof Error ? err.message : String(err)}`);
      console.error("Failed to create session:", err);
    }
  };

  const handleSelectSession = async (id: string) => {
    try {
      await gw.resumeSession(id);
      setDraft("");
      inputRef.current?.focus();
      addDebugLog("info", `Resumed session ${id}`);
    } catch (err) {
      addDebugLog("error", `Failed to select session: ${err instanceof Error ? err.message : String(err)}`);
      console.error("Failed to select session:", err);
    }
  };

  const handleSubmit = async () => {
    if (!draft.trim() || gw.isAgentWorking) return;
    const text = draft;
    setDraft("");
    
    if (text.startsWith("/")) {
      addDebugLog("info", `Slash command: ${text}`);
    } else {
      addDebugLog("info", `Sending message: ${text.substring(0, 50)}...`);
    }
    
    try {
      await gw.sendMessage(text);
      addDebugLog("info", text.startsWith("/") ? "Slash command executed" : "Message sent successfully");
    } catch (err) {
      addDebugLog("error", `Failed: ${err instanceof Error ? err.message : String(err)}`);
      console.error("Failed to send:", err);
    }
  };

  const toggleTheme = () => setTheme((c) => (c === "dark" ? "light" : "dark"));

  const handleSkillClick = async (skill: SkillItem) => {
    setSelectedSkill(skill);
    setSkillBreadcrumb(skill.name);
    setSkillDetail(null);
    setDetailLoading(true);
    try {
      // Use search to get hub details (inspect only works for installed skills)
      const res = await gw.client.skillsManage({ session_id: gw.sessionId ?? "", action: "search", query: skill.name });
      setSkillDetail(res);
    } catch {
      setSkillDetail({ error: "Failed to load skill details" });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSearchResultClick = async (result: { name: string; description: string }) => {
    setSkillBreadcrumb(result.name);
    setSkillDetail(null);
    setDetailLoading(true);
    try {
      // Try inspect with the name - backend may resolve short names
      const res = await gw.client.skillsManage({ session_id: gw.sessionId ?? "", action: "inspect", name: result.name });
      // Check if inspect returned actual info
      if (res && typeof res === "object" && res.info && Object.keys(res.info).length > 0) {
        setSkillDetail(res);
      } else {
        // Inspect returned empty, fall back to search result data
        setSkillDetail({ searchResult: result });
      }
    } catch {
      // If inspect fails, fall back to showing search result data
      setSkillDetail({ searchResult: result });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleToolClick = async (tool: ToolsetItem) => {
    setSelectedTool(tool);
    setToolDetail(null);
    setDetailLoading(true);
    try {
      const res = await gw.client.toolsShow({ session_id: gw.sessionId ?? "", name: tool.name });
      setToolDetail(res);
    } catch {
      setToolDetail({ error: "Failed to load tool details" });
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[hsl(var(--app-bg))] text-[hsl(var(--app-text))] relative overflow-hidden">
      {/* Config error banner */}
      {configError && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-yellow-500/50 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-400 backdrop-blur-md">
          <span>⚠️ {configError} - Run 'hermes model' or set API key in ~/.hermes/.env</span>
          <button
            type="button"
            onClick={() => setConfigError(null)}
            className="text-xs text-yellow-400 hover:text-yellow-300"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {/* Top-right status pills */}
      <div className="fixed right-4 top-4 z-50 flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center justify-center rounded-full border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] p-1.5 text-[hsl(var(--app-muted))] backdrop-blur-md transition hover:text-[hsl(var(--app-text))]"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-3 w-3" /> : <MoonStar className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          className={`flex items-center justify-center rounded-full border bg-[hsl(var(--app-surface))] p-1.5 backdrop-blur-md transition ${
            debugLogs.some(log => log.level === "error")
              ? "border-red-500 text-red-400"
              : "border-[hsl(var(--app-border))] text-[hsl(var(--app-muted))] hover:text-[hsl(var(--app-text))]"
          }`}
          aria-label="Toggle debug panel"
          title={debugLogs.some(log => log.level === "error") ? "Errors detected - click to view debug log" : "Debug log"}
        >
          <Bug className="h-3 w-3" />
        </button>
        <div 
          className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider backdrop-blur-md group relative"
          title={gw.connectionStatus.error}
        >
          {gw.connectionState === "connected" ? (
            <Wifi className="h-3 w-3 text-green-400" />
          ) : gw.connectionState === "connecting" ? (
            <Loader2 className="h-3 w-3 animate-spin text-orange-400" />
          ) : (
            <WifiOff className="h-3 w-3 text-red-500" />
          )}
          <span>{gw.connectionState}</span>
          {gw.connectionStatus.error && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] p-2 text-[11px] font-normal normal-case tracking-normal text-[hsl(var(--app-text))] shadow-lg z-50 hidden group-hover:block">
              {gw.connectionStatus.error}
            </div>
          )}
        </div>
      </div>

      {/* Floating sidebar */}
      <aside className="fixed left-4 top-4 bottom-4 z-50 hidden lg:block w-64">
        <HermesSidebar
          sessions={gw.sessions}
          activeSessionId={gw.sessionId}
          sessionInfo={gw.sessionInfo}
          connectionState={gw.connectionState}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          onDeleteSession={gw.deleteSession}
          client={gw.client}
          onSkillClick={handleSkillClick}
          onToolClick={handleToolClick}
        />
      </aside>

      {/* Chat area */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <HermesWeb
          messages={gw.messages}
          isAgentWorking={gw.isAgentWorking}
          activeTools={gw.activeTools}
          activeSubagents={gw.activeSubagents}
          pendingClarify={gw.pendingClarify}
          pendingApproval={gw.pendingApproval}
          onRespondClarify={gw.respondClarify}
          onRespondApproval={gw.respondApproval}
          onInterrupt={gw.interruptSession}
          draft={draft}
          onDraftChange={setDraft}
          onSubmit={handleSubmit}
          inputRef={inputRef}
          isBusy={gw.isAgentWorking}
          sessionId={gw.sessionId}
          catalogCommands={gw.catalogCommands}
        />
      </main>

      {/* Debug panel */}
      {showDebugPanel && (
        <div className="fixed right-4 top-16 bottom-4 z-50 w-96 rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] shadow-xl flex flex-col">
          <div className="flex items-center justify-between border-b border-[hsl(var(--app-border))] p-3">
            <h3 className="text-sm font-medium text-[hsl(var(--app-text))]">Debug Log</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDebugLogs([])}
                className="text-xs text-[hsl(var(--app-muted))] hover:text-[hsl(var(--app-text))]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setShowDebugPanel(false)}
                className="text-[hsl(var(--app-muted))] hover:text-[hsl(var(--app-text))]"
                aria-label="Close debug panel"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {debugLogs.length === 0 ? (
              <div className="text-xs text-[hsl(var(--app-muted))] text-center py-8">
                No debug logs yet
              </div>
            ) : (
              debugLogs.map((log, index) => (
                <div
                  key={index}
                  className={`text-xs font-mono rounded px-2 py-1 ${
                    log.level === "error"
                      ? "bg-red-500/10 text-red-400"
                      : log.level === "warning"
                      ? "bg-yellow-500/10 text-yellow-400"
                      : "bg-[hsl(var(--app-muted))]/10 text-[hsl(var(--app-muted))]"
                  }`}
                >
                  <span className="opacity-60">[{log.timestamp}]</span>{" "}
                  <span className="font-medium uppercase">{log.level}:</span>{" "}
                  {log.message}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {/* Skill detail modal */}
      {selectedSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSelectedSkill(null)}>
          <div className="rounded-lg border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] p-6 shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-[hsl(var(--app-accent))]" />
                <div>
                  <h3 className="text-lg font-semibold text-[hsl(var(--app-text))]">{skillBreadcrumb || selectedSkill.name}</h3>
                  {skillBreadcrumb && skillBreadcrumb !== selectedSkill.name && (
                    <button
                      type="button"
                      onClick={() => handleSkillClick(selectedSkill)}
                      className="text-xs text-[hsl(var(--app-accent))] hover:underline"
                    >
                      ← Back to {selectedSkill.name} search results
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSkill(null)}
                className="text-[hsl(var(--app-muted))] hover:text-[hsl(var(--app-text))]"
              >
                ✕
              </button>
            </div>
            {selectedSkill.category && (
              <div className="mb-3">
                <span className="text-[10px] font-mono uppercase text-[hsl(var(--app-muted))] bg-[hsl(var(--app-surface-2))] px-2 py-1 rounded">{selectedSkill.category}</span>
              </div>
            )}
            {selectedSkill.description && (
              <p className="text-sm text-[hsl(var(--app-muted))] mb-4">{selectedSkill.description}</p>
            )}
            {detailLoading && (
              <div className="text-sm text-[hsl(var(--app-muted))]">Loading details...</div>
            )}
            {skillDetail && !detailLoading && (
              <div className="flex-1 overflow-y-auto">
                {(() => {
                  // Handle clicked search result: { searchResult: { name, description } }
                  const result = (skillDetail as any).searchResult;
                  if (result) {
                    return (
                      <div className="space-y-3">
                        <div><span className="text-xs font-medium text-[hsl(var(--app-muted))]">Name: </span><span className="text-sm text-[hsl(var(--app-text))]">{String(result.name)}</span></div>
                        <div><span className="text-xs font-medium text-[hsl(var(--app-muted))]">Description: </span><span className="text-sm text-[hsl(var(--app-text))]">{String(result.description)}</span></div>
                        <p className="text-sm text-[hsl(var(--app-muted))] italic mt-4">
                          This skill is available in the Skills Hub. Use the command line to install it.
                        </p>
                      </div>
                    );
                  }
                  // Handle search results format: { results: [{ name, description }] }
                  if (skillDetail.results && Array.isArray(skillDetail.results)) {
                    const results = skillDetail.results as any[];
                    const matchingSkill = results.find((r: any) => r.name === selectedSkill.name);
                    if (matchingSkill) {
                      return (
                        <div className="space-y-3">
                          <div><span className="text-xs font-medium text-[hsl(var(--app-muted))]">Name: </span><span className="text-sm text-[hsl(var(--app-text))]">{String(matchingSkill.name)}</span></div>
                          <div><span className="text-xs font-medium text-[hsl(var(--app-muted))]">Description: </span><span className="text-sm text-[hsl(var(--app-text))]">{String(matchingSkill.description)}</span></div>
                        </div>
                      );
                    }
                    // No match found - show all search results as clickable items
                    return (
                      <div className="space-y-2">
                        <p className="text-sm text-[hsl(var(--app-muted))] italic">
                          {results.length} result(s) found in Skills Hub:
                        </p>
                        {results.slice(0, 20).map((r: any, idx: number) => (
                          <div
                            key={idx}
                            onClick={() => handleSearchResultClick(r)}
                            className="p-3 rounded bg-[hsl(var(--app-surface-2))] cursor-pointer hover:bg-[hsl(var(--app-surface-3))] transition"
                          >
                            <div className="text-sm font-medium text-[hsl(var(--app-text))]">{r.name}</div>
                            <div className="text-xs text-[hsl(var(--app-muted))] mt-1">{r.description}</div>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  // Handle inspect format: { info: { name, description, source, identifier, tags, skill_md_preview } }
                  const info = skillDetail.info && typeof skillDetail.info === "object" ? skillDetail.info as any : null;
                  if (info && Object.keys(info).length > 0) {
                    return (
                      <div className="space-y-3">
                        {info.name && (
                          <div><span className="text-xs font-medium text-[hsl(var(--app-muted))]">Name: </span><span className="text-sm text-[hsl(var(--app-text))]">{String(info.name)}</span></div>
                        )}
                        {info.description && (
                          <div><span className="text-xs font-medium text-[hsl(var(--app-muted))]">Description: </span><span className="text-sm text-[hsl(var(--app-text))]">{String(info.description)}</span></div>
                        )}
                        {info.source && (
                          <div><span className="text-xs font-medium text-[hsl(var(--app-muted))]">Source: </span><span className="text-sm text-[hsl(var(--app-text))]">{String(info.source)}</span></div>
                        )}
                        {info.identifier && (
                          <div><span className="text-xs font-medium text-[hsl(var(--app-muted))]">Identifier: </span><span className="text-sm text-[hsl(var(--app-text))] font-mono">{String(info.identifier)}</span></div>
                        )}
                        {info.tags && Array.isArray(info.tags) && info.tags.length > 0 && (
                          <div><span className="text-xs font-medium text-[hsl(var(--app-muted))]">Tags: </span><span className="text-sm text-[hsl(var(--app-text))]">{info.tags.join(", ")}</span></div>
                        )}
                        {info.skill_md_preview && (
                          <div className="mt-4">
                            <div className="text-xs font-medium text-[hsl(var(--app-muted))] mb-2">SKILL.md Preview:</div>
                            <pre className="text-xs text-[hsl(var(--app-muted))] whitespace-pre-wrap bg-[hsl(var(--app-surface-2))] p-3 rounded max-h-64 overflow-y-auto">
                              {String(info.skill_md_preview)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  }
                  // Fallback: show list data
                  return (
                    <div className="space-y-3">
                      <p className="text-sm text-[hsl(var(--app-muted))] italic">
                        This is a built-in skill included with hermes-agent.
                      </p>
                      {selectedSkill.description && (
                        <div><span className="text-xs font-medium text-[hsl(var(--app-muted))]">Description: </span><span className="text-sm text-[hsl(var(--app-text))]">{selectedSkill.description}</span></div>
                      )}
                      {selectedSkill.category && (
                        <div><span className="text-xs font-medium text-[hsl(var(--app-muted))]">Category: </span><span className="text-sm text-[hsl(var(--app-text))]">{selectedSkill.category}</span></div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tool detail modal */}
      {selectedTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSelectedTool(null)}>
          <div className="rounded-lg border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] p-6 shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Boxes className="h-5 w-5 text-[hsl(var(--app-accent))]" />
                <h3 className="text-lg font-semibold text-[hsl(var(--app-text))]">{selectedTool.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTool(null)}
                className="text-[hsl(var(--app-muted))] hover:text-[hsl(var(--app-text))]"
              >
                ✕
              </button>
            </div>
            {selectedTool.description && (
              <p className="text-sm text-[hsl(var(--app-muted))] mb-4">{selectedTool.description}</p>
            )}
            {typeof selectedTool.tool_count === "number" && (
              <div className="mb-4">
                <span className="text-xs text-[hsl(var(--app-muted))]">{selectedTool.tool_count} tools</span>
              </div>
            )}
            {detailLoading && (
              <div className="text-sm text-[hsl(var(--app-muted))]">Loading details...</div>
            )}
            {toolDetail && (
              <div className="flex-1 overflow-y-auto">
                <pre className="text-xs text-[hsl(var(--app-muted))] whitespace-pre-wrap bg-[hsl(var(--app-surface-2))] p-4 rounded">
                  {JSON.stringify(toolDetail, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
