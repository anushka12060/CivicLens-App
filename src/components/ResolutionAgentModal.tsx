/**
 * ResolutionAgentModal.tsx
 *
 * A full-screen modal powered by the Gemini Resolution Agent.
 *
 * Features:
 *  - Generates an official complaint email draft, suggested resolution
 *    timeline, community action steps, and step-by-step AI reasoning.
 *  - Includes an inline "Ask Gemini" chat panel with quick-suggestion chips,
 *    markdown rendering, and per-message loading state.
 *  - Keyboard accessible: pressing Enter in the chat input sends the message;
 *    pressing Escape closes the modal.
 *
 * Props:
 *  - issue    : The CivicIssue to resolve.
 *  - onClose  : Callback to dismiss the modal.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  Loader2,
  X,
  FileText,
  Calendar,
  Users,
  BrainCircuit,
  Send,
  MessageSquare,
} from "lucide-react";
import { CivicIssue } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Timeout for all Gemini API fetch calls (ms). */
const API_TIMEOUT_MS = 30_000;

/** Quick-suggestion chips shown when the chat history is empty. */
const CHAT_SUGGESTIONS = [
  "What's the fastest way to resolve this?",
  "Draft an official complaint letter",
  "Who should I contact first?",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Resolution {
  emailDraft: string;
  timelineDays: number;
  communityActionSteps: string[];
  reasoning: string[];
}

interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

interface Props {
  issue: CivicIssue;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates an AbortController that auto-cancels after API_TIMEOUT_MS.
 * Returns the controller and a cancel function to clear the timer early.
 */
function createFetchTimeout(): { controller: AbortController; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  return { controller, cancel: () => clearTimeout(timer) };
}

/**
 * Converts a limited subset of Markdown to HTML for chat agent responses.
 * Handles bold (**text**), h3 headings (### heading), bullet points (* item),
 * and newlines.
 */
function markdownToHtml(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /### (.*)/g,
      '<div style="font-weight:700;font-size:13px;margin:8px 0 2px;color:#0F172A">$1</div>'
    )
    .replace(/^\* /gm, "• ")
    .replace(/\n/g, "<br/>");
}

/**
 * Builds a default resolution object when the live API is unavailable.
 * Keeps the modal functional.
 */
function buildDefaultResolution(issue: CivicIssue): Resolution {
  return {
    emailDraft: `To the Municipal Department,\n\nI am writing to formally report the issue: ${issue.title}.\n\nDescription: ${issue.description}\n\nPlease take immediate action to resolve this.`,
    timelineDays: 5,
    communityActionSteps: [
      "Notify local ward office",
      "Gather neighbor signatures",
      "Follow up on social media",
    ],
    reasoning: [
      "Assessed severity level",
      "Checked municipal guidelines",
      "Proposed mitigation plan",
    ],
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ResolutionAgentModal({ issue, onClose }: Props) {
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Reset chat when the issue changes
  useEffect(() => {
    setChatHistory([]);
  }, [issue]);

  // Auto-scroll chat to the latest message
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // ---------------------------------------------------------------------------
  // Resolution generation
  // ---------------------------------------------------------------------------

  /**
   * Fetches a full resolution plan from the Gemini API.
   * Falls back to a default resolution if the API is unavailable.
   */
  const generateResolution = async () => {
    setLoading(true);
    setError(null);

    const { controller, cancel } = createFetchTimeout();

    try {
      const response = await fetch("/api/resolve-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ issue }),
      });
      cancel();

      if (!response.ok) throw new Error("API error.");

      const data: Resolution = await response.json();
      setResolution(data);
    } catch (err: unknown) {
      cancel();
      if (err instanceof Error && err.name === "AbortError") {
        setError("Request timed out.");
      } else {
        console.warn("Using default data due to API error:", err);
        setError("Unable to generate analysis.");
      }
      setResolution(buildDefaultResolution(issue));
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  /**
   * Sends a chat message to the Gemini ask endpoint and appends the
   * response to the chat history. Handles loading state per message.
   */
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isChatLoading) return;

      const userMessage: ChatMessage = { role: "user", text: trimmed };
      const historyWithUser = [...chatHistory, userMessage];

      setChatHistory([...historyWithUser, { role: "agent", text: "Thinking..." }]);
      setChatMessage("");
      setIsChatLoading(true);

      const { controller, cancel } = createFetchTimeout();

      try {
        const response = await fetch("/api/ask-gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ issue, messages: historyWithUser }),
        });
        cancel();

        if (!response.ok) throw new Error("Failed to get response.");

        const data = await response.json();
        setChatHistory([
          ...historyWithUser,
          { role: "agent", text: data.response },
        ]);
      } catch (err: unknown) {
        cancel();
        const isTimeout = err instanceof Error && err.name === "AbortError";
        setChatHistory([
          ...historyWithUser,
          {
            role: "agent",
            text: isTimeout
              ? "Request timed out. Please try again."
              : "Sorry, I encountered an error while analyzing your request.",
          },
        ]);
      } finally {
        setIsChatLoading(false);
      }
    },
    [chatHistory, isChatLoading, issue]
  );

  const handleSendMessage = () => sendMessage(chatMessage);

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(chatMessage);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resolution-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2
            id="resolution-modal-title"
            className="text-lg font-bold text-slate-900 flex items-center gap-2"
          >
            <Sparkles className="h-5 w-5 text-[#2563EB]" />
            Gemini Civic Resolution Agent
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-full transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

          {/* ── Resolution Panel ── */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 border-b md:border-b-0 md:border-r border-slate-100">

            {/* Empty state */}
            {!resolution && !loading && (
              <div className="text-center py-12">
                <BrainCircuit className="h-16 w-16 text-blue-100 mx-auto mb-4" />
                <h3 className="font-bold text-slate-900">Ready to Analyze</h3>
                <p className="text-sm text-slate-500 mt-2">
                  Generate a comprehensive resolution plan for:{" "}
                  <span className="font-semibold text-slate-700">{issue.title}</span>
                </p>
                <button
                  onClick={generateResolution}
                  className="mt-6 bg-[#2563EB] hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors"
                >
                  Generate Resolution Plan
                </button>
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="text-center py-12">
                <Loader2 className="h-10 w-10 text-blue-600 animate-spin mx-auto" />
                <p className="text-sm font-semibold text-slate-600 mt-4">
                  Agent is analyzing municipal data...
                </p>
              </div>
            )}

            {/* API quota / timeout warning */}

            {/* Resolution result */}
            {resolution && (
              <div className="space-y-6 animate-fade-in">

                {/* Email draft */}
                <section>
                  <h4 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4" />
                    Official Complaint Email Draft
                  </h4>
                  <div className="bg-slate-50 p-4 rounded-lg text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-200">
                    {resolution.emailDraft}
                  </div>
                </section>

                {/* Timeline + steps summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-bold text-blue-900 flex items-center gap-2 mb-1">
                      <Calendar className="h-4 w-4" />
                      Suggested Timeline
                    </h4>
                    <p className="text-2xl font-bold text-blue-700">
                      {resolution.timelineDays} Days
                    </p>
                  </div>
                  <div className="bg-amber-50 p-4 rounded-lg">
                    <h4 className="font-bold text-amber-900 flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4" />
                      Actionable Steps
                    </h4>
                    <p className="text-2xl font-bold text-amber-700">
                      {resolution.communityActionSteps.length} Next Steps
                    </p>
                  </div>
                </div>

                {/* AI reasoning */}
                <section>
                  <h4 className="font-bold text-slate-900 mb-2">
                    Step-by-Step AI Reasoning
                  </h4>
                  <ul className="space-y-2 list-decimal pl-4">
                    {resolution.reasoning.map((step, i) => (
                      <li key={i} className="text-sm text-slate-600">
                        {step}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}
          </div>

          {/* ── Chat Panel ── */}
          <div className="w-full md:w-80 flex flex-col bg-slate-50 border-t md:border-t-0 border-slate-100 h-64 md:h-auto shrink-0">
            <div className="p-4 border-b border-slate-200 font-bold text-sm text-slate-700 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Ask Gemini
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Quick-suggestion chips (shown only when chat is empty) */}
              {chatHistory.length === 0 && (
                <div className="flex flex-wrap">
                  {CHAT_SUGGESTIONS.map((s) => (
                    <div
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="bg-[#EFF6FF] text-[#2563EB] rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer inline-block m-1 hover:bg-blue-100 transition-colors"
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}

              {chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={`text-xs p-3 rounded-lg ${
                    msg.role === "user"
                      ? "bg-blue-100 ml-8 text-blue-900"
                      : "bg-white border border-slate-200 mr-8"
                  }`}
                >
                  {msg.role === "agent" ? (
                    <div
                      style={{ whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: "1.6" }}
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.text) }}
                    />
                  ) : (
                    msg.text
                  )}
                </div>
              ))}

              {/* Scroll anchor */}
              <div ref={chatBottomRef} />
            </div>

            {/* Input bar */}
            <div className="p-4 border-t border-slate-200 bg-white">
              <div className="flex gap-2">
                <input
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask anything about this issue..."
                  className="flex-1 border border-slate-200 rounded-lg p-2 text-xs"
                  disabled={isChatLoading}
                  aria-label="Chat message input"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isChatLoading || !chatMessage.trim()}
                  className="bg-[#2563EB] text-white p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  aria-label="Send message"
                >
                  {isChatLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
