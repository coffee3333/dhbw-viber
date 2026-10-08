import React, { useState, useEffect } from "react";
import { X, Calendar, Trash2 } from "lucide-react";
import type { LectureChainItem, CreateLecturePayload, UpdateLecturePayload } from "../types/calendar";

interface ClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectId: string;
  subjectName: string;
  lectureToEdit?: LectureChainItem | null;
  onSave: (payload: CreateLecturePayload | UpdateLecturePayload) => Promise<void>;
  onDelete?: (lectureId: string) => Promise<void>;
}

export const ClassModal: React.FC<ClassModalProps> = ({
  isOpen,
  onClose,
  subjectId,
  subjectName,
  lectureToEdit,
  onSave,
  onDelete,
}) => {
  const isEditing = Boolean(lectureToEdit);

  const [title, setTitle] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [startTimeStr, setStartTimeStr] = useState("09:00");
  const [endTimeStr, setEndTimeStr] = useState("10:30");
  const [room, setRoom] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (lectureToEdit) {
      setTitle(lectureToEdit.title || "");
      if (lectureToEdit.start_time) {
        const d = new Date(lectureToEdit.start_time);
        if (!isNaN(d.getTime())) {
          setDateStr(d.toISOString().split("T")[0]);
          setStartTimeStr(d.toTimeString().slice(0, 5));
        }
      }
      if (lectureToEdit.end_time) {
        const d = new Date(lectureToEdit.end_time);
        if (!isNaN(d.getTime())) {
          setEndTimeStr(d.toTimeString().slice(0, 5));
        }
      }
      setRoom(lectureToEdit.room || "");
      setMeetingLink(lectureToEdit.meeting_link || "");
      setDescription(lectureToEdit.description || "");
      setStatus(lectureToEdit.status || "scheduled");
    } else {
      setTitle("");
      const today = new Date().toISOString().split("T")[0];
      setDateStr(today);
      setStartTimeStr("09:00");
      setEndTimeStr("10:30");
      setRoom("");
      setMeetingLink("");
      setDescription("");
      setStatus("scheduled");
    }
    setConfirmDelete(false);
  }, [lectureToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dateStr) return;

    const startIso = new Date(`${dateStr}T${startTimeStr}:00`).toISOString();
    const endIso = new Date(`${dateStr}T${endTimeStr}:00`).toISOString();

    try {
      setIsSubmitting(true);
      if (isEditing) {
        await onSave({
          title: title.trim(),
          start_time: startIso,
          end_time: endIso,
          room: room.trim() || null,
          meeting_link: meetingLink.trim() || null,
          description: description.trim() || null,
          status,
        } as UpdateLecturePayload);
      } else {
        await onSave({
          subject_id: subjectId,
          title: title.trim(),
          start_time: startIso,
          end_time: endIso,
          room: room.trim() || null,
          meeting_link: meetingLink.trim() || null,
          description: description.trim() || null,
          status,
        } as CreateLecturePayload);
      }
      onClose();
    } catch {
      // Handled by caller / toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!lectureToEdit || !onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      setIsDeleting(true);
      await onDelete(lectureToEdit.id);
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
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>{isEditing ? "Edit Class Slot" : "Add New Class"}</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Module: <strong className="text-indigo-300 font-semibold">{subjectName}</strong>
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
          {/* Class Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Class Title *</span>
              <span className="text-[10px] text-slate-500 font-normal">Required</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lecture 1: Architecture Overview"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Date, Start Time & End Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Date *</label>
              <input
                type="date"
                required
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Start Time</label>
              <input
                type="time"
                value={startTimeStr}
                onChange={(e) => setStartTimeStr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">End Time</label>
              <input
                type="time"
                value={endTimeStr}
                onChange={(e) => setEndTimeStr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Room & Meeting Link */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Room / Location</label>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="e.g. Raum A-201 / Online"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="postponed">Postponed</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>
          </div>

          {/* Meeting Link */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Video / Meeting Link (Optional)</label>
            <input
              type="url"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://zoom.us/j/... or https://teams.microsoft.com/..."
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Agenda / Description (Optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Topics covered, preparations or notes..."
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
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
                    <span>Delete Class</span>
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
                disabled={isSubmitting || !title.trim()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition cursor-pointer"
              >
                <span>{isSubmitting ? "Saving..." : isEditing ? "Save Class" : "Add Class"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
