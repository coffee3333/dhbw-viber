import React, { useState, useEffect } from "react";
import {
  ExternalLink,
  Sparkles,
  ShieldCheck,
  Calendar,
  Save,
  LogOut,
  CalendarSync,
  Upload,
  Link,
  RefreshCw,
  Trash2,
  Users,
  UserPlus,
  Eye,
  EyeOff,
} from "lucide-react";

import { useAccountViewModel } from "../../viewmodels/useAccountViewModel";
import { useAuthViewModel } from "../../viewmodels/useAuthViewModel";
import { useCalendarViewModel } from "../../viewmodels/useCalendarViewModel";
import { showToast } from "../../utils/toast";
import { authApi } from "../../api/authApi";
import type { UserProfile } from "../../types/auth";

export const AccountPage: React.FC = () => {
  const {
    settings,
    saveSettings,
    isLoading,
  } = useAccountViewModel();

  const {
    authRequired,
    currentUser,
    logout,
    adminCreateUser,
    adminDeleteUser,
  } = useAuthViewModel();

  // Admin user management state
  const [adminUserList, setAdminUserList] = useState<UserProfile[]>([]);
  const [isLoadingAdminUsers, setIsLoadingAdminUsers] = useState(false);
  const [newAccUsername, setNewAccUsername] = useState("");
  const [newAccDisplayName, setNewAccDisplayName] = useState("");
  const [newAccPassword, setNewAccPassword] = useState("");
  const [newAccRole, setNewAccRole] = useState<"member" | "admin">("member");
  const [showAccPassword, setShowAccPassword] = useState(false);
  const [isCreatingAccUser, setIsCreatingAccUser] = useState(false);

  const loadAdminUsers = async () => {
    if (currentUser?.role !== "admin") return;
    try {
      setIsLoadingAdminUsers(true);
      const users = await authApi.adminListUsers();
      setAdminUserList(Array.isArray(users) ? users : []);
    } catch {
      setAdminUserList([]);
    } finally {
      setIsLoadingAdminUsers(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === "admin") {
      loadAdminUsers();
    }
  }, [currentUser]);

  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccUsername.trim() || !newAccPassword.trim()) return;
    try {
      setIsCreatingAccUser(true);
      await adminCreateUser({
        username: newAccUsername.trim(),
        display_name: newAccDisplayName.trim() || newAccUsername.trim(),
        password: newAccPassword.trim(),
        role: newAccRole,
      });
      showToast.success("User Created", `Account @${newAccUsername.trim()} created successfully.`);
      setNewAccUsername("");
      setNewAccDisplayName("");
      setNewAccPassword("");
      await loadAdminUsers();
    } catch (err: any) {
      showToast.error("Failed to create user", err.response?.data?.detail || err.message);
    } finally {
      setIsCreatingAccUser(false);
    }
  };

  const handleAdminDeleteUser = async (userId: string, username: string) => {
    if (userId === currentUser?.id) {
      showToast.error("Forbidden", "Cannot delete your own account.");
      return;
    }
    if (!confirm(`Are you sure you want to delete user @${username}?`)) return;
    try {
      await adminDeleteUser(userId);
      showToast.success("User Deleted", `@${username} has been removed.`);
      await loadAdminUsers();
    } catch (err: any) {
      showToast.error("Failed to delete user", err.response?.data?.detail || err.message);
    }
  };

  const {
    sources,
    visibleDays,
    hideWeekends,
    viewMode,
    setVisibleDays,
    setHideWeekends,
    setViewMode,
    syncUrl,
    uploadIcs,
    deleteSource,
    refreshAllSources,
    clearAllTimetable,
    cleanupHolidays,
    fetchCalendarData,
    isLoading: isCalLoading,
  } = useCalendarViewModel();

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  // Calendar management state
  const [calTab, setCalTab] = useState<"url" | "upload" | "manage">("url");
  const [calUrlInput, setCalUrlInput] = useState("");
  const [calNameInput, setCalNameInput] = useState("");
  const [calUploadFile, setCalUploadFile] = useState<File | null>(null);

  const handleSyncUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calUrlInput.trim()) return;
    try {
      const res = await syncUrl(calUrlInput.trim(), calNameInput.trim() || undefined);
      showToast.success("Calendar Synced", res.message);
      setCalUrlInput("");
      setCalNameInput("");
    } catch {
      // Handled by global API interceptor
    }
  };

  const handleUploadIcs = async () => {
    if (!calUploadFile) return;
    try {
      const res = await uploadIcs(calUploadFile);
      showToast.success("ICS Imported", res.message);
      setCalUploadFile(null);
    } catch {
      // Handled by global API interceptor
    }
  };

  const handleDeleteSource = async (id: number) => {
    if (!confirm("Are you sure you want to remove this calendar source?")) return;
    try {
      await deleteSource(id);
      showToast.success("Source Removed", "Calendar source was successfully deleted.");
    } catch {
      // Handled by global API interceptor
    }
  };

  const handleRefreshSources = async () => {
    try {
      const res = await refreshAllSources();
      showToast.success("Calendar Refreshed", res.message);
    } catch {
      // Handled by global API interceptor
    }
  };

  const handleClearAllLectures = async () => {
    if (!confirm("Are you sure you want to clear all timetable data? (Recordings will be preserved).")) return;
    try {
      await clearAllTimetable();
      showToast.success("Timetable Reset", "All timetable lectures cleared (recordings preserved).");
    } catch {
      // Handled by global API interceptor
    }
  };

  const handleCleanHolidays = async () => {
    try {
      const res = await cleanupHolidays();
      showToast.success("Holidays Cleaned", res.message || "Holidays and non-lecture entries removed.");
    } catch {
      // Handled by global API interceptor
    }
  };

  // Local state for settings form
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [sttEngine, setSttEngine] = useState<"gemini" | "local_whisper" | "openai">("gemini");
  const [llmEngine, setLlmEngine] = useState<"gemini" | "openai">("gemini");
  const [allowedOrigins, setAllowedOrigins] = useState("*");

  useEffect(() => {
    if (settings) {
      setSttEngine(settings.transcription_engine);
      setLlmEngine(settings.summarization_engine);
      setAllowedOrigins(settings.allowed_origins);
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings({
      transcription_engine: sttEngine,
      summarization_engine: llmEngine,
      allowed_origins: allowedOrigins,
      ...(geminiKey.trim() ? { gemini_api_key: geminiKey.trim() } : {}),
      ...(openaiKey.trim() ? { openai_api_key: openaiKey.trim() } : {}),
    });
    setGeminiKey("");
    setOpenaiKey("");
  };

  return (
    <div className="flex-1 overflow-y-auto w-full">
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Account & System Settings</h2>
        <p className="text-slate-400 text-xs pt-1">
          Manage your DHBW timetable sources, Google Workspace integration, automated tasks, AI models, and security.
        </p>
      </div>

      {/* SECTION: TIMETABLE DISPLAY & VIEW CONFIGURATION */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Timetable Display & View Preferences</h3>
            <p className="text-xs text-slate-400">
              Configure how many days appear on your timetable and select your preferred default calendar view.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1">
          {/* Setting 1: Visible Days */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-200 block">
                Visible Days in Week View
              </label>
              <span className="text-[11px] text-slate-400">
                Choose the number of day columns displayed in your weekly timetable.
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { days: 5, label: "5 Days", desc: "Mon – Fri" },
                { days: 7, label: "7 Days", desc: "Full Week" },
                { days: 3, label: "3 Days", desc: "Focused" },
              ].map((opt) => {
                const isActive = visibleDays === opt.days;
                return (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => {
                      setVisibleDays(opt.days);
                      showToast.success("Timetable Updated", `Timetable set to show ${opt.days} days.`);
                    }}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                      isActive
                        ? "border-indigo-500 bg-indigo-600/20 text-white font-bold shadow-md shadow-indigo-600/20"
                        : "border-slate-800 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60 hover:text-white"
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className="text-[10px] text-slate-400 leading-tight">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Setting 2: Default View Mode */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-200 block">
                Default Calendar View
              </label>
              <span className="text-[11px] text-slate-400">
                Switch between Week timetable, single Day timeline, or full Month overview.
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { mode: "timeGridWeek", label: "Week", desc: "Weekly schedule" },
                { mode: "timeGridDay", label: "Day", desc: "Daily timeline" },
                { mode: "dayGridMonth", label: "Month", desc: "Monthly overview" },
              ].map((opt) => {
                const isActive = viewMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => {
                      setViewMode(opt.mode as any);
                      showToast.success("View Mode Set", `Calendar default switched to ${opt.label}.`);
                    }}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                      isActive
                        ? "border-indigo-500 bg-indigo-600/20 text-white font-bold shadow-md shadow-indigo-600/20"
                        : "border-slate-800 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60 hover:text-white"
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className="text-[10px] text-slate-400 leading-tight">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Setting 3: Hide Saturday & Sunday */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-200 block">
                Hide Saturday & Sunday
              </label>
              <span className="text-[11px] text-slate-400">
                Exclude weekend days from Month & Week calendar grids.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {[
                { hide: true, label: "Hide Weekends", desc: "Mon – Fri only" },
                { hide: false, label: "Show Weekends", desc: "Mon – Sun full week" },
              ].map((opt) => {
                const isActive = hideWeekends === opt.hide;
                return (
                  <button
                    key={String(opt.hide)}
                    type="button"
                    onClick={() => {
                      setHideWeekends(opt.hide);
                      showToast.success(
                        opt.hide ? "Weekends Hidden" : "Weekends Shown",
                        opt.hide
                          ? "Saturday and Sunday are now hidden from Month & Week views."
                          : "Saturday and Sunday are now visible in Month & Week views."
                      );
                    }}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                      isActive
                        ? "border-indigo-500 bg-indigo-600/20 text-white font-bold shadow-md shadow-indigo-600/20"
                        : "border-slate-800 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60 hover:text-white"
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className="text-[10px] text-slate-400 leading-tight">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {currentUser?.role === "admin" ? (
        <>
          {/* SECTION: DHBW TIMETABLE & CALENDAR SOURCES */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <CalendarSync className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">DHBW Schedule & Calendar Sources</h3>
              <p className="text-xs text-slate-400">
                Manage Rapla / Dualis iCal URLs and upload timetable .ics exports
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleCleanHolidays}
              disabled={isCalLoading}
              className="px-3 py-1.5 rounded-lg bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center space-x-1.5 transition"
              title="Automatically remove public holidays & vacation events imported from Rapla"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Clean Holidays</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 rounded-t-xl px-2">
          <button
            type="button"
            onClick={() => setCalTab("url")}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              calTab === "url"
                ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span>Sync from URL (Rapla / Dualis)</span>
          </button>

          <button
            type="button"
            onClick={() => setCalTab("upload")}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              calTab === "upload"
                ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload .ics File</span>
          </button>

          <button
            type="button"
            onClick={() => setCalTab("manage")}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              calTab === "manage"
                ? "border-indigo-500 text-indigo-400 bg-indigo-500/5"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Active Sources ({sources.length})</span>
          </button>
        </div>

        {/* Tab 1: Sync URL */}
        {calTab === "url" && (
          <div className="p-4 rounded-b-xl bg-slate-950/60 border border-t-0 border-slate-800 space-y-4">
            <div className="space-y-1.5 text-xs">
              <label className="font-semibold text-slate-300">DHBW Rapla / Dualis iCal URL</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  placeholder="https://rapla.dhbw-.../rapla?page=iCal&user=... or webcal://..."
                  value={calUrlInput}
                  onChange={(e) => setCalUrlInput(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Source Label (optional)"
                  value={calNameInput}
                  onChange={(e) => setCalNameInput(e.target.value)}
                  className="sm:w-48 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleSyncUrl}
                  disabled={isCalLoading || !calUrlInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50 transition shadow-md shadow-indigo-600/20 whitespace-nowrap"
                >
                  {isCalLoading ? "Syncing..." : "Sync Timetable"}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Export your timetable from DHBW Rapla as iCal or Webcal feed. Supports recurring schedule expansion.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Upload File */}
        {calTab === "upload" && (
          <div className="p-4 rounded-b-xl bg-slate-950/60 border border-t-0 border-slate-800 space-y-4">
            <div
              className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-xl p-6 text-center cursor-pointer transition bg-slate-900/50"
              onClick={() => document.getElementById("account-ics-file-input")?.click()}
            >
              <input
                id="account-ics-file-input"
                type="file"
                accept=".ics,text/calendar"
                className="hidden"
                onChange={(e) => e.target.files && setCalUploadFile(e.target.files[0])}
              />
              <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
              <p className="font-semibold text-slate-200 text-xs">
                {calUploadFile ? calUploadFile.name : "Select or drag .ics calendar file"}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Exported from Rapla, Dualis, or Outlook</p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleUploadIcs}
                disabled={isCalLoading || !calUploadFile}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 transition shadow-md shadow-indigo-600/20"
              >
                {isCalLoading ? "Processing file..." : "Import Timetable File"}
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Active Sources */}
        {calTab === "manage" && (
          <div className="p-4 rounded-b-xl bg-slate-950/60 border border-t-0 border-slate-800 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <button
                type="button"
                onClick={handleRefreshSources}
                disabled={isCalLoading || sources.length === 0}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
              >
                <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                <span>Refresh All Sources</span>
              </button>

              <button
                type="button"
                onClick={handleClearAllLectures}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-500/30 text-xs font-semibold transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All Lectures</span>
              </button>
            </div>

            {sources.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs italic">
                No calendar sources configured yet. Add a Rapla URL above or import an .ics file.
              </div>
            ) : (
              <div className="space-y-2">
                {sources.map((src) => (
                  <div
                    key={src.id}
                    className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="space-y-0.5 truncate max-w-lg">
                      <div className="font-semibold text-slate-200 text-xs">{src.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{src.url || src.file_path}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSource(src.id)}
                      className="p-2 rounded-lg hover:bg-red-950/50 text-slate-400 hover:text-red-400 transition"
                      title="Delete source"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* SECTION 1: AI PROVIDERS */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">AI Engines & API Keys</h3>
              <p className="text-xs text-slate-400">Configure speech-to-text and LLM summarization models</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-300">Google Gemini API Key</label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-400 hover:underline flex items-center space-x-1 text-[11px]"
                >
                  <span>Get Free Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="password"
                placeholder={settings?.has_gemini_key ? "•••••••••••••••• (Configured)" : "Enter API key"}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">OpenAI API Key (Optional)</label>
              <input
                type="password"
                placeholder={settings?.has_openai_key ? "•••••••••••••••• (Configured)" : "sk-..."}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">Transcription Engine (Speech-to-Text)</label>
              <select
                value={sttEngine}
                onChange={(e: any) => setSttEngine(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="gemini">Google Gemini 2.0 Flash (Fast & Multimodal)</option>
                <option value="local_whisper">Local Whisper (100% Offline, No API key)</option>
                <option value="openai">OpenAI Whisper API</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300">Summarization Engine (Agentic AI)</label>
              <select
                value={llmEngine}
                onChange={(e: any) => setLlmEngine(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="gemini">Google Gemini 2.0 Flash</option>
                <option value="openai">OpenAI GPT-4o</option>
              </select>
            </div>
          </div>
        </div>

        {/* SECTION: TEAM MEMBERS & USER MANAGEMENT (ADMIN ONLY) */}
        {currentUser?.role === "admin" && (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-purple-500/30 space-y-6 shadow-xl shadow-purple-950/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-sm text-white">Team & User Accounts</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-500/40 uppercase">
                      Admin Only
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Register new team members, manage login credentials, and configure roles.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={loadAdminUsers}
                disabled={isLoadingAdminUsers}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center space-x-1.5 border border-slate-700 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAdminUsers ? "animate-spin text-purple-400" : ""}`} />
                <span>Refresh Users</span>
              </button>
            </div>

            {/* Create User Form Card */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
              <h4 className="text-xs font-bold text-slate-200 flex items-center space-x-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>Register New Platform User</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 block">Username *</label>
                  <input
                    type="text"
                    required
                    value={newAccUsername}
                    onChange={(e) => setNewAccUsername(e.target.value)}
                    placeholder="e.g. atai"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 block">Display Name</label>
                  <input
                    type="text"
                    value={newAccDisplayName}
                    onChange={(e) => setNewAccDisplayName(e.target.value)}
                    placeholder="e.g. Atai"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 block">Password *</label>
                  <div className="relative">
                    <input
                      type={showAccPassword ? "text" : "password"}
                      required
                      value={newAccPassword}
                      onChange={(e) => setNewAccPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-3 pr-8 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAccPassword(!showAccPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {showAccPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 block">Role</label>
                  <select
                    value={newAccRole}
                    onChange={(e) => setNewAccRole(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="member">Member (Developer / Student)</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleAdminCreateUser}
                  disabled={isCreatingAccUser || !newAccUsername.trim() || !newAccPassword.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-emerald-600/20 transition disabled:opacity-50 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{isCreatingAccUser ? "Creating..." : "Create User Account"}</span>
                </button>
              </div>
            </div>

            {/* Existing User Cards */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span className="font-semibold">Registered Accounts ({adminUserList.length})</span>
                <span className="text-[11px]">Only administrator can add or remove accounts</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {adminUserList.map((u) => (
                  <div
                    key={u.id}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-xs uppercase flex-shrink-0">
                        {u.username.substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-white truncate">{u.display_name}</div>
                        <div className="text-[11px] font-mono text-slate-400 truncate">@{u.username}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          u.role === "admin"
                            ? "bg-purple-950/80 text-purple-300 border-purple-500/40"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        {u.role.toUpperCase()}
                      </span>

                      {u.id !== currentUser?.id && (
                        <button
                          type="button"
                          onClick={() => handleAdminDeleteUser(u.id, u.username)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
                          title="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: SECURITY & DEPLOYMENT */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Single-User Security & Vault</h3>
                <p className="text-xs text-slate-400">Master passphrase, cookie session, and token encryption</p>
              </div>
            </div>

            {authRequired && (
              <button
                type="button"
                onClick={logout}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 text-xs font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Lock Vault</span>
              </button>
            )}
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-medium">Master Passphrase Protection:</span>
              <span className="font-mono text-emerald-400 font-semibold">
                {authRequired ? "Enforced (Active)" : "Open Mode (No Password in .env)"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-medium">Database Token Encryption:</span>
              <span className="font-mono text-emerald-400 font-semibold">AES-128 Fernet (Active)</span>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <label className="font-semibold text-slate-300">Allowed CORS Origins (Production)</label>
            <input
              type="text"
              value={allowedOrigins}
              onChange={(e) => setAllowedOrigins(e.target.value)}
              placeholder="* or https://student.yourdomain.de"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition transform active:scale-95 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isLoading ? "Saving..." : "Save Settings"}</span>
          </button>
        </div>
      </form>
    </>
  ) : (
    <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
      <div className="flex items-center space-x-2.5">
        <div className="w-9 h-9 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-sm text-white">Student Member Access</h3>
          <p className="text-xs text-slate-400">
            You are logged in as a student member with timetable view access. Timetable sync URLs, AI speech/LLM engines, and cloud integrations are managed by administrators.
          </p>
        </div>
      </div>
    </div>
  )}
      </div>
    </div>
  );
};
