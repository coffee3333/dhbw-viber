import React, { useState, useMemo, useEffect } from "react";
import {
  ChevronRight,
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  Radio,
  FileText,
  Link as LinkIcon,
  Plus,
  Trash2,
  ExternalLink,
  BookOpen,
  ArrowLeft,
  Save,
  Volume2,
  Upload,
  RefreshCw,
  FileUp,
  Download,
  Copy,
  Check,
  CheckSquare,
  ListTodo,
} from "lucide-react";
import type { LectureDetail, SubjectDetail } from "../types/calendar";
import { calendarApi } from "../api/calendarApi";
import { showToast } from "../utils/toast";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { AgentChatPanel } from "./AgentChatPanel";
import { useAuthViewModel } from "../viewmodels/useAuthViewModel";

interface LectureSubSectionProps {
  lecture: LectureDetail;
  subject: SubjectDetail;
  onBackToChain: () => void;
  onBackToOverview: () => void;
  lectureOrigin?: "schedule" | "chain";
  onSelectLecture?: (lectureId: string) => void;
  onUpdateStatus: (status: string) => Promise<void>;
  onSaveNotes: (notes: string) => Promise<void>;
  onAddMaterial: (mat: { title: string; type?: string; url: string }) => Promise<void>;
  onUploadMaterial?: (file: File, materialType?: string) => Promise<any>;
  onGenerateSummary?: (customInstructions?: string) => Promise<any>;
  onDeleteMaterial: (matId: string) => Promise<void>;
  onOpenGrillMe: () => void;
  onOpenRecorder: () => void;
}

