import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Bot,
  Send,
  X,
  Trash2,
  CheckCircle2,
  Calendar,
  Clock,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Settings,
} from "lucide-react";
import { jiraAutomationApi } from "../../api/jiraAutomationApi";
import { useAuthViewModel } from "../../viewmodels/useAuthViewModel";
import { showToast } from "../../utils/toast";
import { MarkdownRenderer } from "../../components/MarkdownRenderer";

interface JiraPlannerChatProps {
  projectId: string;
  projectName: string;
  onPlanExecuted?: () => void;
  onOpenProfile?: () => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  plan?: any | null;
  applied?: boolean;
  timestamp: string;
}

export const JiraPlannerChat: React.FC<JiraPlannerChatProps> = ({
  projectId,
  projectName,
  onPlanExecuted,
  onOpenProfile,
}) => {
  const { credentials } = useAuthViewModel();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [executingPlanId, setExecutingPlanId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const storageKey = `jira_planner_chat_${projectId}`;

  // Load chat history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setMessages(JSON.parse(saved));
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, [projectId, storageKey]);

  // Save chat history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, storageKey]);

  // Auto-scroll on new message
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text || isLoading) return;

    // Backend falls back to system default GEMINI_API_KEY if user hasn't set a personal key

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputValue("");
    setIsLoading(true);

    try {
      const history = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await jiraAutomationApi.agentChat(projectId, text, history);

      const assistantMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: "assistant",
        content: res.message || "Plan prepared.",
        plan: res.plan,
        applied: false,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: "assistant",
        content: `Error: ${err?.response?.data?.detail || err?.message || "Failed to contact planning agent."}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecutePlan = async (messageId: string, plan: any) => {
    if (!plan) return;
    try {
      setExecutingPlanId(messageId);
      const res = await jiraAutomationApi.agentExecutePlan(projectId, plan);

      showToast.success(
        "Plan Applied",
        `Created ${res.created_sprints} sprints, ${res.created_tasks} tasks, and ${res.created_moves} scheduled moves in Jira.`
      );

      // Mark this message plan as applied
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, applied: true } : m))
      );

      if (onPlanExecuted) {
        onPlanExecuted();
      }
    } catch (err: any) {
      showToast.error("Failed to Apply Plan", err.response?.data?.detail || err.message);
    } finally {
      setExecutingPlanId(null);
    }
  };

  const handleDismissPlan = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, plan: null } : m))
    );
  };

  const handleClearHistory = () => {
    if (confirm("Clear AI Planner conversation history?")) {
      setMessages([]);
      localStorage.removeItem(storageKey);
    }
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  // 1. Floating button when drawer is closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-6 bottom-6 z-40 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-2xl hover:shadow-indigo-500/30 flex items-center space-x-2 border border-indigo-400/30 cursor-pointer transition-all hover:scale-105"
        title="Open AI Sprint Planner"
      >
        <Sparkles className="w-4 h-4 text-cyan-300" />
        <span>AI Planner</span>
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
      </button>
    );
  }

  // 2. Open side drawer
  return (
    <aside className="fixed right-0 top-0 bottom-0 w-[440px] max-w-full bg-[#0f172a] border-l border-slate-800 shadow-2xl z-50 flex flex-col text-slate-100">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-white">AI Sprint Planner</h3>
            <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{projectName}</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {messages.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition cursor-pointer"
              title="Clear conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Gemini Key Notice Banner if not configured */}
      {!credentials?.has_gemini_api_key && (
        <div className="p-3 bg-amber-950/40 border-b border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-[11px]">Gemini API token required for planning.</span>
          </div>
          {onOpenProfile && (
            <button
              onClick={onOpenProfile}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[10px] flex items-center space-x-1 cursor-pointer transition"
            >
              <Settings className="w-3 h-3" />
              <span>Configure</span>
            </button>
          )}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {messages.length === 0 ? (
          <div className="py-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-950/50 border border-indigo-500/30 mx-auto flex items-center justify-center text-indigo-400">
              <Bot className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-white text-xs">Plan Sprints & Tasks with AI</h4>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                Request sprints, task breakdowns, or automated status moves between 07:00 and 00:00 with realistic timing.
              </p>
            </div>

            <div className="pt-2 space-y-2 max-w-xs mx-auto text-left">
              <button
                onClick={() =>
                  handleSendMessage(
                    "Plan Sprint 2 for next week with 3 backend tasks, and schedule their status moves realistically to Done before Friday."
                  )
                }
                className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 transition cursor-pointer text-left block"
              >
                "Plan Sprint 2 for next week with 3 backend tasks..."
              </button>
              <button
                onClick={() =>
                  handleSendMessage(
                    "Schedule realistic status moves (To Do -> In Progress -> Done) for all open tasks in the active sprint."
                  )
                }
                className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 transition cursor-pointer text-left block"
              >
                "Schedule realistic status moves for active sprint..."
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[90%] rounded-2xl p-3 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-none"
                    : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none shadow-md"
                }`}
              >
                <MarkdownRenderer content={msg.content} />
              </div>

              {/* Proposed Plan Card (Review Mode) */}
              {msg.plan && (
                <div className="w-full mt-2.5 rounded-xl border border-indigo-500/40 bg-indigo-950/20 p-3.5 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-indigo-500/20">
                    <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                      Proposed Plan (Review Mode)
                    </span>
                    {msg.applied ? (
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                        Applied to Jira
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-400 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                        Pending Approval
                      </span>
                    )}
                  </div>

                  {/* Sprints in plan */}
                  {msg.plan.sprints && msg.plan.sprints.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 block">Sprints:</span>
                      {msg.plan.sprints.map((s: any, idx: number) => {
                        const isUpdate = s.action === "update" || Boolean(s.existing_sprint_id);
                        const isDelete = s.action === "delete";
                        return (
                          <div
                            key={idx}
                            className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] flex items-center justify-between"
                          >
                            <div className="flex items-center space-x-1.5">
                              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                              <span className="font-semibold text-slate-200">{s.name}</span>
                              {isUpdate && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/40 font-bold uppercase tracking-wider">
                                  Update
                                </span>
                              )}
                              {isDelete && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-500/40 font-bold uppercase tracking-wider">
                                  Delete
                                </span>
                              )}
                              {!isUpdate && !isDelete && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-bold uppercase tracking-wider">
                                  New
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {formatDateTime(s.start_date)} - {formatDateTime(s.end_date)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tasks in plan */}
                  {msg.plan.tasks && msg.plan.tasks.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 block">
                        Tasks ({msg.plan.tasks.length}):
                      </span>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {msg.plan.tasks.map((t: any, idx: number) => {
                          const isUpdate = t.action === "update" || Boolean(t.existing_task_id);
                          const isDelete = t.action === "delete";
                          return (
                            <div
                              key={idx}
                              className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] space-y-0.5"
                            >
                              <div className="flex items-center justify-between font-medium text-slate-200">
                                <div className="flex items-center space-x-1.5">
                                  {t.jira_issue_key && (
                                    <span className="text-[10px] font-mono px-1 rounded bg-slate-800 text-cyan-300 font-semibold">
                                      {t.jira_issue_key}
                                    </span>
                                  )}
                                  <span>{t.title}</span>
                                  {isUpdate && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/40 font-bold uppercase tracking-wider">
                                      Update
                                    </span>
                                  )}
                                  {isDelete && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-500/40 font-bold uppercase tracking-wider">
                                      Delete
                                    </span>
                                  )}
                                  {!isUpdate && !isDelete && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 font-bold uppercase tracking-wider">
                                      New
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center space-x-1 shrink-0">
                                  {(t.original_estimate || t.estimate_time) && (
                                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700/50">
                                      Est: {t.original_estimate || t.estimate_time}
                                    </span>
                                  )}
                                  {(t.time_spent || t.actual_time) && (
                                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700/50">
                                      Act: {t.time_spent || t.actual_time}
                                    </span>
                                  )}
                                  {t.story_points != null && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300">
                                      {t.story_points} SP
                                    </span>
                                  )}
                                </div>
                              </div>
                              {t.description && (
                                <p className="text-[10px] text-slate-400 line-clamp-1">{t.description}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Moves in plan */}
                  {msg.plan.moves && msg.plan.moves.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 block">
                        Scheduled Status Movements ({msg.plan.moves.length}):
                      </span>
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {msg.plan.moves.map((m: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[10px] flex items-center justify-between"
                          >
                            <div className="flex items-center space-x-1.5 text-slate-300">
                              <span>{m.from_status || "To Do"}</span>
                              <ArrowRight className="w-3 h-3 text-slate-500" />
                              <span className="font-semibold text-cyan-400">{m.status}</span>
                            </div>
                            <div className="flex items-center space-x-1 text-slate-400">
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span>{formatDateTime(m.move_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  {!msg.applied ? (
                    <div className="flex items-center justify-end space-x-2 pt-1 border-t border-indigo-500/20">
                      <button
                        type="button"
                        onClick={() => handleDismissPlan(msg.id)}
                        disabled={executingPlanId === msg.id}
                        className="px-3 py-1.5 rounded-xl text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExecutePlan(msg.id, msg.plan)}
                        disabled={executingPlanId === msg.id}
                        className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50"
                      >
                        {executingPlanId === msg.id ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Applying to Jira...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve & Apply to Jira</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="pt-1 flex items-center space-x-1.5 text-[11px] text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Successfully scheduled and created in Jira.</span>
                    </div>
                  )}
                </div>
              )}

              <span className="text-[9px] text-slate-500 mt-1 px-1">
                {formatDateTime(msg.timestamp)}
              </span>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-center space-x-2 text-xs text-indigo-400 p-2.5 rounded-xl bg-slate-900 border border-slate-800 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span className="text-[11px]">AI Planner analyzing and generating schedule...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/90">
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
            placeholder="Tell AI what to plan or schedule..."
            className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 transition disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition shadow-md shadow-indigo-600/20 shrink-0 cursor-pointer"
            title="Send request"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </aside>
  );
};
