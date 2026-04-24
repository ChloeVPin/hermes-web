import { useState } from "react";
import { ShieldAlert, HelpCircle } from "lucide-react";

type ClarifyFlowProps = {
  type: "clarify";
  question: string;
  choices: string[] | null;
  onRespond: (answer: string) => void;
};

type ApprovalFlowProps = {
  type: "approval";
  command: string;
  description: string;
  onApprove: () => void;
  onDeny: () => void;
};

type Props = ClarifyFlowProps | ApprovalFlowProps;

export function HermesInteractiveFlow(props: Props) {
  const [answer, setAnswer] = useState("");

  if (props.type === "clarify") {
    return (
      <div className="rounded-md border border-blue-500/30 bg-blue-500/10 px-4 py-3">
        <div className="flex items-start gap-2">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[hsl(var(--app-text))]">
              {props.question}
            </div>

            {props.choices && props.choices.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {props.choices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => props.onRespond(choice)}
                    className="rounded-md border border-blue-500/30 bg-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-200 transition hover:bg-blue-500/30"
                  >
                    {choice}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && answer.trim()) {
                      props.onRespond(answer.trim());
                      setAnswer("");
                    }
                  }}
                  placeholder="Type your answer..."
                  className="flex-1 rounded-md border border-[hsl(var(--app-border))] bg-[hsl(var(--app-surface))] px-3 py-1.5 text-sm text-[hsl(var(--app-text))] outline-none placeholder:text-[hsl(var(--app-muted))]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    if (answer.trim()) {
                      props.onRespond(answer.trim());
                      setAnswer("");
                    }
                  }}
                  className="rounded-md border border-blue-500/30 bg-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-200 transition hover:bg-blue-500/30"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Approval flow
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[hsl(var(--app-text))]">
            Approval required
          </div>
          <div className="mt-1 font-mono text-xs text-[hsl(var(--app-muted))]">
            {props.command}
          </div>
          {props.description && (
            <div className="mt-1 text-xs text-[hsl(var(--app-muted))]">
              {props.description}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={props.onApprove}
              className="rounded-md border border-green-500/30 bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-200 transition hover:bg-green-500/30"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={props.onDeny}
              className="rounded-md border border-red-500/30 bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/30"
            >
              Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