export const LectureSubSection: React.FC<LectureSubSectionProps> = ({
  lecture,
  subject,
  onBackToChain,
  onBackToOverview,
  lectureOrigin = "chain",
  onSelectLecture,
  onUpdateStatus,
  onSaveNotes,
  onAddMaterial,
  onUploadMaterial,
  onGenerateSummary,
  onDeleteMaterial,
  onOpenRecorder,
}) => {
  const { currentUser } = useAuthViewModel();
  const isAdmin = currentUser?.role === "admin";

  const [activeTab, setActiveTab] = useState<"summary" | "recording" | "materials">("summary");
  
  // Student Notes
  const [notesText, setNotesText] = useState(lecture.notes || "");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Add Material Modal / Form
  const [isAddMatOpen, setIsAddMatOpen] = useState(false);
  const [addMode, setAddMode] = useState<"upload" | "link">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<string>("auto");
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const [newMatTitle, setNewMatTitle] = useState("");
  const [newMatUrl, setNewMatUrl] = useState("");
  const [newMatType, setNewMatType] = useState<"link" | "pdf" | "file" | "note">("link");
  const [isAddingMat, setIsAddingMat] = useState(false);

  // Master Summary Synthesis
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryInstructions, setSummaryInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  // Live Agent Chat Panel & Instant Summary Sync
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [liveSummaryOverride, setLiveSummaryOverride] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Status updating
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Local interactive tasks state
  const [incomingTasks, setIncomingTasks] = useState(lecture.incoming_tasks || []);
  const [assignedTasks, setAssignedTasks] = useState(lecture.assigned_tasks || []);

  useEffect(() => {
    setIncomingTasks(lecture.incoming_tasks || []);
    setAssignedTasks(lecture.assigned_tasks || []);
  }, [lecture.incoming_tasks, lecture.assigned_tasks]);

  const handleToggleTask = async (taskId: number, isIncoming: boolean) => {
    if (isIncoming) {
      setIncomingTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
      );
    } else {
      setAssignedTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
      );
    }

    try {
      await calendarApi.toggleActionItem(lecture.id, taskId);
    } catch {
      if (isIncoming) {
        setIncomingTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
        );
      } else {
        setAssignedTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
        );
      }
      showToast.error("Update failed", "Could not toggle task status.");
    }
  };

  const startDate = new Date(lecture.start_time);
  const endDate = new Date(lecture.end_time);

  const formattedDate = startDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const formattedTime = `${startDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })} - ${endDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  const handleNotesSave = async () => {
    setIsSavingNotes(true);
    try {
      await onSaveNotes(notesText);
      showToast.success("Notes Saved", "Your study notes for this lecture have been updated.");
    } catch {
      // Global error interceptor will notify
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleAddMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatTitle.trim() || !newMatUrl.trim()) return;

    setIsAddingMat(true);
    try {
      await onAddMaterial({
        title: newMatTitle.trim(),
        url: newMatUrl.trim(),
        type: newMatType,
      });
      showToast.success("Material Added", `"${newMatTitle}" has been added.`);
      setNewMatTitle("");
      setNewMatUrl("");
      setIsAddMatOpen(false);
    } catch {
      // Handled by global API interceptor
    } finally {
      setIsAddingMat(false);
    }
  };

  const handleFileUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploadingFile(true);
    try {
      if (onUploadMaterial) {
        await onUploadMaterial(selectedFile, uploadCategory === "auto" ? undefined : uploadCategory);
      }
      showToast.success("File Uploaded", `"${selectedFile.name}" has been uploaded and indexed into RAG!`);
      setSelectedFile(null);
      setIsAddMatOpen(false);
    } catch (err: any) {
      showToast.error("Upload Failed", err.message || "Failed to upload file.");
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleGenerateMasterSummary = async () => {
    if (!onGenerateSummary) return;
    setIsGeneratingSummary(true);
    try {
      await onGenerateSummary(summaryInstructions.trim() || undefined);
      showToast.success("Master Summary Synthesized", "Multi-source context analyzed and indexed into RAG!");
      setShowInstructions(false);
    } catch (err: any) {
      showToast.error("Summary Failed", err.message || "Could not synthesize master summary.");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdatingStatus(true);
    try {
      await onUpdateStatus(newStatus);
      showToast.success("Status Updated", `Lecture marked as ${newStatus}.`);
    } catch {
      // Handled by global API interceptor
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const recording = lecture.recording;
  const hasRecording = Boolean(recording && (recording.full_text || recording.audio_filename || recording.video_filename));
  const mats = lecture.materials || [];
  const presentationMaterials = mats.filter(
    (m) => m.type === "presentation" || /\.(pdf|pptx|ppt)$/i.test(m.filename || m.title || "")
  );
  const summaryMdMaterials = mats.filter(
    (m) => m.type === "summary_md" || /\.md$/i.test(m.filename || m.title || "")
  );
  const otherMaterials = mats.filter(
    (m) => !presentationMaterials.includes(m) && !summaryMdMaterials.includes(m)
  );
  const hasStudentNotes = Boolean(notesText && notesText.trim().length > 10);

  // Normalize Summary Context (handles JSON string override, markdown override, or meeting recording)
  const summaryData = useMemo(() => {
    // Check live override from agent first
    if (liveSummaryOverride && liveSummaryOverride.trim().length > 10) {
      return {
        hasAny: true,
        title: recording?.title || lecture.title,
        overview: "",
        executiveSummary: "",
        keyPoints: [],
        decisions: [],
        openQuestions: [],
        actionItems: [],
        markdown: liveSummaryOverride.trim(),
      };
    }

    let parsed: any = null;
    if (typeof lecture.ai_summary_override === "string") {
      const trimmed = lecture.ai_summary_override.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          parsed = null;
        }
      }
    }

    const title = parsed?.title || recording?.title || lecture.title;
    const overview = parsed?.overview || recording?.overview || "";
    const executiveSummary = parsed?.executive_summary || recording?.executive_summary || "";
    const keyPoints: string[] = parsed?.key_points || recording?.key_points || [];
    const decisions: string[] = parsed?.decisions || recording?.decisions || [];
    const openQuestions: string[] = parsed?.open_questions || recording?.open_questions || [];
    const actionItems: any[] = parsed?.action_items || recording?.action_items || [];

    let markdown = "";
    if (parsed?.markdown_content) {
      markdown = parsed.markdown_content;
    } else if (lecture.ai_summary_override && !parsed) {
      markdown = lecture.ai_summary_override;
    } else if (recording?.markdown_content) {
      markdown = recording.markdown_content;
    } else if (overview || executiveSummary) {
      markdown = `## ⚡ Executive Overview\n\n> **Core Mandate:** ${overview || executiveSummary}\n\n`;
      if (keyPoints.length > 0) {
        markdown += `### Key Takeaways\n${keyPoints.map((k: string) => `* ${k}`).join("\n")}\n\n`;
      }
      if (decisions.length > 0) {
        markdown += `### Decisions & Exam Pointers\n${decisions.map((d: string) => `* ${d}`).join("\n")}\n\n`;
      }
      if (actionItems.length > 0) {
        markdown += `### Action Items\n${actionItems.map((a: any) => `- [ ] **${a.task || a}**`).join("\n")}\n\n`;
      }
    }

    const hasAny = Boolean(
      overview ||
      executiveSummary ||
      keyPoints.length > 0 ||
      decisions.length > 0 ||
      openQuestions.length > 0 ||
      actionItems.length > 0 ||
      (markdown && markdown.trim().length > 10)
    );

    return {
      hasAny,
      title,
      overview,
      executiveSummary,
      keyPoints,
      decisions,
      openQuestions,
      actionItems,
      markdown: markdown.trim(),
    };
  }, [liveSummaryOverride, lecture.ai_summary_override, lecture.title, recording]);

  const handleDownloadMarkdown = () => {
    if (!summaryData.markdown) return;
    const blob = new Blob([summaryData.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeTitle = (lecture.title || "lecture-notes")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toLowerCase();
    link.href = url;
    link.download = `${safeTitle}-notes.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast.success("Downloaded", "Study notes saved as markdown file.");
  };

  const handleCopyMarkdown = () => {
    if (!summaryData.markdown) return;
    navigator.clipboard.writeText(summaryData.markdown);
    setCopiedAll(true);
    showToast.success("Copied", "Full study guide copied to clipboard.");
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const canGenerateSummary = hasRecording || presentationMaterials.length > 0 || summaryMdMaterials.length > 0 || hasStudentNotes || summaryData.hasAny;
  const hasAnySummary = summaryData.hasAny;

  return (
    <div className="flex-1 flex overflow-hidden w-full h-full relative">
      <div className="flex-1 overflow-y-auto w-full min-w-0">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* 1. Pagecrumbs (Breadcrumbs Navigation) */}
      <nav className="flex items-center space-x-2 text-xs text-slate-400 font-medium">
        <button
          onClick={onBackToOverview}
          className="hover:text-indigo-400 transition flex items-center space-x-1"
        >
          <span>Schedule & Lectures</span>
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
        <button
          onClick={onBackToChain}
          className="hover:text-indigo-400 transition flex items-center space-x-1 font-semibold text-slate-200"
        >
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{ backgroundColor: subject.color }}
          />
          <span className="truncate max-w-[200px]">{subject.name}</span>
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
        <span className="text-indigo-400 font-bold truncate max-w-[280px]">
          {lecture.title}
        </span>
      </nav>

      {/* 2. Lecture Header Banner */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-1.5 flex-1 min-w-[280px]">
            <div className="flex items-center space-x-2.5">
              <button
                onClick={lectureOrigin === "schedule" ? onBackToOverview : onBackToChain}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title={lectureOrigin === "schedule" ? "Back to Schedule" : "Back to Lecture Chain"}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-xl font-bold tracking-tight text-white leading-tight">
                {lecture.title}
              </h2>
            </div>
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-400 pt-1">
              <span className="flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>{formattedDate}</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>{formattedTime}</span>
              </span>
              {lecture.room && (
                <span className="flex items-center space-x-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Room: {lecture.room}</span>
                </span>
              )}
            </div>
          </div>

          {/* Action Controls & Status Selector */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Status Dropdown */}
            <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
              <span className="text-slate-400 text-[11px] font-medium">Status:</span>
              <select
                value={lecture.status}
                disabled={isUpdatingStatus || !isAdmin}
                onChange={(e) => handleStatusChange(e.target.value)}
                className={`bg-transparent font-bold capitalize focus:outline-none ${
                  !isAdmin ? "cursor-default" : "cursor-pointer"
                } ${
                  lecture.status === "completed"
                    ? "text-emerald-400"
                    : lecture.status === "canceled"
                    ? "text-rose-400"
                    : lecture.status === "postponed"
                    ? "text-amber-400"
                    : "text-indigo-400"
                }`}
              >
                <option value="scheduled" className="bg-slate-900 text-white">Scheduled</option>
                <option value="completed" className="bg-slate-900 text-white">Completed</option>
                <option value="postponed" className="bg-slate-900 text-white">Postponed</option>
                <option value="canceled" className="bg-slate-900 text-white">Canceled</option>
              </select>
            </div>

            {/* Record / Upload Audio (Admin Only) */}
            {isAdmin && (
              <button
                onClick={onOpenRecorder}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-md shadow-red-600/20"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Record Audio</span>
              </button>
            )}
          </div>
        </div>

        {lecture.description && (
          <p className="text-xs text-slate-400 border-t border-slate-800/80 pt-3">
            {lecture.description}
          </p>
        )}
      </div>

      {/* 3. Sub-section Navigation Tabs */}
      <div className="flex border-b border-slate-800 space-x-2">
        <button
          onClick={() => setActiveTab("summary")}
          className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
            activeTab === "summary"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Lecture Summary</span>
          {recording?.executive_summary && (
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          )}
        </button>

        <button
          onClick={() => setActiveTab("recording")}
          className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
            activeTab === "recording"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Recording & Transcript</span>
          {recording && (
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          )}
        </button>

        <button
          onClick={() => setActiveTab("materials")}
          className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
            activeTab === "materials"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Additional Materials & Notes ({lecture.materials?.length || 0})</span>
        </button>
      </div>

      {/* 4. Sub-section Body */}
      {/* TAB 1: AI SUMMARY */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          {/* Master Summary Multi-Source Context Card (Admin Only) */}
          {isAdmin && (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/80 to-indigo-950/40 border border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-white text-xs">
                      Multi-Source Master Summary Engine
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 max-w-xl leading-relaxed">
                    Synthesizes audio recording transcripts, presentation slides, uploaded markdown notes, and extra materials into an authoritative, RAG-indexed study guide.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowInstructions(!showInstructions)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
                    title="Add custom focus or professor guidelines"
                  >
                    {showInstructions ? "Hide Prompt" : "Custom Instructions"}
                  </button>
                  <button
                    onClick={handleGenerateMasterSummary}
                    disabled={isGeneratingSummary || !canGenerateSummary}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs shadow-md transition flex items-center space-x-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingSummary ? "animate-spin" : ""}`} />
                    <span>{isGeneratingSummary ? "Synthesizing All Assets..." : hasAnySummary ? "Re-generate Master Summary" : "Generate Master Summary"}</span>
                  </button>
                </div>
              </div>

              {/* Custom Instructions input if toggled */}
              {showInstructions && (
                <div className="pt-2">
                  <input
                    type="text"
                    placeholder="e.g. Focus heavily on SQL joins and indexing mechanisms mentioned in Chapter 4"
                    value={summaryInstructions}
                    onChange={(e) => setSummaryInstructions(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Connected Context Assets Pill Bar */}
              <div className="flex items-center space-x-2 pt-1 flex-wrap gap-y-1.5 text-[11px]">
                <span className="text-slate-500 font-semibold uppercase text-[10px] tracking-wider pr-1">
                  Context Detected:
                </span>
                
                {/* 1. Audio Transcript */}
                <span className={`px-2 py-0.5 rounded-md border font-semibold flex items-center space-x-1 ${
                  hasRecording
                    ? "bg-rose-950/60 text-rose-300 border-rose-500/30"
                    : "bg-slate-900/60 text-slate-500 border-slate-800"
                }`}>
                  <span>Recording</span>
                  <span className="text-[10px] opacity-75">({hasRecording ? "Connected" : "None"})</span>
                </span>

                {/* 2. Presentation Slides */}
                <span className={`px-2 py-0.5 rounded-md border font-semibold flex items-center space-x-1 ${
                  presentationMaterials.length > 0
                    ? "bg-sky-950/60 text-sky-300 border-sky-500/30"
                    : "bg-slate-900/60 text-slate-500 border-slate-800"
                }`}>
                  <span>Presentation</span>
                  <span className="text-[10px] opacity-75">({presentationMaterials.length > 0 ? `${presentationMaterials.length} file(s)` : "None"})</span>
                </span>

                {/* 3. Uploaded Markdown Summary */}
                <span className={`px-2 py-0.5 rounded-md border font-semibold flex items-center space-x-1 ${
                  summaryMdMaterials.length > 0 || (lecture.ai_summary_override && lecture.ai_summary_override.length > 20)
                    ? "bg-purple-950/60 text-purple-300 border-purple-500/30"
                    : "bg-slate-900/60 text-slate-500 border-slate-800"
                }`}>
                  <span>AI Summary (MD)</span>
                  <span className="text-[10px] opacity-75">({summaryMdMaterials.length > 0 ? "Attached" : lecture.ai_summary_override ? "Ready" : "None"})</span>
                </span>

                {/* 4. Notes & Extra Materials */}
                <span className={`px-2 py-0.5 rounded-md border font-semibold flex items-center space-x-1 ${
                  hasStudentNotes
                    ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/30"
                    : otherMaterials.length > 0
                    ? "bg-slate-900/60 text-slate-300 border-slate-700"
                    : "bg-slate-900/60 text-slate-500 border-slate-800"
                }`}>
                  <span>Notes & Directives</span>
                  <span className="text-[10px] opacity-75">({hasStudentNotes ? "Steering Active" : otherMaterials.length > 0 ? `${otherMaterials.length} items` : "None"})</span>
                </span>
              </div>
            </div>
          )}

          {/* 1. Preparation Due from Previous Lecture */}
          {incomingTasks.length > 0 && (
            <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-3.5 shadow-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>Preparation Due for Today's Class</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                        {incomingTasks.filter((t) => t.completed).length}/{incomingTasks.length} Completed
                      </span>
                    </h4>
                    {lecture.previous_lecture && (
                      <p className="text-xs text-slate-400">
                        Assigned in: <span className="text-amber-300 font-medium">{lecture.previous_lecture.title}</span> ({new Date(lecture.previous_lecture.start_time).toLocaleDateString([], { month: "short", day: "numeric" })})
                      </p>
                    )}
                  </div>
                </div>

                {onSelectLecture && lecture.previous_lecture && (
                  <button
                    onClick={() => onSelectLecture(lecture.previous_lecture!.id)}
                    className="text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/30 px-3 py-1.5 rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
                  >
                    <span>View Previous Class Notes</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Task list with interactive checkboxes */}
              <div className="space-y-2 pt-1">
                {incomingTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleToggleTask(t.id, true)}
                    className={`p-3 rounded-xl border transition flex items-start space-x-3 cursor-pointer select-none ${
                      t.completed
                        ? "bg-slate-900/40 border-slate-800/80 text-slate-500"
                        : "bg-slate-900/80 border-slate-800 hover:border-amber-500/40 text-slate-200 shadow-sm"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={t.completed}
                      onChange={() => {}}
                      className="mt-0.5 w-4 h-4 rounded text-amber-500 focus:ring-amber-400 border-slate-700 bg-slate-800 cursor-pointer pointer-events-none"
                    />
                    <div className="flex-1 min-w-0 flex items-center justify-between flex-wrap gap-2">
                      <span className={`text-xs font-medium ${t.completed ? "line-through text-slate-500" : "text-slate-200"}`}>
                        {t.task}
                      </span>
                      <div className="flex items-center space-x-2 shrink-0">
                        {t.priority && (
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              t.priority.toLowerCase() === "high"
                                ? "bg-rose-950/60 text-rose-300 border border-rose-500/30"
                                : t.priority.toLowerCase() === "medium"
                                ? "bg-amber-950/60 text-amber-300 border border-amber-500/30"
                                : "bg-slate-800 text-slate-300 border border-slate-700"
                            }`}
                          >
                            {t.priority}
                          </span>
                        )}
                        {t.deadline && (
                          <span className="text-[10px] font-mono text-slate-400">
                            Due: {t.deadline}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Tasks Assigned in this lecture for next lecture */}
          {assignedTasks.length > 0 && (
            <div className="p-5 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-3.5 shadow-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                    <ListTodo className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>Tasks Assigned for Next Lecture</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                        {assignedTasks.filter((t) => t.completed).length}/{assignedTasks.length} Completed
                      </span>
                    </h4>
                    {lecture.next_lecture ? (
                      <p className="text-xs text-slate-400">
                        Due before: <span className="text-indigo-300 font-medium">{lecture.next_lecture.title}</span> ({new Date(lecture.next_lecture.start_time).toLocaleDateString([], { month: "short", day: "numeric" })})
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">Due before next scheduled session</p>
                    )}
                  </div>
                </div>

                {onSelectLecture && lecture.next_lecture && (
                  <button
                    onClick={() => onSelectLecture(lecture.next_lecture!.id)}
                    className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/30 px-3 py-1.5 rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
                  >
                    <span>Jump to Next Class</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Task list with interactive checkboxes */}
              <div className="space-y-2 pt-1">
                {assignedTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleToggleTask(t.id, false)}
                    className={`p-3 rounded-xl border transition flex items-start space-x-3 cursor-pointer select-none ${
                      t.completed
                        ? "bg-slate-900/40 border-slate-800/80 text-slate-500"
                        : "bg-slate-900/80 border-slate-800 hover:border-indigo-500/40 text-slate-200 shadow-sm"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={t.completed}
                      onChange={() => {}}
                      className="mt-0.5 w-4 h-4 rounded text-indigo-500 focus:ring-indigo-400 border-slate-700 bg-slate-800 cursor-pointer pointer-events-none"
                    />
                    <div className="flex-1 min-w-0 flex items-center justify-between flex-wrap gap-2">
                      <span className={`text-xs font-medium ${t.completed ? "line-through text-slate-500" : "text-slate-200"}`}>
                        {t.task}
                      </span>
                      <div className="flex items-center space-x-2 shrink-0">
                        {t.priority && (
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              t.priority.toLowerCase() === "high"
                                ? "bg-rose-950/60 text-rose-300 border border-rose-500/30"
                                : t.priority.toLowerCase() === "medium"
                                ? "bg-amber-950/60 text-amber-300 border border-amber-500/30"
                                : "bg-slate-800 text-slate-300 border border-slate-700"
                            }`}
                          >
                            {t.priority}
                          </span>
                        )}
                        {t.deadline && (
                          <span className="text-[10px] font-mono text-slate-400">
                            Due: {t.deadline}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main Master Summary Content Area */}
          {summaryData.hasAny ? (
            <div className="space-y-6">
              {/* Synthesized Master Study Guide (Rendered Markdown) */}
              <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 flex-wrap gap-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-white uppercase tracking-wider block">
                        Synthesized Master Study Guide
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Formatted Markdown with Code & Syntax Highlighting
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-md font-semibold flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>RAG Indexed</span>
                    </span>
                    {summaryData.markdown && (
                      <>
                        <button
                          onClick={handleCopyMarkdown}
                          className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm"
                        >
                          {copiedAll ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>Copy Notes</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={handleDownloadMarkdown}
                          className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm"
                          title="Download Markdown file"
                        >
                          <Download className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Export .md</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Beautiful Rendered Markdown */}
                <div className="pt-1">
                  <MarkdownRenderer content={summaryData.markdown} />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-10 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
              <Sparkles className="w-10 h-10 text-indigo-400 mx-auto opacity-60" />
              <div className="space-y-1">
                <h4 className="font-bold text-white text-sm">No AI Summary Created Yet</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {isAdmin
                    ? 'Upload lecture slides (.pdf, .pptx), an AI summary in .md, or record the audio lecture. Then click "Generate Master Summary" above to synthesize them all!'
                    : "A summary has not been generated for this lecture yet."}
                </p>
              </div>
              {isAdmin && (
                <div className="pt-2 flex items-center justify-center space-x-3">
                  <button
                    onClick={onOpenRecorder}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition"
                  >
                    Record Audio
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("materials");
                      setIsAddMatOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition"
                  >
                    Upload Presentation / MD
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RECORDING & TRANSCRIPT */}
      {activeTab === "recording" && (
        <div className="space-y-6">
          {recording ? (
            <div className="space-y-4">
              {/* Media Player */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                    <Volume2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-white block">Lecture Audio Playback</span>
                    <span className="text-[11px] text-slate-400">
                      Duration: {Math.round((recording.duration_seconds || 0) / 60)} minutes • Status:{" "}
                      <span className="text-emerald-400 capitalize">{recording.status}</span>
                    </span>
                  </div>
                </div>

                {recording.audio_filename && (
                  <audio
                    controls
                    src={`/api/v1/meetings/${recording.id}/audio`}
                    className="h-10 max-w-sm rounded-lg"
                  />
                )}
              </div>

              {/* Transcript Viewer */}
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                  Full Timestamped Transcript
                </span>
                {recording.transcript && recording.transcript.length > 0 ? (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2 text-xs">
                    {recording.transcript.map((seg: any) => (
                      <div key={seg.id} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-semibold text-indigo-400">{seg.speaker}</span>
                          <span>{Math.floor(seg.start)}s</span>
                        </div>
                        <p className="text-slate-300 leading-relaxed">{seg.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No timestamped segments available.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-10 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
              <Radio className="w-10 h-10 text-slate-600 mx-auto" />
              <h4 className="font-bold text-white text-sm">No Recording Attached</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {isAdmin
                  ? "Attach a lecture recording to listen back and generate automatic AI study notes."
                  : "No audio or video recording has been attached to this lecture."}
              </p>
              {isAdmin && (
                <div className="pt-2">
                  <button
                    onClick={onOpenRecorder}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md transition"
                  >
                    Record / Upload Now
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ADDITIONAL MATERIALS & STUDENT NOTES */}
      {activeTab === "materials" && (
        <div className="space-y-6">
          {/* Section A: Student Notes Editor */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-white block">Student Notes & Directives (Markdown)</span>
                <span className="text-[11px] text-indigo-300/80">
                  {isAdmin
                    ? "Acts as an authoritative system directive that actively steers Master Summary generation and RAG"
                    : "Subject lecture notes and directives (Read-only)"}
                </span>
              </div>
              {isAdmin && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleNotesSave}
                    disabled={isSavingNotes}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1.5 transition disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingNotes ? "Saving..." : "Save Notes"}</span>
                  </button>
                </div>
              )}
            </div>

            <textarea
              readOnly={!isAdmin}
              rows={7}
              placeholder={isAdmin ? "Write your notes, formulas, professor recommendations, or questions here..." : "No lecture notes recorded."}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              className={`w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-indigo-500 leading-relaxed ${
                !isAdmin ? "opacity-90 cursor-default" : ""
              }`}
            />
          </div>

          {/* Section B: Additional Materials List */}
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-white block">
                  Lecture Materials & Links ({lecture.materials?.length || 0})
                </span>
                <span className="text-[11px] text-slate-400">
                  Slides, PDFs, Moodle/Ilias links, and code repositories
                </span>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setIsAddMatOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center space-x-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Add Material</span>
                </button>
              )}
            </div>

            {/* Add Material Modal / Inline Box */}
            {isAddMatOpen && (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4 text-xs">
                {/* Mode Selector */}
                <div className="flex items-center space-x-2 border-b border-slate-800 pb-2.5">
                  <button
                    type="button"
                    onClick={() => setAddMode("upload")}
                    className={`px-3 py-1 rounded-lg font-bold transition flex items-center space-x-1.5 ${
                      addMode === "upload"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    <span>Upload File (Slides / MD / Docs)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddMode("link")}
                    className={`px-3 py-1 rounded-lg font-bold transition flex items-center space-x-1.5 ${
                      addMode === "link"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>Add Web Link</span>
                  </button>
                </div>

                {addMode === "upload" ? (
                  <form onSubmit={handleFileUploadSubmit} className="space-y-3">
                    <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-5 text-center transition cursor-pointer relative bg-slate-900/30">
                      <input
                        type="file"
                        required
                        accept=".pdf,.pptx,.ppt,.md,.txt,.docx"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            const f = e.target.files[0];
                            setSelectedFile(f);
                            if (f.name.endsWith(".md") || f.name.toLowerCase().includes("summary")) {
                              setUploadCategory("summary_md");
                            } else if (/\.(pdf|pptx|ppt)$/i.test(f.name)) {
                              setUploadCategory("presentation");
                            } else {
                              setUploadCategory("material");
                            }
                          }
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-2 opacity-80" />
                      {selectedFile ? (
                        <div className="space-y-1">
                          <span className="font-bold text-white block truncate max-w-sm mx-auto">
                            {selectedFile.name}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {(selectedFile.size / 1024).toFixed(1)} KB • Click to change file
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="font-semibold text-slate-200 block">
                            Click or drop presentation slides (.pdf, .pptx), .md AI summary, or documents
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            Contents are automatically extracted and indexed into RAG
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-400 text-xs">Asset Type:</span>
                        <select
                          value={uploadCategory}
                          onChange={(e) => setUploadCategory(e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                        >
                          <option value="auto">Auto-Detect</option>
                          <option value="presentation">Presentation Slides (PDF / PPTX)</option>
                          <option value="summary_md">AI Summary Markdown (.md)</option>
                          <option value="material">General Material / Document</option>
                        </select>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null);
                            setIsAddMatOpen(false);
                          }}
                          className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!selectedFile || isUploadingFile}
                          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition disabled:opacity-50 flex items-center space-x-1.5"
                        >
                          {isUploadingFile ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Uploading & Indexing...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5" />
                              <span>Upload & Index in RAG</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleAddMaterialSubmit} className="space-y-3">
                    <span className="font-bold text-white text-xs block">Add Web Link</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        required
                        placeholder="Title (e.g. Course Wiki or Drive Folder)"
                        value={newMatTitle}
                        onChange={(e) => setNewMatTitle(e.target.value)}
                        className="sm:col-span-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                      <select
                        value={newMatType}
                        onChange={(e: any) => setNewMatType(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="link">Web Link</option>
                        <option value="pdf">PDF Link</option>
                        <option value="file">File / Code</option>
                        <option value="note">Reference Note</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="URL or file link (https://... or Google Drive URL)"
                      value={newMatUrl}
                      onChange={(e) => setNewMatUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setIsAddMatOpen(false)}
                        className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isAddingMat}
                        className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition disabled:opacity-50"
                      >
                        {isAddingMat ? "Adding..." : "Save Resource"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Materials Grid */}
            {lecture.materials && lecture.materials.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {lecture.materials.map((mat) => {
                  const isPresentation = mat.type === "presentation" || /\.(pdf|pptx|ppt)$/i.test(mat.filename || mat.title || "");
                  const isSummaryMd = mat.type === "summary_md" || /\.md$/i.test(mat.filename || mat.title || "");
                  
                  return (
                    <div
                      key={mat.id}
                      className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between group hover:border-slate-700 transition"
                    >
                      <div className="flex items-center space-x-3 truncate">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isPresentation
                              ? "bg-sky-600/10 text-sky-400"
                              : isSummaryMd
                              ? "bg-purple-600/10 text-purple-400"
                              : "bg-indigo-600/10 text-indigo-400"
                          }`}
                        >
                          {isPresentation ? (
                            <FileText className="w-4 h-4" />
                          ) : isSummaryMd ? (
                            <BookOpen className="w-4 h-4" />
                          ) : (
                            <LinkIcon className="w-4 h-4" />
                          )}
                        </div>
                        <div className="truncate">
                          <a
                            href={mat.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-slate-200 text-xs hover:text-indigo-400 transition truncate block flex items-center space-x-1"
                          >
                            <span className="truncate">{mat.title}</span>
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                          <div className="flex items-center space-x-1.5 pt-0.5">
                            <span
                              className={`text-[9px] font-semibold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                                isPresentation
                                  ? "bg-sky-950/80 text-sky-300 border border-sky-500/30"
                                  : isSummaryMd
                                  ? "bg-purple-950/80 text-purple-300 border border-purple-500/30"
                                  : "bg-slate-900 text-slate-400 border border-slate-800"
                              }`}
                            >
                              {isPresentation ? "Presentation" : isSummaryMd ? "AI Summary (MD)" : mat.type}
                            </span>
                            {(mat.has_text || isPresentation || isSummaryMd) && (
                              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.2 rounded font-semibold">
                                RAG Indexed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => onDeleteMaterial(mat.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 transition"
                          title="Delete material"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-xs italic">
                No extra materials or links added for this lecture yet.
              </div>
            )}
          </div>
        </div>
      )}
        </div>
      </div>

      {/* Right Side: Hideable AI Lecture Agent Chat Bar (Admin Only) */}
      {isAdmin && (
        <AgentChatPanel
          scope="lecture"
          lectureId={lecture.id}
          lectureTitle={lecture.title}
          subjectId={subject.id}
          subjectName={subject.name}
          isOpen={isChatOpen}
          onToggle={() => setIsChatOpen(!isChatOpen)}
          onSummaryUpdated={(newMd) => {
            setLiveSummaryOverride(newMd);
          }}
        />
      )}
    </div>
  );
};
