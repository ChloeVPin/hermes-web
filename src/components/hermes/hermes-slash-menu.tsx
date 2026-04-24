import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlashMenuItem {
  command: string;
  description: string;
  category?: string;
}

export interface SlashMenuHandle {
  handleKey: (key: string) => boolean;
}

const BUILT_IN_COMMANDS: SlashMenuItem[] = [
  { command: "/help", description: "Show all available commands", category: "General" },
  { command: "/new", description: "Start a new session", category: "Session" },
  { command: "/sessions", description: "List recent sessions", category: "Session" },
  { command: "/resume", description: "Resume a previous session", category: "Session" },
  { command: "/branch", description: "Branch the current session", category: "Session" },
  { command: "/undo", description: "Undo last message(s)", category: "Session" },
  { command: "/compress", description: "Compress session context", category: "Session" },
  { command: "/save", description: "Save current session", category: "Session" },
  { command: "/model", description: "Switch model or provider", category: "Config" },
  { command: "/config", description: "View or change configuration", category: "Config" },
  { command: "/tools", description: "List available tools", category: "Tools" },
  { command: "/toolsets", description: "Manage toolsets", category: "Tools" },
  { command: "/skills", description: "View and manage skills", category: "Tools" },
  { command: "/agents", description: "List available agents", category: "Tools" },
  { command: "/mcp", description: "Reload MCP servers", category: "Tools" },
  { command: "/shell", description: "Run a shell command", category: "System" },
  { command: "/browser", description: "Manage browser instance", category: "System" },
  { command: "/cron", description: "Manage cron jobs", category: "System" },
  { command: "/rollback", description: "List file rollback points", category: "System" },
  { command: "/voice", description: "Toggle voice input", category: "Input" },
  { command: "/bg", description: "Send prompt as background task", category: "Input" },
  { command: "/btw", description: "Inject context while agent works", category: "Input" },
  { command: "/steer", description: "Steer the agent mid-response", category: "Input" },
  { command: "/usage", description: "Show token usage and cost", category: "Info" },
  { command: "/insights", description: "View session insights", category: "Info" },
  { command: "/plugins", description: "List plugins", category: "Info" },
  { command: "/history", description: "Show message history", category: "Info" },
];

export const HermesSlashMenu = forwardRef<
  SlashMenuHandle,
  {
    inputValue: string;
    visible: boolean;
    onSelect: (command: string) => void;
    extraCommands?: SlashMenuItem[];
  }
>(function HermesSlashMenu({ inputValue, visible, onSelect, extraCommands }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Merge built-in commands with any dynamic commands from the gateway
  const allCommands = extraCommands?.length
    ? [...BUILT_IN_COMMANDS, ...extraCommands.filter((ec) => !BUILT_IN_COMMANDS.some((b) => b.command === ec.command))]
    : BUILT_IN_COMMANDS;

  const query = inputValue.startsWith("/") ? inputValue.slice(1).toLowerCase() : "";
  const filtered = allCommands.filter(
    (item) =>
      item.command.slice(1).toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query)
  );

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-slash-item]");
    items[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Expose keyboard handler to parent
  useImperativeHandle(ref, () => ({
    handleKey(key: string): boolean {
      if (key === "ArrowUp") {
        setSelectedIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
        return true;
      }
      if (key === "ArrowDown") {
        setSelectedIndex((i) => (i >= filtered.length - 1 ? 0 : i + 1));
        return true;
      }
      if (key === "Enter" || key === "Tab") {
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex].command);
        }
        return true;
      }
      if (key === "Escape") {
        onSelect("");
        return true;
      }
      return false;
    },
  }));

  if (!visible || filtered.length === 0) return null;

  // Group by category
  const grouped = new Map<string, SlashMenuItem[]>();
  for (const item of filtered) {
    const cat = item.category ?? "Other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  let flatIdx = 0;

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-1 max-h-72 overflow-y-auto rounded-lg border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] shadow-2xl"
      ref={listRef}
    >
      <div className="sticky top-0 border-b border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-[hsl(var(--app-muted))]">
          <Terminal className="h-3 w-3" />
          Commands
          <span className="ml-auto">{filtered.length}</span>
        </div>
      </div>
      <div className="py-1">
        {Array.from(grouped.entries()).map(([category, items]) => (
          <div key={category}>
            <div className="px-3 pt-2 pb-1 text-[9px] font-mono uppercase tracking-[0.25em] text-[hsl(var(--app-muted))]">
              {category}
            </div>
            {items.map((item) => {
              const idx = flatIdx++;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.command}
                  data-slash-item
                  type="button"
                  onClick={() => onSelect(item.command)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors",
                    isSelected
                      ? "bg-[hsl(var(--app-surface-2))]"
                      : "hover:bg-[hsl(var(--app-surface-2))]",
                  )}
                >
                  <span className="shrink-0 font-mono text-xs font-medium text-[hsl(var(--app-text))]">
                    {item.command}
                  </span>
                  <span className="truncate text-xs text-[hsl(var(--app-muted))]">
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

export { BUILT_IN_COMMANDS };
