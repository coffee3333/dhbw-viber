import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  ListTodo,
  CheckCircle2,
  Circle,
  Calendar,
  Plus,
  Trash2,
  RefreshCw,
  Cloud,
  CheckCheck,
  Search,
  Filter,
  Tag,
} from "lucide-react";
import { googleApi } from "../api/googleApi";
import { showToast } from "../utils/toast";
import type { ActionItemWithContext, CreateTaskPayload } from "../types/tasks";
import { useCalendarViewModel } from "../viewmodels/useCalendarViewModel";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useAuthViewModel } from "../viewmodels/useAuthViewModel";

interface TasksManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TasksManagerModal: React.FC<TasksManagerModalProps> = ({ isOpen, onClose }) => {
  const { subjects } = useCalendarViewModel();
  const googleStatus = useSettingsStore((s) => s.googleStatus);
  const { currentUser } = useAuthViewModel();
  const isAdmin = currentUser?.role === "admin";

  const [tasks, setTasks] = useState<ActionItemWithContext[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>("all");

  // Create Task Form State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"High" | "Medium" | "Low">("Medium");
  const [newTaskSubject, setNewTaskSubject] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTasks();
    }
  }, [isOpen]);

  const loadTasks = async () => {
    try {
      setIsLoading(true);
      const data = await googleApi.getActionItems();
      setTasks(data);
    } catch (err: any) {
      showToast.error("Failed to load tasks", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTask = async (task: ActionItemWithContext) => {
    // Optimistic UI update
    const previousCompleted = task.completed;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed: !previousCompleted } : t))
    );

    try {
      const res = await googleApi.toggleActionItem(task.id);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, completed: res.completed } : t))
      );
      if (res.completed) {
        showToast.success("Task completed!", `"${task.task.slice(0, 35)}..." marked as done.`);
      }
    } catch (err: any) {
      // Revert optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, completed: previousCompleted } : t))
      );
      showToast.error("Failed to update task", err.message);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm("Are you sure you want to delete this task?")) return;
    try {
      await googleApi.deleteActionItem(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      showToast.success("Task deleted");
    } catch (err: any) {
      showToast.error("Failed to delete task", err.message);
    }
  };

  const handleSyncAllToGoogle = async () => {
    try {
      setIsSyncing(true);
      const res = await googleApi.syncAllTasks();
      showToast.success("Google Tasks Synced", res.message);
      await loadTasks();
    } catch (err: any) {
      showToast.error("Sync failed", err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromGoogle = async () => {
    try {
      setIsPulling(true);
      const res = await googleApi.pullTasks();
      showToast.success("Tasks Status Updated", res.message);
      await loadTasks();
    } catch (err: any) {
      showToast.error("Failed to pull status", err.message);
    } finally {
      setIsPulling(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      setIsSubmitting(true);
      const payload: CreateTaskPayload = {
        task: newTaskTitle.trim(),
        priority: newTaskPriority,
        due_date: newTaskDueDate ? new Date(newTaskDueDate).toISOString() : undefined,
        deadline: newTaskDueDate || undefined,
        subject_name: newTaskSubject || undefined,
      };

      const created = await googleApi.createActionItem(payload);
      setTasks((prev) => [created, ...prev]);
      setNewTaskTitle("");
      setNewTaskDueDate("");
      setNewTaskPriority("Medium");
      setNewTaskSubject("");
      setIsCreateOpen(false);

      showToast.success(
        "Task Created",
        created.google_task_id
          ? "Task created and synced to Google Tasks & Calendar."
          : "Task created locally."
      );
    } catch (err: any) {
      showToast.error("Failed to create task", err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Status filter
      if (statusFilter === "active" && t.completed) return false;
      if (statusFilter === "completed" && !t.completed) return false;

      // Subject filter
      if (selectedSubjectFilter !== "all" && t.subject_name !== selectedSubjectFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTask = t.task.toLowerCase().includes(query);
        const matchesSubject = t.subject_name?.toLowerCase().includes(query);
        const matchesLecture = t.lecture_title?.toLowerCase().includes(query);
        if (!matchesTask && !matchesSubject && !matchesLecture) return false;
      }

      return true;
    });
  }, [tasks, statusFilter, selectedSubjectFilter, searchQuery]);

  // Summary counts
  const totalCount = tasks.length;
  const activeCount = tasks.filter((t) => !t.completed).length;
  const completedCount = tasks.filter((t) => t.completed).length;
  const syncedCount = tasks.filter((t) => Boolean(t.google_task_id)).length;

  // Format date helper
  const formatDueDate = (
    dateStr?: string | null
  ): { label: string; isOverdue: boolean; isUrgent: boolean } | null => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return { label: dateStr, isOverdue: false, isUrgent: false };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { label: "Today", isOverdue: false, isUrgent: true };
    if (diffDays === 1) return { label: "Tomorrow", isOverdue: false, isUrgent: false };
    if (diffDays === -1) return { label: "Yesterday", isOverdue: true, isUrgent: false };
    if (diffDays < 0) {
      return {
        label: `${Math.abs(diffDays)}d overdue`,
        isOverdue: true,
        isUrgent: false,
      };
    }

    return {
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      isOverdue: false,
      isUrgent: false,
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-[#0d1322] border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-600/10">
              <ListTodo className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-lg text-white">Academic Homework & Tasks</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Google Calendar Synced
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Action items extracted from lectures or created manually. Synced with RFC 3339 due dates to Google Tasks.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {isAdmin && googleStatus?.connected && (
              <>
                <button
                  type="button"
                  onClick={handleSyncAllToGoogle}
                  disabled={isSyncing}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50 cursor-pointer shadow-sm"
                  title="Push all pending tasks with due dates to Google Tasks & Calendar"
                >
                  <Cloud className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{isSyncing ? "Syncing..." : "Push to Google"}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePullFromGoogle}
                  disabled={isPulling}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50 cursor-pointer"
                  title="Pull completion checkmarks from Google Tasks app or Google Calendar"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isPulling ? "animate-spin" : ""}`} />
                  <span>{isPulling ? "Checking..." : "Pull Status"}</span>
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-4 gap-2 px-6 py-3 bg-slate-950/40 border-b border-slate-800/60 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Total:</span>
            <span className="font-bold text-white font-mono">{totalCount}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-amber-400">Pending:</span>
            <span className="font-bold text-amber-300 font-mono">{activeCount}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-emerald-400">Completed:</span>
            <span className="font-bold text-emerald-300 font-mono">{completedCount}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-indigo-400">Synced to Google:</span>
            <span className="font-bold text-indigo-300 font-mono">{syncedCount}</span>
          </div>
        </div>

        {/* Controls Bar: Search, Filters & Add Task */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks, lectures or subjects..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            {/* Subject Selector Filter */}
            <div className="flex items-center space-x-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Subjects</option>
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.name}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Status Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 rounded-lg transition font-medium cursor-pointer ${
                  statusFilter === "all"
                    ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={`px-3 py-1 rounded-lg transition font-medium cursor-pointer ${
                  statusFilter === "active"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Pending ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("completed")}
                className={`px-3 py-1 rounded-lg transition font-medium cursor-pointer ${
                  statusFilter === "completed"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Completed ({completedCount})
              </button>
            </div>

            {/* Add Task Toggle Button (Admin Only) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsCreateOpen(!isCreateOpen)}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-indigo-600/20 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isCreateOpen ? "Cancel" : "Add Task"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Collapsible New Task Form (Admin Only) */}
        {isAdmin && isCreateOpen && (
          <form
            onSubmit={handleCreateTask}
            className="p-4 bg-slate-950 border-b border-indigo-500/30 space-y-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Task / Homework</span>
              </span>
              <span className="text-[11px] text-slate-500">
                Automatically syncs with Google Calendar grid when connected
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs text-slate-400 font-medium">Task or Assignment</label>
                <input
                  type="text"
                  placeholder="e.g. Exercise Sheet 3 - Task 2 (due next Monday)"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">Due Date & Calendar Day</label>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">Priority</label>
                <select
                  value={newTaskPriority}
                  onChange={(e: any) => setNewTaskPriority(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="High">High Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="Low">Low Priority</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="w-72">
                <select
                  value={newTaskSubject}
                  onChange={(e) => setNewTaskSubject(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Associate with Subject (Optional)</option>
                  {subjects.map((sub) => (
                    <option key={sub.id} value={sub.name}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !newTaskTitle.trim()}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 transition shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                {isSubmitting ? "Creating..." : "Save & Sync Task"}
              </button>
            </div>
          </form>
        )}

        {/* Tasks List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
              <p className="text-xs">Loading tasks and assignments...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                <CheckCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-slate-300">No tasks found</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  {searchQuery || statusFilter !== "all" || selectedSubjectFilter !== "all"
                    ? "Try adjusting your search or filters."
                    : "No action items or homework recorded yet. Record a lecture or click 'Add Task' to create one."}
                </p>
              </div>
            </div>
          ) : (
            filteredTasks.map((t) => {
              const dueInfo = formatDueDate(t.due_date || t.deadline);
              return (
                <div
                  key={t.id}
                  className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 group ${
                    t.completed
                      ? "bg-slate-950/40 border-slate-800/60 opacity-70"
                      : "bg-slate-900/70 border-slate-800 hover:border-indigo-500/40 shadow-sm"
                  }`}
                >
                  {/* Left: Checkbox + Title + Meta */}
                  <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={isAdmin ? () => handleToggleTask(t) : undefined}
                      className={`${isAdmin ? "cursor-pointer text-slate-400 hover:text-indigo-400" : "cursor-default text-slate-500"} transition flex-shrink-0`}
                      title={!isAdmin ? "Task status (View only)" : t.completed ? "Mark incomplete" : "Mark completed"}
                    >
                      {t.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-xs font-medium leading-relaxed ${
                            t.completed
                              ? "line-through text-slate-500"
                              : "text-slate-100 font-semibold"
                          }`}
                        >
                          {t.task}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 text-[11px] text-slate-400 flex-wrap gap-y-1">
                        {t.subject_name && (
                          <span
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md border text-[10px] font-medium"
                            style={{
                              borderColor: `${t.subject_color || "#6366f1"}40`,
                              backgroundColor: `${t.subject_color || "#6366f1"}15`,
                              color: t.subject_color || "#818cf8",
                            }}
                          >
                            <Tag className="w-2.5 h-2.5" />
                            <span>{t.subject_name}</span>
                          </span>
                        )}

                        {t.lecture_title && (
                          <span className="truncate max-w-[220px] text-slate-400" title={t.lecture_title}>
                            {t.lecture_title}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Badges & Controls */}
                  <div className="flex items-center space-x-2.5 flex-shrink-0">
                    {/* Due Date Badge */}
                    {dueInfo && (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center space-x-1 border ${
                          dueInfo.isOverdue
                            ? "bg-rose-950/60 text-rose-300 border-rose-500/40"
                            : dueInfo.isUrgent
                            ? "bg-amber-950/60 text-amber-300 border-amber-500/40"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                        title={t.due_date ? new Date(t.due_date).toLocaleString() : undefined}
                      >
                        <Calendar className="w-3 h-3" />
                        <span>{dueInfo.label}</span>
                      </span>
                    )}

                    {/* Priority Badge */}
                    {t.priority && (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                          t.priority.toLowerCase() === "high"
                            ? "bg-rose-950/50 text-rose-300 border-rose-500/30"
                            : t.priority.toLowerCase() === "medium"
                            ? "bg-amber-950/50 text-amber-300 border-amber-500/30"
                            : "bg-slate-800/80 text-slate-400 border-slate-700"
                        }`}
                      >
                        {t.priority}
                      </span>
                    )}

                    {/* Google Tasks Status Indicator */}
                    {t.google_task_id ? (
                      <span
                        className="p-1 rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 flex items-center"
                        title="Synced to Google Tasks (Renders on Google Calendar)"
                      >
                        <Cloud className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span
                        className="p-1 rounded-md bg-slate-800 text-slate-500 border border-slate-700/60 flex items-center"
                        title="Not synced to Google Tasks yet (Click 'Push to Google')"
                      >
                        <Cloud className="w-3.5 h-3.5 opacity-40" />
                      </span>
                    )}

                    {/* Delete action (Admin Only) */}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(t.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Delete task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Google Tasks RFC 3339 format enables calendar day-grid display</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TasksManagerModal;
