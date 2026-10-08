import React, { useState, useEffect } from "react";
import { X, CalendarSync, Upload, Link, RefreshCw, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useCalendarViewModel } from "../viewmodels/useCalendarViewModel";

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose }) => {
  const [tab, setTab] = useState<"url" | "upload" | "manage">("url");
  const [urlInput, setUrlInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { sources, syncUrl, uploadIcs, deleteSource, refreshAllSources, clearAllTimetable, fetchCalendarData, isLoading } =
    useCalendarViewModel();

  useEffect(() => {
    if (isOpen) {
      fetchCalendarData();
    }
  }, [isOpen, fetchCalendarData]);

  if (!isOpen) return null;

  const showMsg = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    try {
      const res = await syncUrl(urlInput.trim(), nameInput.trim() || undefined);
      showMsg("success", res.message);
      setUrlInput("");
      setNameInput("");
    } catch (err: any) {
      showMsg("error", err.message);
    }
  };

  const handleIcsUpload = async () => {
    if (!uploadFileObj) return;
    try {
      const res = await uploadIcs(uploadFileObj);
      showMsg("success", res.message);
      setUploadFileObj(null);
    } catch (err: any) {
      showMsg("error", err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to remove this calendar source?")) return;
    try {
      await deleteSource(id);
      showMsg("success", "Calendar source removed.");
    } catch (err: any) {
      showMsg("error", err.message);
    }
  };

  const handleRefresh = async () => {
    try {
      const res = await refreshAllSources();
      showMsg("success", res.message);
    } catch (err: any) {
      showMsg("error", err.message);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to clear all timetable data? (Recordings will be preserved).")) return;
    try {
      await clearAllTimetable();
      showMsg("success", "Timetable cleared successfully.");
    } catch (err: any) {
      showMsg("error", err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-xl rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#0f172a]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <CalendarSync className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">DHBW Schedule Manager</h3>
              <p className="text-xs text-slate-400">Sync Rapla / Dualis iCal URLs or upload .ics files</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex border-b border-slate-800 bg-[#0d1322] px-6">
          <button
            onClick={() => setTab("url")}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              tab === "url" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span>Sync from URL</span>
          </button>

          <button
            onClick={() => setTab("upload")}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              tab === "upload" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload .ics File</span>
          </button>

          <button
            onClick={() => setTab("manage")}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              tab === "manage" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Active Sources ({sources.length})</span>
          </button>
        </div>

        {/* Message notification */}
        {message && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl border flex items-center space-x-2 text-xs font-semibold ${
              message.type === "success"
                ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/30"
                : "bg-rose-950/60 text-rose-300 border-rose-500/30"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {tab === "url" && (
            <form onSubmit={handleUrlSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">DHBW Rapla / Dualis iCal URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://rapla.dhbw-.../rapla?page=iCal&user=... or webcal://..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500">
                  Export your timetable from DHBW Rapla as iCal or Webcal feed. Supports recurring schedule expansion.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300">Schedule Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. WWI22SEB Mosbach"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !urlInput.trim()}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50 transition shadow-lg shadow-indigo-600/20"
              >
                {isLoading ? "Syncing Calendar..." : "Sync Schedule Now"}
              </button>
            </form>
          )}

          {tab === "upload" && (
            <div className="space-y-4 text-xs">
              <div
                className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-2xl p-8 text-center cursor-pointer"
                onClick={() => document.getElementById("ics-file-input")?.click()}
              >
                <input
                  id="ics-file-input"
                  type="file"
                  accept=".ics,text/calendar"
                  className="hidden"
                  onChange={(e) => e.target.files && setUploadFileObj(e.target.files[0])}
                />
                <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                <p className="font-semibold text-slate-200">
                  {uploadFileObj ? uploadFileObj.name : "Select or drag .ics calendar file"}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">Exported from Rapla, Dualis, or Outlook</p>
              </div>

              <button
                onClick={handleIcsUpload}
                disabled={isLoading || !uploadFileObj}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-50 transition shadow-lg shadow-indigo-600/20"
              >
                {isLoading ? "Processing file..." : "Import Timetable File"}
              </button>
            </div>
          )}

          {tab === "manage" && (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <button
                  onClick={handleRefresh}
                  disabled={isLoading || sources.length === 0}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Refresh All</span>
                </button>

                <button
                  onClick={handleClearAll}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-500/30 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All Lectures</span>
                </button>
              </div>

              {sources.length === 0 ? (
                <div className="text-center py-8 text-slate-500 italic">No calendar sources added yet.</div>
              ) : (
                <div className="space-y-2">
                  {sources.map((src) => (
                    <div
                      key={src.id}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                    >
                      <div className="space-y-0.5 truncate max-w-sm">
                        <div className="font-semibold text-slate-200 truncate">{src.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{src.url || src.file_path}</div>
                      </div>
                      <button
                        onClick={() => handleDelete(src.id)}
                        className="p-1.5 rounded-lg hover:bg-red-950/50 text-slate-400 hover:text-red-400 transition"
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
      </div>
    </div>
  );
};
