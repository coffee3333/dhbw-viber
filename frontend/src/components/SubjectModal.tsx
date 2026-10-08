import React, { useState, useEffect } from "react";
import { X, BookOpen, Trash2, Check } from "lucide-react";
import type { Subject, CreateSubjectPayload, UpdateSubjectPayload } from "../types/calendar";

interface SubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectToEdit?: Subject | null;
  onSave: (payload: CreateSubjectPayload | UpdateSubjectPayload) => Promise<void>;
  onDelete?: (subjectId: string) => Promise<void>;
}

const PRESET_COLORS = [
  "#4f46e5", // Indigo
  "#06b6d4", // Cyan
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ef4444", // Rose
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#3b82f6", // Blue
  "#14b8a6", // Teal
  "#84cc16", // Lime
  "#64748b", // Slate
  "#f97316", // Orange
];

export const SubjectModal: React.FC<SubjectModalProps> = ({
  isOpen,
  onClose,
  subjectToEdit,
  onSave,
  onDelete,
}) => {
  const isEditing = Boolean(subjectToEdit);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [lecturer, setLecturer] = useState("");
  const [semester, setSemester] = useState("");
  const [color, setColor] = useState("#4f46e5");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (subjectToEdit) {
      setName(subjectToEdit.name || "");
      setCode(subjectToEdit.code || "");
      setLecturer(subjectToEdit.lecturer || "");
      setSemester(subjectToEdit.semester || "");
      setColor(subjectToEdit.color || "#4f46e5");
    } else {
      setName("");
      setCode("");
      setLecturer("");
      setSemester("");
      setColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]);
    }
    setConfirmDelete(false);
  }, [subjectToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setIsSubmitting(true);
      await onSave({
        name: name.trim(),
        code: code.trim() || null,
        lecturer: lecturer.trim() || null,
        semester: semester.trim() || null,
        color,
      });
      onClose();
    } catch {
      // Handled by caller / toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!subjectToEdit || !onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      setIsDeleting(true);
      await onDelete(subjectToEdit.id);
      onClose();
    } catch {
      // Handled by caller / toast
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#0b0f19] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6 flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md transition-colors"
              style={{ backgroundColor: color }}
            >
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>{isEditing ? "Edit Subject / Module" : "Create New Subject"}</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isEditing
                  ? `Update settings for "${subjectToEdit?.name}"`
                  : "Organize lectures, notes and homework under a module"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Subject Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Subject Name *</span>
              <span className="text-[10px] text-slate-500 font-normal">Required</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Software Engineering II"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Code & Lecturer in 2 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Course Code (Optional)</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. INF-2024"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Lecturer / Prof (Optional)</label>
              <input
                type="text"
                value={lecturer}
                onChange={(e) => setLecturer(e.target.value)}
                placeholder="e.g. Prof. Dr. Schmidt"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Semester */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Semester / Term (Optional)</label>
            <input
              type="text"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              placeholder="e.g. Semester 6 / 2026"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Color Selection */}
          <div className="space-y-2 pt-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Badge & Calendar Color
            </label>
            <div className="flex flex-wrap gap-2.5 items-center">
              {PRESET_COLORS.map((c) => {
                const isSelected = color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition transform cursor-pointer hover:scale-110 ${
                      isSelected ? "ring-2 ring-white ring-offset-2 ring-offset-slate-950 scale-105" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                );
              })}
              {/* Custom Hex input */}
              <div className="flex items-center space-x-1.5 ml-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-7 h-7 rounded-lg bg-transparent cursor-pointer border border-slate-700 p-0.5"
                  title="Pick custom color"
                />
                <span className="text-[11px] font-mono text-slate-400 uppercase">{color}</span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-5 border-t border-slate-800">
            {isEditing && onDelete ? (
              <div>
                {confirmDelete ? (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={handleDelete}
                      className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer"
                    >
                      {isDeleting ? "Deleting..." : "Confirm Delete?"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="px-3.5 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 font-semibold text-xs flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Subject</span>
                  </button>
                )}
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition cursor-pointer"
              >
                <span>{isSubmitting ? "Saving..." : isEditing ? "Save Changes" : "Create Subject"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
