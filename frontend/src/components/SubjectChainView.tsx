import React, { useState } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  CalendarX,
  History,
  ArrowLeft,
  BookOpen,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import type { SubjectDetail, LectureChainItem, CreateLecturePayload, UpdateLecturePayload } from "../types/calendar";
import { AgentChatPanel } from "./AgentChatPanel";
import { useCalendarViewModel } from "../viewmodels/useCalendarViewModel";
import { ClassModal } from "./ClassModal";
import { showToast } from "../utils/toast";

interface SubjectChainViewProps {
  subject: SubjectDetail;
  onBackToOverview: () => void;
  onSelectLecture: (lectureId: string) => void;
  onOpenGrillMe?: () => void;
}

export const SubjectChainView: React.FC<SubjectChainViewProps> = ({
  subject,
  onBackToOverview,
  onSelectLecture,
}) => {
  const { createLecture, updateLecture, deleteLecture } = useCalendarViewModel();

  const [filterMode, setFilterMode] = useState<"all" | "upcoming" | "past" | "exceptions">("all");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [lectureToEdit, setLectureToEdit] = useState<LectureChainItem | null>(null);

  const handleOpenAddClass = () => {
    setLectureToEdit(null);
    setIsClassModalOpen(true);
  };

  const handleOpenEditClass = (lec: LectureChainItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setLectureToEdit(lec);
    setIsClassModalOpen(true);
  };

  const handleDeleteClassDirect = async (lec: LectureChainItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete class slot "${lec.title}"?`)) return;
    try {
      await deleteLecture(lec.id);
      showToast.success("Class Deleted", `"${lec.title}" was removed.`);
    } catch (err: any) {
      showToast.error("Failed to delete class", err.message);
    }
  };

  const handleSaveClass = async (payload: CreateLecturePayload | UpdateLecturePayload) => {
    if (lectureToEdit) {
      await updateLecture(lectureToEdit.id, payload as UpdateLecturePayload);
      showToast.success("Class Saved", `"${payload.title || lectureToEdit.title}" updated.`);
    } else {
      await createLecture(payload as CreateLecturePayload);
      showToast.success("Class Added", `"${payload.title}" added.`);
    }
  };

  const handleDeleteClassFromModal = async (lectureId: string) => {
    await deleteLecture(lectureId);
    showToast.success("Class Deleted", "Class slot removed.");
  };

  const { stats, lectures } = subject;

  const filteredLectures = lectures.filter((lec) => {
    if (filterMode === "upcoming") return lec.is_upcoming || lec.is_today;
    if (filterMode === "past") return lec.is_past && lec.status !== "canceled";
    if (filterMode === "exceptions") return lec.status === "postponed" || lec.status === "canceled";
    return true;
  });

  return (
    <div className="flex-1 flex overflow-hidden w-full h-full relative">
      <div className="flex-1 overflow-y-auto w-full min-w-0">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* 1. Breadcrumbs Navigation */}
      <nav className="flex items-center space-x-2 text-xs text-slate-400 font-medium">
        <button
          onClick={onBackToOverview}
          className="hover:text-indigo-400 transition flex items-center space-x-1"
        >
          <span>Schedule & Lectures</span>
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
        <span className="text-white font-bold flex items-center space-x-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{ backgroundColor: subject.color }}
          />
          <span>{subject.name}</span>
        </span>
      </nav>

      {/* 2. Subject Header Card */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-5 shadow-xl">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-3.5">
            <button
              onClick={onBackToOverview}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
              title="Back to Timetable Overview"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: subject.color }}
                />
                <h2 className="text-2xl font-bold tracking-tight text-white">{subject.name}</h2>
              </div>
              <div className="flex items-center space-x-3 text-xs text-slate-400">
                {subject.lecturer && <span>Prof. / Lecturer: <strong className="text-slate-200">{subject.lecturer}</strong></span>}
                {subject.code && <span>Code: <strong className="text-slate-200">{subject.code}</strong></span>}
                {subject.semester && <span>Semester: {subject.semester}</span>}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenAddClass}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Class</span>
          </button>

        </div>

        {/* Stats Counter Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 uppercase font-semibold block">Total Classes</span>
              <span className="text-xl font-extrabold text-white">{stats.total}</span>
            </div>
            <BookOpen className="w-5 h-5 text-indigo-400 opacity-60" />
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-emerald-400 uppercase font-semibold block">Completed</span>
              <span className="text-xl font-extrabold text-emerald-400">{stats.completed}</span>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-400 opacity-60" />
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-sky-400 uppercase font-semibold block">Upcoming</span>
              <span className="text-xl font-extrabold text-sky-400">{stats.upcoming}</span>
            </div>
            <Clock className="w-5 h-5 text-sky-400 opacity-60" />
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-rose-400 uppercase font-semibold block">Canceled / Postp.</span>
              <span className="text-xl font-extrabold text-rose-400">
                {stats.canceled + stats.postponed}
              </span>
            </div>
            <CalendarX className="w-5 h-5 text-rose-400 opacity-60" />
          </div>
        </div>
      </div>

      {/* 3. Filter Navigation Tabs */}
      <div className="flex border-b border-slate-800 space-x-2">
        <button
          onClick={() => setFilterMode("all")}
          className={`py-2.5 px-4 text-xs font-bold border-b-2 transition ${
            filterMode === "all"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          All Classes ({stats.total})
        </button>

        <button
          onClick={() => setFilterMode("upcoming")}
          className={`py-2.5 px-4 text-xs font-bold border-b-2 transition ${
            filterMode === "upcoming"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Upcoming ({stats.upcoming})
        </button>

        <button
          onClick={() => setFilterMode("past")}
          className={`py-2.5 px-4 text-xs font-bold border-b-2 transition ${
            filterMode === "past"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Completed / Past ({stats.completed})
        </button>

        {(stats.canceled > 0 || stats.postponed > 0) && (
          <button
            onClick={() => setFilterMode("exceptions")}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition ${
              filterMode === "exceptions"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Changes ({stats.canceled + stats.postponed})
          </button>
        )}
      </div>

      {/* 4. The Lecture Chain (Center-Connected Chain Layout) */}
      <div className="space-y-0">
        {filteredLectures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl text-center space-y-3 my-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-200">No classes scheduled yet</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                There are no class slots for "{subject.name}". Click below to add your first class slot.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddClass}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Class</span>
            </button>
          </div>
        ) : (
          filteredLectures.map((lec, idx) => {
            const startDate = new Date(lec.start_time);
            const endDate = new Date(lec.end_time);
            const formattedDate = startDate.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const formattedTime = `${startDate.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })} - ${endDate.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`;

            const now = new Date();
            const isLive = lec.is_happening_now || (now >= startDate && now <= endDate);
            const isPast = lec.is_past || (now > endDate);
            const hasAiContext = Boolean(
              lec.has_ai_context ||
              lec.has_summary ||
              (lec.materials && lec.materials.some((m) => m.type === "summary_md" || (m.filename && m.filename.endsWith(".md"))))
            );

            // Resolve clean chips (NO emojis as requested)
            const chips = lec.chips && lec.chips.length > 0 ? lec.chips : (() => {
              const c: string[] = [];
              if (lec.has_recording) c.push("Recording");
              const mats = lec.materials || [];
              if (mats.some((m) => m.type === "presentation" || /\.(pdf|pptx|ppt)$/i.test(m.filename || m.title || ""))) {
                c.push("Presentation");
              }
              if (mats.some((m) => m.type === "summary_md" || /\.md$/i.test(m.filename || m.title || ""))) {
                c.push("AI Summary (MD)");
              } else if (lec.has_summary) {
                c.push("AI Summary");
              }
              if (mats.some((m) => !m.type || (m.type !== "presentation" && m.type !== "summary_md"))) {
                c.push("Materials");
              }
              return c;
            })();

            const isFirst = idx === 0;
            const isLast = idx === filteredLectures.length - 1;

            return (
              <div
                key={lec.id}
                onClick={() => onSelectLecture(lec.id)}
                className="flex items-stretch space-x-4 cursor-pointer group"
              >
                {/* Chain Column: Center line emerging from the middle of the numbered circles */}
                <div className="flex flex-col items-center flex-shrink-0 w-10 relative">
                  {/* Top connector line segment */}
                  <div
                    className={`w-0.5 h-3.5 transition ${
                      isFirst
                        ? "opacity-0"
                        : isLive || (isPast && hasAiContext)
                        ? "bg-emerald-500/50 group-hover:bg-emerald-400/80"
                        : isPast && !hasAiContext
                        ? "bg-amber-500/50 group-hover:bg-amber-400/80"
                        : "bg-indigo-500/40 group-hover:bg-indigo-400/80"
                    }`}
                  />

                  {/* Circular Number Badge:
                      - Canceled: Red
                      - Postponed: Amber
                      - Live right now: Vibrant Pulsing Green
                      - Finished WITHOUT AI: Yellow
                      - Finished WITH AI: Full Solid Green
                      - Upcoming: Indigo
                  */}
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold z-10 border-2 transition transform group-hover:scale-110 flex-shrink-0 shadow-lg ${
                      lec.status === "canceled"
                        ? "bg-rose-950 border-rose-500 text-rose-300"
                        : lec.status === "postponed"
                        ? "bg-amber-950 border-amber-500 text-amber-300"
                        : isLive
                        ? "bg-emerald-600 border-emerald-400 text-white shadow-emerald-500/40 animate-pulse ring-2 ring-emerald-500/30"
                        : isPast
                        ? hasAiContext
                          ? "bg-emerald-600 border-emerald-400 text-white shadow-md shadow-emerald-600/30"
                          : "bg-amber-500 border-amber-300 text-slate-950 font-black shadow-md shadow-amber-500/30"
                        : "bg-indigo-950 border-indigo-500 text-indigo-200"
                    }`}
                  >
                    #{lec.sequence}
                  </div>

                  {/* Bottom connector line segment */}
                  <div
                    className={`w-0.5 flex-1 min-h-[16px] transition ${
                      isLast
                        ? "opacity-0"
                        : isLive || (isPast && hasAiContext)
                        ? "bg-emerald-500/50 group-hover:bg-emerald-400/80"
                        : isPast && !hasAiContext
                        ? "bg-amber-500/50 group-hover:bg-amber-400/80"
                        : "bg-indigo-500/40 group-hover:bg-indigo-400/80"
                    }`}
                  />
                </div>

                {/* Lecture Node Card */}
                <div className="flex-1 pb-3.5">
                  <div
                    className={`p-4 rounded-2xl border transition shadow-sm space-y-2.5 ${
                      isLive
                        ? "bg-emerald-950/20 border-emerald-500/50 group-hover:bg-emerald-950/30 group-hover:border-emerald-400/70"
                        : isPast && hasAiContext
                        ? "bg-slate-900/80 border-slate-800 hover:border-emerald-500/40 group-hover:bg-slate-900"
                        : isPast && !hasAiContext
                        ? "bg-slate-900/80 border-amber-500/30 hover:border-amber-400/60 group-hover:bg-slate-900"
                        : "bg-slate-900/70 border-slate-800 group-hover:border-indigo-500/50 group-hover:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-3 text-xs">
                        <span className="font-bold text-white flex items-center space-x-1.5">
                          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{formattedDate}</span>
                        </span>
                        <span className="text-slate-400 flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{formattedTime}</span>
                        </span>
                        {lec.room && (
                          <span className="text-slate-400 flex items-center space-x-1 hidden sm:flex">
                            <MapPin className="w-3 h-3 text-emerald-400" />
                            <span>{lec.room}</span>
                          </span>
                        )}
                      </div>

                      {/* Status Badge */}
                      <div className="flex items-center space-x-2">
                        {lec.status === "canceled" ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-500/30 flex items-center space-x-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Canceled</span>
                          </span>
                        ) : lec.status === "postponed" ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/30 flex items-center space-x-1">
                            <History className="w-3 h-3" />
                            <span>Postponed</span>
                          </span>
                        ) : isLive ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/60 flex items-center space-x-1.5 animate-pulse shadow-sm shadow-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            <span>Happening Now</span>
                          </span>
                        ) : isPast ? (
                          hasAiContext ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center space-x-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Completed</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40 flex items-center space-x-1">
                              <AlertTriangle className="w-3 h-3 text-amber-400" />
                              <span>No AI Context</span>
                            </span>
                          )
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-500/20">
                            Upcoming
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title and details */}
                    <div className="flex items-center justify-between">
                      <h3
                        className={`font-semibold text-sm transition ${
                          lec.status === "canceled"
                            ? "line-through text-slate-500"
                            : "text-slate-100 group-hover:text-indigo-300"
                        }`}
                      >
                        {lec.title}
                      </h3>
                      <div className="flex items-center space-x-1 text-slate-400 group-hover:text-indigo-400 text-xs font-semibold">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => handleOpenEditClass(lec, e)}
                          title="Edit Class Slot"
                          className="p-1 rounded-md text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => handleDeleteClassDirect(lec, e)}
                          title="Delete Class Slot"
                          className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </span>
                        <div className="flex items-center space-x-1 ml-1">
                          <span className="hidden sm:inline">Open Lesson</span>
                          <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition" />
                        </div>
                      </div>
                    </div>

                    {/* Clean Context Asset Chips (NO emojis, sleek badge style) */}
                    <div className="flex items-center space-x-2 pt-1 flex-wrap gap-y-1.5">
                      {chips.map((chip) => {
                        let chipStyle = "bg-slate-800 text-slate-300 border-slate-700";
                        if (chip === "Recording") {
                          chipStyle = "bg-rose-950/50 text-rose-300 border-rose-500/30";
                        } else if (chip === "Presentation") {
                          chipStyle = "bg-sky-950/50 text-sky-300 border-sky-500/30";
                        } else if (chip === "AI Summary (MD)" || chip === "AI Summary") {
                          chipStyle = "bg-purple-950/50 text-purple-300 border-purple-500/30";
                        } else if (chip === "Materials") {
                          chipStyle = "bg-emerald-950/50 text-emerald-300 border-emerald-500/30";
                        }
                        return (
                          <span
                            key={chip}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${chipStyle}`}
                          >
                            {chip}
                          </span>
                        );
                      })}

                      {lec.notes_preview && (
                        <span className="text-[11px] text-slate-500 truncate max-w-xs italic pl-1">
                          "{lec.notes_preview}"
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
        </div>
      </div>

      {/* Right Side: Hideable Course-Wide AI Agent Chat Bar */}
      <AgentChatPanel
        scope="subject"
        subjectId={subject.id}
        subjectName={subject.name}
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(!isChatOpen)}
      />

      {/* Class Create / Edit Modal */}
      <ClassModal
        isOpen={isClassModalOpen}
        onClose={() => setIsClassModalOpen(false)}
        subjectId={subject.id}
        subjectName={subject.name}
        lectureToEdit={lectureToEdit}
        onSave={handleSaveClass}
        onDelete={handleDeleteClassFromModal}
      />
    </div>
  );
};
