import { useEffect, useRef, useState } from "react";
import { Send, StopCircle } from "lucide-react";
import type { MutableRefObject } from "react";
import { PromptInput, PromptInputTextarea } from "@/components/prompt-kit/index";
import { HermesSlashMenu, type SlashMenuHandle, type SlashMenuItem } from "./hermes-slash-menu";
import { cn } from "@/lib/utils";

export function HermesPromptComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  inputRef,
  isAgentWorking,
  onInterrupt,
  catalogCommands,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  inputRef: MutableRefObject<HTMLTextAreaElement | null>;
  isAgentWorking?: boolean;
  onInterrupt?: () => void;
  catalogCommands?: SlashMenuItem[];
}) {
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const menuRef = useRef<SlashMenuHandle>(null);

  const showSlash = value.startsWith("/") && !value.includes(" ");

  useEffect(() => {
    setSlashMenuOpen(showSlash);
  }, [showSlash]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 180);
    textarea.style.height = `${Math.max(nextHeight, 52)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 180 ? "auto" : "hidden";
  }, [value]);

  const handleSlashSelect = (command: string) => {
    if (command) {
      onChange(command + " ");
    }
    setSlashMenuOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenuOpen && menuRef.current) {
      const handled = menuRef.current.handleKey(event.key);
      if (handled) {
        event.preventDefault();
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 px-4 sm:bottom-5 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="pointer-events-auto relative">
          <HermesSlashMenu
            ref={menuRef}
            inputValue={value}
            visible={slashMenuOpen}
            onSelect={handleSlashSelect}
            extraCommands={catalogCommands}
          />

          <PromptInput className="overflow-hidden rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] shadow-[0_16px_48px_rgba(0,0,0,0.14)]">
            <PromptInputTextarea
              ref={inputRef}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isAgentWorking ? "Agent is working... (type to steer)" : "Message Hermes, use /commands for TUI features"}
              aria-label="Message input"
              className="min-h-[52px] resize-none px-4 py-3"
            />
            <div className="flex items-center justify-between border-t border-[hsl(var(--app-border))] px-3 py-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--app-muted))]">
                {value.startsWith("/") ? "slash command · ↑↓ navigate · enter select" : "enter to send · shift+enter new line"}
              </div>
              <div className="flex items-center gap-2">
                {isAgentWorking && onInterrupt && (
                  <button
                    type="button"
                    onClick={onInterrupt}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
                  >
                    <StopCircle className="h-3.5 w-3.5" />
                    Stop
                  </button>
                )}
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={disabled || !value.trim()}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition",
                    disabled || !value.trim()
                      ? "cursor-not-allowed border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-muted))]"
                      : "border-[hsl(var(--app-border))] bg-[hsl(var(--app-text))] text-[hsl(var(--app-bg))] hover:opacity-90",
                  )}
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
              </div>
            </div>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
