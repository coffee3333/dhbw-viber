import React, { useState, useEffect } from "react";
import {
  X,
  Calendar,
  MapPin,
  User,
  Video,
  FileText,
  ListTodo,
  Bot,
  Download,
  Radio,
  Send,
} from "lucide-react";
import { useLectureDrawerViewModel } from "../viewmodels/useLectureDrawerViewModel";
import { useAuthViewModel } from "../viewmodels/useAuthViewModel";

interface LectureDrawerProps {
  onOpenRecorderForLecture: (lectureId: string) => void;
}

export const LectureDrawer: React.FC<LectureDrawerProps> = ({ onOpenRecorderForLecture }) => {
  const { currentUser } = useAuthViewModel();
  const isAdmin = currentUser?.role === "admin";
  const {
    lecture,
    meeting,
    isOpen,
    activeTab,
    chatMessages,
    isChatLoading,
    setActiveTab,
    closeDrawer,
    sendChatMessage,
    exportMarkdown,
  } = useLectureDrawerViewModel();

  const [chatInput, setChatInput] = useState("");

  useEffect(() => {
    if (!isAdmin && activeTab === "chat") {
      setActiveTab("summary");
    }
  }, [isAdmin, activeTab, setActiveTab]);

  if (!isOpen || !lecture) return null;

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput);
    setChatInput("");
  };

  const startTime = new Date(lecture.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const endTime = new Date(lecture.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = new Date(lecture.start).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        onClick={closeDrawer}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
      ></div>

      {/* Drawer Panel */}
      <div className="relative w-full max-w-2xl bg-[#0f172a] border-l border-slate-800 shadow-2xl flex flex-col h-full z-10">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-800 space-y-3 bg-[#0d1322]">
          <div className="flex items-start justify-between">
            <span
              style={{ backgroundColor: `${lecture.backgroundColor}25`, color: lecture.backgroundColor }}
              className="text-xs font-bold px-2.5 py-1 rounded-md border border-current"
            >
              {lecture.extendedProps?.subject_name || (lecture as any).subject_name || "General Lecture"}
            </span>
            <button
              onClick={closeDrawer}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <h2 className="text-xl font-bold text-white tracking-tight">{lecture.title}</h2>

          <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 pt-1">
            <div className="flex items-center space-x-2">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {dateStr} • {startTime} - {endTime}
              </span>
            </div>

            {(lecture.extendedProps?.room || (lecture as any).room) && (
              <div className="flex items-center space-x-2">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>{lecture.extendedProps?.room || (lecture as any).room}</span>
              </div>
            )}

            {(lecture.extendedProps?.lecturer || (lecture as any).lecturer) && (
              <div className="flex items-center space-x-2">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span>{lecture.extendedProps?.lecturer || (lecture as any).lecturer}</span>
              </div>
            )}

            {(lecture.extendedProps?.meeting_link || (lecture as any).meeting_link) && (
              <a
                href={lecture.extendedProps?.meeting_link || (lecture as any).meeting_link}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-1.5 text-cyan-400 hover:text-cyan-300 font-medium"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Join Lecture Link</span>
              </a>
            )}
          </div>

          {meeting && (
            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={exportMarkdown}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition"
                title="Export Markdown Notes"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Export Notes</span>
              </button>
            </div>
          )}
        </div>

        {/* Media Player or Record CTA */}
        {meeting?.audio_path ? (
          <div className="p-4 bg-slate-950 border-b border-slate-800">
            {meeting.media_type === "video" ? (
              <video
                controls
                src={`/recordings/${meeting.audio_path}`}
                className="w-full rounded-xl max-h-56 bg-black"
              />
            ) : (
              <audio controls src={`/recordings/${meeting.audio_path}`} className="w-full" />
            )}
          </div>
        ) : (
          <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              <span>No recording attached to this lecture yet.</span>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  closeDrawer();
                  onOpenRecorderForLecture(lecture.id);
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Record Now</span>
              </button>
            )}
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex border-b border-slate-800 bg-[#0d1322] px-4">
          <button
            onClick={() => setActiveTab("summary")}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              activeTab === "summary"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>AI Study Summary</span>
          </button>

          <button
            onClick={() => setActiveTab("transcript")}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              activeTab === "transcript"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ListTodo className="w-4 h-4" />
            <span>Transcript</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab("chat")}
              className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
                activeTab === "chat"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>Ask AI Tutor</span>
            </button>
          )}
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === "summary" && (
            <div className="space-y-6 text-sm">
              {meeting?.summary_full || meeting?.summary_short ? (
                <>
                  {meeting.summary_short && (
                    <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20">
                      <h4 className="text-xs uppercase font-bold text-indigo-400 tracking-wider mb-1">
                        Executive Overview
                      </h4>
                      <p className="text-slate-200 leading-relaxed text-xs">{meeting.summary_short}</p>
                    </div>
                  )}

                  {meeting.key_points && meeting.key_points.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Key Points</h4>
                      <ul className="space-y-1.5">
                        {meeting.key_points.map((pt, i) => (
                          <li key={i} className="flex items-start space-x-2 text-xs text-slate-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0"></span>
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {meeting.action_items && meeting.action_items.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-400">
                          Assignments & Tasks
                        </h4>
                        <span className="text-[10px] bg-emerald-950/60 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                          {meeting.action_items.length} items
                        </span>
                      </div>
                      <div className="space-y-2">
                        {meeting.action_items.map((item) => (
                          <div
                            key={item.id}
                            className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1">
                              <div className="font-medium text-slate-200">{item.task}</div>
                              {item.due_date && (
                                <div className="text-[11px] text-amber-400 font-mono">Due: {item.due_date}</div>
                              )}
                            </div>
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                              {item.priority}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {meeting.summary_full && (
                    <div className="space-y-2 pt-2">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">Full Lecture Notes</h4>
                      <div className="prose prose-invert prose-xs max-w-none text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {meeting.summary_full}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs italic">
                  No summary notes available. Record this lecture or upload recording to generate AI notes.
                </div>
              )}
            </div>
          )}

          {activeTab === "transcript" && (
            <div className="space-y-3 text-xs">
              {meeting?.transcript_segments && meeting.transcript_segments.length > 0 ? (
                meeting.transcript_segments.map((seg) => (
                  <div key={seg.id} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-slate-500">
                      <span className="font-semibold text-slate-400">{seg.speaker || "Speaker"}</span>
                      <span>{Math.floor(seg.start_time)}s</span>
                    </div>
                    <p className="text-slate-200 leading-relaxed">{seg.text}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs italic">
                  No transcript segments available.
                </div>
              )}
            </div>
          )}

          {activeTab === "chat" && (
            <div className="flex flex-col h-full justify-between space-y-4">
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <Bot className="w-8 h-8 text-indigo-400 mx-auto" />
                    <div className="text-xs font-semibold text-slate-300">Ask anything about this lecture!</div>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                      Answers are strictly grounded in this lecture's transcript.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                          msg.sender === "user"
                            ? "bg-indigo-600 text-white rounded-br-none"
                            : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none shadow-sm"
                        }`}
                      >
                        {msg.text}
                      </div>
                      <span className="text-[10px] text-slate-500 pt-1 px-1">{msg.timestamp}</span>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="text-xs text-indigo-400 animate-pulse flex items-center space-x-2">
                    <Bot className="w-3.5 h-3.5" />
                    <span>AI Tutor is thinking...</span>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleChatSubmit} className="pt-2 border-t border-slate-800 flex space-x-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a question about this lecture..."
                  className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !chatInput.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 transition flex items-center space-x-1"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
