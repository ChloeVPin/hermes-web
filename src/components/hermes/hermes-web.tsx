import { useEffect, useRef, useState, useCallback } from "react";
import type { MutableRefObject } from "react";
import { HermesLoader } from "@/components/prompt-kit/index";
import { HermesMessage } from "./hermes-message";
import { HermesPromptComposer } from "./hermes-prompt-composer";
import { HermesToolActivity } from "./hermes-tool-activity";
import { HermesInteractiveFlow } from "./hermes-interactive-flow";
import type { ChatMessage, ActiveTool, ActiveSubagent } from "@/lib/use-gateway";
import type { ClarifyRequest, ApprovalRequest } from "@/lib/gateway-types";
import type { SlashMenuItem } from "./hermes-slash-menu";

export function HermesWeb({
  messages,
  isAgentWorking,
  activeTools,
  activeSubagents,
  pendingClarify,
  pendingApproval,
  onRespondClarify,
  onRespondApproval,
  onInterrupt,
  draft,
  onDraftChange,
  onSubmit,
  inputRef,
  isBusy,
  sessionId,
  catalogCommands,
}: {
  messages: ChatMessage[];
  isAgentWorking: boolean;
  activeTools: ActiveTool[];
  activeSubagents: ActiveSubagent[];
  pendingClarify: ClarifyRequest | null;
  pendingApproval: ApprovalRequest | null;
  onRespondClarify: (answer: string) => Promise<void>;
  onRespondApproval: (approved: boolean) => Promise<void>;
  onInterrupt: () => Promise<void>;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  inputRef: MutableRefObject<HTMLTextAreaElement | null>;
  isBusy: boolean;
  sessionId: string | null;
  catalogCommands?: SlashMenuItem[];
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const wasAgentWorking = useRef(false);
  const lastMessageRef = useRef<HTMLDivElement | null>(null);
  const prevMessageCountRef = useRef(0);

  // While agent is working, keep scrolling to bottom to follow activity
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // Agent just finished, scroll to start of the last assistant message
    if (wasAgentWorking.current && !isAgentWorking && messages.length > 0) {
      wasAgentWorking.current = false;
      requestAnimationFrame(() => {
        if (lastMessageRef.current) {
          lastMessageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      return;
    }

    wasAgentWorking.current = isAgentWorking;

    // While working or streaming, follow the bottom
    if (isAgentWorking || activeTools.length > 0) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [messages, isAgentWorking, activeTools]);

  // When new messages are added, scroll to the latest
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || messages.length === 0) return;

    // Only scroll if a new message was actually added (not just content updates)
    if (messages.length <= prevMessageCountRef.current) {
      prevMessageCountRef.current = messages.length;
      return;
    }
    prevMessageCountRef.current = messages.length;

    // Scroll to bottom to show the new message
    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });
  }, [messages]);

  const handleScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const fromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    setShowScrollButton(fromBottom > 220);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-44 pt-6 sm:px-6 sm:pt-8 scroll-smooth"
      >
        {/* Empty state, centered vertically, hidden once chatting */}
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center text-center pb-32">
            <div className="mb-4 flex items-center justify-center rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] px-3 py-2">
              <img src="/logo.png" alt="Hermes" className="h-12 w-12 object-contain opacity-90" />
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--app-muted))]">
              {sessionId ? "Session ready" : "Start a new chat"}
            </div>
            <p className="mt-2 max-w-md text-sm text-[hsl(var(--app-muted))]">
              Send a message, use /commands, or ask Hermes anything.
              All TUI commands work here, try /help for the full list.
            </p>
          </div>
        )}

        <div className="mx-auto w-full max-w-4xl space-y-6">
          {/* Messages */}
          {messages.map((message, idx) => {
            // Track the last assistant message for scroll-to after completion
            const isLastAssistant =
              message.role === "assistant" &&
              !messages.slice(idx + 1).some((m) => m.role === "assistant");
            return (
              <div key={message.id} ref={isLastAssistant ? lastMessageRef : undefined}>
                <HermesMessage message={message} />
              </div>
            );
          })}

          {/* Active tools */}
          {activeTools.length > 0 && (
            <HermesToolActivity tools={activeTools} subagents={activeSubagents} />
          )}

          {/* Interactive flows */}
          {pendingClarify && (
            <HermesInteractiveFlow
              type="clarify"
              question={pendingClarify.question}
              choices={pendingClarify.choices}
              onRespond={onRespondClarify}
            />
          )}
          {pendingApproval && (
            <HermesInteractiveFlow
              type="approval"
              command={pendingApproval.command}
              description={pendingApproval.description}
              onApprove={() => onRespondApproval(true)}
              onDeny={() => onRespondApproval(false)}
            />
          )}

          {/* Agent working indicator */}
          {isAgentWorking && activeTools.length === 0 && !messages[messages.length - 1]?.isStreaming && (
            <div className="rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] px-3 py-2 text-xs text-[hsl(var(--app-muted))]">
              <div className="flex items-center gap-2">
                <HermesLoader label="Thinking" />
              </div>
            </div>
          )}
        </div>

        {showScrollButton ? (
          <button
            type="button"
            onClick={() => scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" })}
            className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] text-[hsl(var(--app-muted))] shadow-lg transition hover:text-[hsl(var(--app-text))] hover:bg-[hsl(var(--app-surface-2))]"
            aria-label="Scroll to latest"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        ) : null}
      </div>

      <HermesPromptComposer
        value={draft}
        onChange={onDraftChange}
        onSubmit={onSubmit}
        disabled={isBusy}
        inputRef={inputRef}
        isAgentWorking={isAgentWorking}
        onInterrupt={onInterrupt}
        catalogCommands={catalogCommands}
      />
    </section>
  );
}
