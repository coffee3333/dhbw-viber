import React, { useEffect, useRef, useState } from "react";
import {
  Bot,
  Send,
  Sparkles,
  Trash2,
  X,
  Edit3,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  Zap,
} from "lucide-react";
import { agentApi, type AgentChatMessage } from "../api/agentApi";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface AgentChatPanelProps {
  scope: "lecture" | "subject";
  lectureId?: string;
  lectureTitle?: string;
  subjectId?: string;
  subjectName?: string;
  isOpen: boolean;
  onToggle: () => void;
  onSummaryUpdated?: (newMarkdown: string) => void;
  onOpenCredentialsModal?: () => void;
}

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  scope,
  lectureId,
  lectureTitle,
  subjectId,
  subjectName,
  isOpen,
  onToggle,
  onSummaryUpdated,
  onOpenCredentialsModal,
}) => {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [copiedMessageIdx, setCopiedMessageIdx] = useState<number | null>(null);
  const [panelWidth, setPanelWidth] = useState<number>(380);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [tokenSaver, setTokenSaver] = useState<boolean>(() => {
    const saved = localStorage.getItem("meeting_agent_token_saver");
    return saved !== null ? saved === "true" : true;
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resizing logic
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 300 && newWidth <= 750) {
        setPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
      }
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const toggleTokenSaver = () => {
    setTokenSaver((prev) => {
      const next = !prev;
      localStorage.setItem("meeting_agent_token_saver", String(next));
      return next;
    });
  };

  const handleCopyMessage = (content: string, idx: number) => {
    navigator.clipboard.writeText(content);
    setCopiedMessageIdx(idx);
    setTimeout(() => setCopiedMessageIdx(null), 2000);
  };

  const effectiveThreadId =
    scope === "lecture" && lectureId
      ? `lec_chat_${lectureId}`
      : `subj_chat_${subjectId || "general"}`;

  // Load message history on thread change
  useEffect(() => {
    let isMounted = true;
    const loadHistory = async () => {
      try {
        const res = await agentApi.getHistory(effectiveThreadId);
        if (isMounted && res.messages) {
          setMessages(
            res.messages.map((m) => ({
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load chat history:", err);
      }
    };

    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [effectiveThreadId]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const message = (textToSend || inputValue).trim();
    if (!message || isLoading) return;

    const userMsg: AgentChatMessage = {
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputValue("");
    setIsLoading(true);

    try {
      const res = await agentApi.sendMessage({
        message,
        scope,
        lecture_id: lectureId,
        subject_id: subjectId,
        thread_id: effectiveThreadId,
        token_saver: tokenSaver,
      });

      const assistantMsg: AgentChatMessage = {
        role: "assistant",
        content: res.response,
        timestamp: new Date().toISOString(),
        actions_taken: res.actions_taken,
        updated_summary: res.updated_summary,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // If agent edited the summary live, notify the parent component
      if (res.updated_summary && onSummaryUpdated) {
        onSummaryUpdated(res.updated_summary);
      }
    } catch (err: any) {
      const errDetail = err?.response?.data?.detail || err?.message || "";
      const isApiKeyMissing =
        errDetail.includes("API key") ||
        errDetail.includes("token") ||
        errDetail.includes("BYOK") ||
        errDetail.includes("credentials") ||
        errDetail.includes("OpenAI") ||
        errDetail.includes("Gemini");

      const errorMsg: AgentChatMessage = {
        role: "assistant",
        content: isApiKeyMissing
          ? `⚠️ **API Key Required**: No valid LLM API Key (OpenAI, Gemini, or Anthropic) was found for your account.\n\nPlease configure your personal API Key in **Credentials & BYOK** settings to enable AI features.`
          : `⚠️ Failed to get a response: ${errDetail || "Unknown error"}. Please try again.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm("Are you sure you want to clear this conversation history?")) return;
    setIsClearing(true);
    try {
      await agentApi.clearHistory(effectiveThreadId);
      setMessages([]);
    } catch (err) {
      console.error("Failed to clear history:", err);
    } finally {
      setIsClearing(false);
    }
  };

  const quickActionPrompts =
    scope === "lecture"
      ? [
          { label: "🔥 /grill me", prompt: "/grill me" },
          { label: "✏️ Update Summary", prompt: "Please update the lecture summary with my notes and core takeaways." },
          { label: "💡 Explain Concepts", prompt: "What are the core concepts and fundamental theory in this lecture?" },
          { label: "📋 Action Items", prompt: "What are the homework tasks, assignments, and action items from this lecture?" },
        ]
      : [
          { label: "🔥 /grill me on Course", prompt: "/grill me" },
          { label: "🔍 Search Topics", prompt: "Which lecture covered indexing mechanisms and B+ trees?" },
          { label: "📊 List Lectures", prompt: "List all scheduled and completed lectures in this subject." },
          { label: "📚 Exam Focus", prompt: "What are the most high-yield exam topics across this whole course?" },
        ];

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-6 bottom-6 z-40 px-4 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 text-white font-bold text-xs shadow-2xl hover:shadow-purple-500/40 flex items-center space-x-2.5 hover:scale-105 transition-all border border-purple-400/30 cursor-pointer"
        title="Open AI Chat Assistant"
      >
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
        <span>AI Study Agent</span>
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
      </button>
    );
  }

  return (
    <aside
      style={{ width: `${panelWidth}px` }}
      className="max-w-full flex flex-col h-full bg-slate-900 border-l border-slate-800 shadow-2xl relative z-30 select-text transition-all duration-75"
    >
      {/* Resizing Handle on the left edge */}
      <div
        onMouseDown={startResizing}
        className="absolute top-0 bottom-0 -left-1 w-2 cursor-ew-resize hover:bg-indigo-500/50 transition z-40"
        title="Drag to resize panel"
      />
      {/* 1. Header Bar */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-950/70 flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/20 shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <h3 className="font-bold text-xs text-white truncate">
                {scope === "lecture" ? "Lecture AI Agent" : "Course AI Agent"}
              </h3>
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              {scope === "lecture" ? lectureTitle || "Lecture Detail" : subjectName || "Course Scope"}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          {/* Token Saver / Eco Mode Toggle */}
          <button
            onClick={toggleTokenSaver}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center space-x-1 border transition-all cursor-pointer ${
              tokenSaver
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10"
                : "bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-800"
            }`}
            title={
              tokenSaver
                ? "⚡ Token Saver Active: Injects directives for ultra-compact responses, caps output tokens, and shrinks history window"
                : "Enable Token Saver mode (consumes fewer tokens by requesting ultra-concise, dense answers)"
            }
          >
            <Zap className={`w-3 h-3 ${tokenSaver ? "text-emerald-400 fill-emerald-400" : "text-slate-400"}`} />
            <span>{tokenSaver ? "Eco ON" : "Eco"}</span>
          </button>

          <button
            onClick={handleClearHistory}
            disabled={isClearing || messages.length === 0}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition disabled:opacity-30"
            title="Clear Chat History"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Close Assistant Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="py-8 px-2 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
              <Sparkles className="w-6 h-6 text-indigo-300" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-white">
                {scope === "lecture" ? "Ask Anything About This Lecture" : `Course Tutor: ${subjectName}`}
              </h4>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                {scope === "lecture"
                  ? "I have full access to your lecture slides, transcript, summaries, and notes. Ask questions, update your summary, or type /grill me to practice!"
                  : "I can search all lectures, slides, and summaries across the entire course. Ask about any topic, compare lectures, or practice exam questions."}
              </p>
            </div>
          </div>
        )}

        {/* Render Chat Messages */}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col space-y-1.5 ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            {/* Bubble Content */}
            {msg.role === "user" ? (
              <>
                <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 px-1">
                  <span>You</span>
                  {msg.timestamp && (
                    <span>
                      • {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                <div className="max-w-[88%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-xs font-sans shadow-md leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>
              </>
            ) : (
              <div className="max-w-[96%] w-full space-y-2">
                {/* Header outside on the top: Agent Title, timestamp, and Copy MD button */}
                <div className="flex items-center justify-between text-[10px] text-slate-500 px-1 w-full">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-semibold text-slate-300">
                      {scope === "lecture" ? "Lecture Agent" : "Course Agent"}
                    </span>
                    {msg.timestamp && (
                      <span>
                        • {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleCopyMessage(msg.content, idx)}
                    className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 text-[10px] font-medium transition shadow-sm"
                    title="Copy Markdown"
                  >
                    {copiedMessageIdx === idx ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 font-medium">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-slate-400" />
                        <span>Copy MD</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Actions Taken Badges if tools were executed */}
                {msg.actions_taken && msg.actions_taken.length > 0 && (
                  <div className="flex flex-wrap gap-1 pb-1">
                    {msg.actions_taken.map((act, aIdx) => (
                      <span
                        key={aIdx}
                        className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[10px] text-indigo-300 font-mono"
                      >
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                        <span>{act}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Live Summary Update Badge */}
                {msg.updated_summary && (
                  <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center space-x-2">
                    <Edit3 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Lecture summary was updated live and synced with RAG!</span>
                  </div>
                )}

                {/* Assistant Markdown Card */}
                <div className="p-3.5 rounded-2xl rounded-tl-sm bg-slate-950 border border-slate-800/90 text-xs shadow-md space-y-2">
                  <MarkdownRenderer content={msg.content} showCopyButton={false} size="compact" />
                  {msg.content.includes("API Key Required") && onOpenCredentialsModal && (
                    <button
                      onClick={onOpenCredentialsModal}
                      className="mt-2 w-full py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition flex items-center justify-center space-x-1.5 shadow-md shadow-indigo-600/20"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Open Credentials & BYOK Hub</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Loading Spinner */}
        {isLoading && (
          <div className="flex items-center space-x-2.5 text-xs text-indigo-400 p-3 rounded-xl bg-slate-950 border border-slate-800 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span className="font-medium text-[11px]">
              AI Assistant thinking & analyzing materials...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 4. Quick Actions Toolbar */}
      <div className="px-4 pt-2 flex items-center gap-1.5 overflow-x-auto text-[10px]">
        {quickActionPrompts.map((q, qIdx) => (
          <button
            key={qIdx}
            onClick={() => handleSendMessage(q.prompt)}
            disabled={isLoading}
            className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-indigo-300 text-[10px] font-medium whitespace-nowrap transition disabled:opacity-40"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* 5. Message Input Bar */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/90 space-y-1.5">
        {tokenSaver && (
          <div className="flex items-center justify-between px-1 text-[10px] text-emerald-400 font-mono">
            <span className="flex items-center space-x-1">
              <Zap className="w-2.5 h-2.5 fill-emerald-400" />
              <span>Token Saver Active — Responses are concise & token-optimized</span>
            </span>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center space-x-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            placeholder={
              tokenSaver
                ? "Ask concisely (⚡ Eco-Mode Active)..."
                : (scope === "lecture"
                    ? "Ask anything about this lecture or /grill me..."
                    : "Ask anything about this subject or /grill me...")
            }
            className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition shadow-md shadow-indigo-600/20 shrink-0"
            title="Send message (Enter)"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </aside>
  );
};
