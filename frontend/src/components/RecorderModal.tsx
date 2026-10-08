import React, { useState } from "react";
import { X, Radio, UploadCloud, Disc, Square, Info } from "lucide-react";
import { useRecorderViewModel } from "../viewmodels/useRecorderViewModel";


interface RecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLectureId?: string;
}

export const RecorderModal: React.FC<RecorderModalProps> = ({
  isOpen,
  onClose,
  initialLectureId,
}) => {
  const [tab, setTab] = useState<"record" | "upload">("record");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const {
    isRecording,
    formattedTime,
    audioSource,
    selectedLectureId,
    title,
    template,
    isProcessing,
    statusMessage,
    canvasRef,
    lectures,
    setAudioSource,
    setSelectedLectureId,
    setTitle,
    setTemplate,
    startRecording,
    stopRecording,
    uploadFile,
  } = useRecorderViewModel();

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) return;
    try {
      await uploadFile(selectedFile);
      setTimeout(() => {
        onClose();
        setSelectedFile(null);
      }, 1500);
    } catch {
      // Global error interceptor shows the toast
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-2xl rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#0f172a]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 flex items-center justify-center">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Record or Upload Lecture</h3>
              <p className="text-xs text-slate-400">Capture Zoom, Moodle BBB, Teams, or upload audio/video</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-[#0d1322] px-6">
          <button
            onClick={() => setTab("record")}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              tab === "record" ? "border-red-500 text-red-400" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Live Capture (Zero-Bot)</span>
          </button>
          <button
            onClick={() => setTab("upload")}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 transition ${
              tab === "upload" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Video / Audio</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Lecture linking & Template */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Link to Timetable Lecture</label>
              <select
                value={selectedLectureId || initialLectureId || ""}
                onChange={(e) => setSelectedLectureId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="">-- Ad-hoc / Unscheduled --</option>
                {lectures.map((lec) => (
                  <option key={lec.id} value={lec.id}>
                    {lec.title} ({new Date(lec.start).toLocaleDateString([], { month: "numeric", day: "numeric" })})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Lecture Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Theoretical Computer Science"
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">AI Note Template</label>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="moodle_lecture">Academic Lecture (DHBW / Moodle)</option>
                <option value="standard">Standard Meeting</option>
                <option value="standup">Agile Standup</option>
                <option value="executive">Executive Brief</option>
              </select>
            </div>
          </div>


          {/* TAB 1: LIVE RECORDER */}
          {tab === "record" && (
            <div className="space-y-5">
              {/* Audio Source Options */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">Capture Streams:</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAudioSource("both")}
                    className={`p-2.5 rounded-xl border text-left text-xs transition ${
                      audioSource === "both"
                        ? "border-red-500 bg-red-950/20 text-white font-semibold"
                        : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div>System + Mic</div>
                    <div className="text-[10px] text-slate-400 font-normal">Lecturer + Your voice</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudioSource("system")}
                    className={`p-2.5 rounded-xl border text-left text-xs transition ${
                      audioSource === "system"
                        ? "border-red-500 bg-red-950/20 text-white font-semibold"
                        : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div>System Only</div>
                    <div className="text-[10px] text-slate-400 font-normal">Online meeting sound</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudioSource("mic")}
                    className={`p-2.5 rounded-xl border text-left text-xs transition ${
                      audioSource === "mic"
                        ? "border-red-500 bg-red-950/20 text-white font-semibold"
                        : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div>Microphone Only</div>
                    <div className="text-[10px] text-slate-400 font-normal">In-person lecture</div>
                  </button>
                </div>

                <div className="flex items-center space-x-1.5 text-[11px] text-amber-300/80 pt-1">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Check "Share System Audio" in the browser screen popup!</span>
                </div>
              </div>

              {/* Active Recording Waveform & Timer */}
              {isRecording && (
                <div className="p-4 rounded-xl bg-slate-950/80 border border-red-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-red-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                      <span>Recording Live Stream</span>
                    </span>
                    <span className="font-mono text-xl font-bold text-white tracking-widest">{formattedTime}</span>
                  </div>
                  <canvas ref={canvasRef} height="60" className="w-full rounded-lg bg-slate-900"></canvas>
                </div>
              )}

              {/* Processing message */}
              {isProcessing && (
                <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 text-xs font-semibold animate-pulse flex items-center justify-center space-x-2">
                  <Disc className="w-4 h-4 animate-spin" />
                  <span>{statusMessage}</span>
                </div>
              )}

              {/* Record Action Buttons */}
              <div className="flex justify-center pt-2">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={isProcessing}
                    className="flex items-center space-x-2 px-8 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-lg shadow-red-600/30 transition transform active:scale-95 disabled:opacity-50"
                  >
                    <Disc className="w-5 h-5" />
                    <span>Start Recording</span>
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex items-center space-x-2 px-8 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm border border-slate-700 shadow-md transition transform active:scale-95"
                  >
                    <Square className="w-5 h-5 text-red-400 fill-current" />
                    <span>Stop & Generate AI Summary</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD FILE */}
          {tab === "upload" && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleFileDrop}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer ${
                  dragActive ? "border-indigo-500 bg-indigo-950/20" : "border-slate-800 hover:border-slate-700"
                }`}
                onClick={() => document.getElementById("file-upload-input")?.click()}
              >
                <input
                  id="file-upload-input"
                  type="file"
                  accept="audio/*,video/*"
                  className="hidden"
                  onChange={(e) => e.target.files && setSelectedFile(e.target.files[0])}
                />
                <UploadCloud className="w-10 h-10 text-indigo-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-200">
                  {selectedFile ? selectedFile.name : "Drag and drop video/audio recording here, or browse"}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">MP4, WEBM, MP3, M4A, WAV up to 1GB</p>
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                  <span className="text-slate-300 truncate max-w-sm">{selectedFile.name}</span>
                  <span className="text-slate-500">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
              )}

              {isProcessing && (
                <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 text-xs font-semibold animate-pulse flex items-center justify-center space-x-2">
                  <Disc className="w-4 h-4 animate-spin" />
                  <span>{statusMessage}</span>
                </div>
              )}

              <button
                onClick={handleUploadSubmit}
                disabled={!selectedFile || isProcessing}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs disabled:opacity-50 transition shadow-lg shadow-indigo-600/20"
              >
                Upload & Transcribe with Agentic AI
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
