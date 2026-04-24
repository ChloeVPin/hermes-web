import { useEffect, useState } from "react";
import {
  Plus,
  MessageSquareText,
  PanelLeftClose,
  Trash2,
  Zap,
  Boxes,
  SquareTerminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionListItem, SessionInfo } from "@/lib/gateway-types";
import type { ConnectionState, GatewayClient } from "@/lib/gateway-client";

type Tab = "chats" | "skills" | "tools";

interface SkillItem {
  name: string;
  description?: string;
  category?: string;
  installed?: boolean;
}

interface ToolsetItem {
  name: string;
  description?: string;
  tool_count?: number;
  enabled?: boolean;
}

export function HermesSidebar({
  sessions,
  activeSessionId,
  sessionInfo,
  connectionState,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onClose,
  client,
  onSkillClick,
  onToolClick,
}: {
  sessions: SessionListItem[];
  activeSessionId: string | null;
  sessionInfo: SessionInfo | null;
  connectionState: ConnectionState;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => Promise<boolean>;
  onClose?: () => void;
  client: GatewayClient;
  onSkillClick?: (skill: SkillItem) => void;
  onToolClick?: (tool: ToolsetItem) => void;
}) {
  const isConnected = connectionState === "connected";
  const [tab, setTab] = useState<Tab>("chats");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [toolsets, setToolsets] = useState<ToolsetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  const fetchSkills = async () => {
    if (!activeSessionId) return;
    setLoading(true);
    try {
      const res = await client.skillsManage({ session_id: activeSessionId, action: "list" });
      const raw = (res as { skills?: unknown })?.skills;
      // skills.manage returns {skills: {category: [skill_names...]}}
      // Flatten into array of skill objects with category
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const flattened: SkillItem[] = [];
        for (const [category, skillList] of Object.entries(raw as Record<string, unknown>)) {
          if (Array.isArray(skillList)) {
            for (const s of skillList) {
              flattened.push({
                name: String(s),
                category,
              });
            }
          }
        }
        setSkills(flattened);
      } else if (Array.isArray(raw)) {
        setSkills(
          raw.map((s) =>
            typeof s === "string"
              ? { name: s, category: "" }
              : { name: String(s.name || ""), category: String(s.category || "") }
          )
        );
      } else {
        setSkills([]);
      }
    } catch (err) {
      console.error("Failed to fetch skills:", err);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  };

  // Lazy-load skills/tools when their tab is first opened
  useEffect(() => {
    if (!isConnected) return;
    if (tab === "skills" && skills.length === 0) {
      fetchSkills();
    }
    if (tab === "tools" && toolsets.length === 0) {
      setLoading(true);
      client
        .toolsList({ session_id: activeSessionId ?? "" })
        .then((res) => {
          const raw = (res as { toolsets?: ToolsetItem[] })?.toolsets;
          if (Array.isArray(raw)) setToolsets(raw);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [tab, isConnected, client, activeSessionId, skills.length, toolsets.length]);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    console.log('[Sidebar] Delete clicked for session:', id);
    setSessionToDelete(id);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return;
    console.log('[Sidebar] Confirming delete for session:', sessionToDelete);
    setDeletingId(sessionToDelete);
    setShowDeleteModal(false);
    try {
      console.log('[Sidebar] Calling onDeleteSession with id:', sessionToDelete);
      const result = await onDeleteSession(sessionToDelete);
      console.log('[Sidebar] Delete result:', result);
    } catch (err) {
      console.error('[Sidebar] Failed to delete session:', err);
    } finally {
      console.log('[Sidebar] Resetting delete state');
      setDeletingId(null);
      setSessionToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    console.log('[Sidebar] Cancelled delete');
    setShowDeleteModal(false);
    setSessionToDelete(null);
  };

  return (
    <aside className="flex h-full w-full flex-col rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] shadow-2xl backdrop-blur-xl">
      <div className="relative flex items-center justify-center border-b border-[hsl(var(--app-border))] px-3 py-4">
        <img src="/logo-banner.png" alt="Hermes Agent" className="h-10 w-auto object-contain" />
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 inline-flex items-center justify-center rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface-2))] p-2 text-[hsl(var(--app-muted))] transition hover:text-[hsl(var(--app-text))]"
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 border-b border-[hsl(var(--app-border))] pt-2">
        <TabButton active={tab === "chats"} onClick={() => setTab("chats")} icon={<SquareTerminal className="h-3.5 w-3.5" />} label="Chats" />
        <TabButton active={tab === "skills"} onClick={() => setTab("skills")} icon={<Zap className="h-3.5 w-3.5" />} label="Skills" />
        <TabButton active={tab === "tools"} onClick={() => setTab("tools")} icon={<Boxes className="h-3.5 w-3.5" />} label="Tools" />
      </div>

      {tab === "chats" && (
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={onNewChat}
            disabled={!isConnected}
            className={cn(
              "inline-flex w-full items-center justify-center gap-2 rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface-2))] px-3 py-2.5 text-sm font-medium text-[hsl(var(--app-text))] transition hover:bg-[hsl(var(--app-surface-3))]",
              !isConnected && "cursor-not-allowed opacity-50",
            )}
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {tab === "chats" && (
          <>
            <div className="px-1 pb-2 pt-1 text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--app-muted))]">
              Recent sessions
            </div>
            <div className="space-y-1">
              {sessions.length === 0 && (
                <div className="px-1 py-4 text-xs text-[hsl(var(--app-muted))]">No sessions yet</div>
              )}
              {sessions.map((session) => {
                const selected = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    className={cn(
                      "group relative flex w-full items-start gap-2 rounded-md border px-3 py-2.5 text-left transition",
                      selected
                        ? "border-[hsl(var(--app-accent)/0.5)] bg-[hsl(var(--app-surface-3))]"
                        : "border-transparent hover:border-[hsl(var(--app-border))] hover:bg-[hsl(var(--app-surface-2))]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectSession(session.id)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                      title={session.title || session.preview || session.id}
                    >
                      <MessageSquareText className={cn("mt-0.5 h-4 w-4 shrink-0", selected ? "text-[hsl(var(--app-accent))]" : "text-[hsl(var(--app-muted))]")} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[hsl(var(--app-text))]">
                          {session.title || "Untitled"}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-[hsl(var(--app-muted))]">
                          {session.preview || `${session.message_count} messages`}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, session.id)}
                      disabled={deletingId === session.id}
                      className={cn(
                        "shrink-0 rounded p-1 transition",
                        "text-[hsl(var(--app-muted))] opacity-0 hover:bg-[hsl(var(--app-surface-3))] hover:text-red-400 group-hover:opacity-100",
                        deletingId === session.id && "cursor-not-allowed opacity-50",
                      )}
                      aria-label="Delete session"
                      title="Delete"
                    >
                      {deletingId === session.id ? (
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === "skills" && (
          <div className="pt-2">
            {loading && <div className="px-1 py-4 text-xs text-[hsl(var(--app-muted))]">Loading…</div>}
            {!loading && skills.length === 0 && (
              <div className="px-1 py-4 text-xs text-[hsl(var(--app-muted))]">No skills available</div>
            )}
            {!loading && skills.length > 0 && (
              <>
                {(() => {
                  // Group skills by category
                  const grouped = skills.reduce((acc, skill) => {
                    const cat = skill.category || "Uncategorized";
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(skill);
                    return acc;
                  }, {} as Record<string, SkillItem[]>);

                  return Object.entries(grouped).map(([category, categorySkills]) => (
                    <div key={category} className="mb-4">
                      <div className="px-1 pb-2 text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--app-muted))]">
                        {category}
                      </div>
                      <div className="space-y-1">
                        {categorySkills.map((skill) => (
                          <div
                            key={skill.name}
                            onClick={() => onSkillClick?.(skill)}
                            className="rounded-md border border-transparent px-3 py-2 text-left transition hover:border-[hsl(var(--app-border))] hover:bg-[hsl(var(--app-surface-2))] cursor-pointer"
                          >
                            <div className="truncate text-sm font-medium text-[hsl(var(--app-text))]">
                              {skill.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </>
            )}
          </div>
        )}

        {tab === "tools" && (
          <div className="pt-2">
            {loading && <div className="px-1 py-4 text-xs text-[hsl(var(--app-muted))]">Loading…</div>}
            {!loading && toolsets.length === 0 && (
              <div className="px-1 py-4 text-xs text-[hsl(var(--app-muted))]">No toolsets available</div>
            )}
            {!loading && toolsets.length > 0 && (
              <>
                {/* Enabled Toolsets Section */}
                {toolsets.filter(ts => ts.enabled).length > 0 && (
                  <>
                    <div className="px-1 pb-2 text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--app-accent))]">
                      Enabled
                    </div>
                    <div className="space-y-1 mb-4">
                      {toolsets.filter(ts => ts.enabled).map((ts) => (
                        <div
                          key={ts.name}
                          onClick={() => onToolClick?.(ts)}
                          className="rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] px-3 py-2 text-left transition hover:border-[hsl(var(--app-accent))] cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <Boxes className="h-4 w-4 shrink-0 text-[hsl(var(--app-accent))]" />
                            <span className="truncate text-sm font-medium text-[hsl(var(--app-text))]">{ts.name}</span>
                            {typeof ts.tool_count === "number" && (
                              <span className="ml-auto shrink-0 text-[10px] font-mono text-[hsl(var(--app-muted))]">{ts.tool_count} tools</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {/* Disabled Toolsets Section */}
                {toolsets.filter(ts => !ts.enabled).length > 0 && (
                  <>
                    <div className="px-1 pb-2 text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--app-muted))]">
                      Disabled
                    </div>
                    <div className="space-y-1">
                      {toolsets.filter(ts => !ts.enabled).map((ts) => (
                        <div
                          key={ts.name}
                          onClick={() => onToolClick?.(ts)}
                          className="rounded-md border border-transparent bg-[hsl(var(--app-surface-2))] px-3 py-2 text-left transition hover:border-[hsl(var(--app-border))] hover:bg-[hsl(var(--app-surface-3))] cursor-pointer opacity-60"
                        >
                          <div className="flex items-center gap-2">
                            <Boxes className="h-4 w-4 shrink-0 text-[hsl(var(--app-muted))]" />
                            <span className="truncate text-sm font-medium text-[hsl(var(--app-text))]">{ts.name}</span>
                            {typeof ts.tool_count === "number" && (
                              <span className="ml-auto shrink-0 text-[10px] font-mono text-[hsl(var(--app-muted))]">{ts.tool_count} tools</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-[hsl(var(--app-border))] px-4 py-3">
        <div className="flex justify-center gap-3 text-[9px] font-mono uppercase tracking-[0.2em] text-[hsl(var(--app-muted))]">
          <a
            href="https://github.com/ChloeVPin/hermes-web"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[hsl(var(--app-text))] transition"
          >
            Open source
          </a>
          {" · "}
          <a
            href="https://github.com/ChloeVPin/hermes-web/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[hsl(var(--app-text))] transition"
          >
            MIT
          </a>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-lg border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-[hsl(var(--app-text))] mb-2">Delete chat?</h3>
            <p className="text-sm text-[hsl(var(--app-muted))] mb-6">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleCancelDelete}
                className="inline-flex items-center justify-center rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface-2))] px-4 py-2 text-sm font-medium text-[hsl(var(--app-text))] transition hover:bg-[hsl(var(--app-surface-3))]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="inline-flex items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-center gap-1.5 rounded-t-md border-b-2 py-2 text-[11px] font-mono uppercase tracking-[0.15em] transition",
        active
          ? "border-[hsl(var(--app-accent))] text-[hsl(var(--app-text))]"
          : "border-transparent text-[hsl(var(--app-muted))] hover:text-[hsl(var(--app-text))]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
