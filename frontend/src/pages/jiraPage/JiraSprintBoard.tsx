import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  Plus,
  RefreshCw,
  Trash2,
  Send,
  User,
  Kanban,
  CalendarDays,
  ArrowRightLeft,
  Play,
  X,
} from "lucide-react";
import { jiraAutomationApi } from "../../api/jiraAutomationApi";
import { showToast } from "../../utils/toast";
import { JiraCalendarView } from "./JiraCalendarView";
import type {
  AutomationProject,
  AutomationSprint,
  ProjectMember,
} from "../../types/jiraAutomation";

interface JiraSprintBoardProps {
  project: AutomationProject;
  members: ProjectMember[];
  onRefreshProject: () => void;
  activeView?: "board" | "calendar";
  onViewChange?: (view: "board" | "calendar") => void;
}

export const JiraSprintBoard: React.FC<JiraSprintBoardProps> = ({
  project,
  members,
  onRefreshProject,
  activeView,
  onViewChange,
}) => {
  const [internalView, setInternalView] = useState<"board" | "calendar">(activeView || "board");

  useEffect(() => {
    if (activeView) {
      setInternalView(activeView);
    }
  }, [activeView]);

  const viewMode = activeView || internalView;
  const setViewMode = (mode: "board" | "calendar") => {
    setInternalView(mode);
    if (onViewChange) {
      onViewChange(mode);
    }
  };
  const [sprints, setSprints] = useState<AutomationSprint[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [activeSprint, setActiveSprint] = useState<AutomationSprint | null>(null);
  const [_isLoading, setIsLoading] = useState(false);
  const [isSyncingFromJira, setIsSyncingFromJira] = useState(false);

  // Modals
  const [isCreateSprintOpen, setIsCreateSprintOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);

  // Sprint Form
  const [sprintName, setSprintName] = useState("");
  const [sprintStart, setSprintStart] = useState("");
  const [sprintEnd, setSprintEnd] = useState("");

  // Edit / Reschedule Sprint Modal state
  const [isEditSprintOpen, setIsEditSprintOpen] = useState(false);
  const [editSprintId, setEditSprintId] = useState("");
  const [editSprintName, setEditSprintName] = useState("");
  const [editSprintStart, setEditSprintStart] = useState("");
  const [editSprintEnd, setEditSprintEnd] = useState("");
  const [isUpdatingSprint, setIsUpdatingSprint] = useState(false);

  // Task Form
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState("Medium");
  const [taskIssueType, setTaskIssueType] = useState("Task");
  const [taskPoints, setTaskPoints] = useState<number>(3);
  const [taskAssignee, setTaskAssignee] = useState<string>("");
  const [moveInProgressTime, setMoveInProgressTime] = useState("");
  const [moveDoneTime, setMoveDoneTime] = useState("");

  const defaultAssigneeId = useMemo(() => {
    const atai = members.find((m) => m.display_name.toLowerCase().includes("atai"));
    return atai ? atai.user_id : (members[0]?.user_id || "");
  }, [members]);

  useEffect(() => {
    loadSprints();
  }, [project.id]);

  useEffect(() => {
    if (selectedSprintId) {
      loadSprintDetails(selectedSprintId);
    }
  }, [selectedSprintId]);

  const loadSprints = async () => {
    try {
      setIsLoading(true);
      const data = await jiraAutomationApi.listSprints(project.id);
      setSprints(data);
      if (data.length > 0) {
        if (!selectedSprintId || !data.some((s) => s.id === selectedSprintId)) {
          setSelectedSprintId(data[0].id);
        } else {
          loadSprintDetails(selectedSprintId);
        }
      } else {
        setSelectedSprintId(null);
        setActiveSprint(null);
      }
    } catch (err: any) {
      showToast.error("Failed to load sprints", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncFromJira = async () => {
    try {
      setIsSyncingFromJira(true);
      const res = await jiraAutomationApi.syncSprints(project.id);
      const sprintCount = res.synced_sprints ?? res.synced ?? 0;
      const taskCount = res.synced_tasks ?? 0;
      showToast.success(
        "Synced from Jira",
        `Synced ${sprintCount} sprints and ${taskCount} tasks from Jira.`
      );
      await loadSprints();
      onRefreshProject();
    } catch (err: any) {
      showToast.error("Sync Failed", err.response?.data?.detail || err.message);
    } finally {
      setIsSyncingFromJira(false);
    }
  };

  const loadSprintDetails = async (sprintId: string) => {
    try {
      const data = await jiraAutomationApi.getSprint(sprintId);
      setActiveSprint(data);
    } catch (err: any) {
      showToast.error("Failed to load sprint details", err.message);
    }
  };

  const openCreateSprintModal = () => {
    const start = new Date();
    start.setHours(4, 37, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    end.setHours(23, 36, 0, 0);

    const pad = (n: number) => String(n).padStart(2, "0");
    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    setSprintStart(toLocalISO(start));
    setSprintEnd(toLocalISO(end));
    const nextNum = sprints.length + 1;
    const prefix = project.jira_project_key ? `${project.jira_project_key} ` : "";
    setSprintName(`${prefix}Sprint ${nextNum}`);
    setIsCreateSprintOpen(true);
  };

  const setCreateDurationWeeks = (weeks: number) => {
    if (!sprintStart) return;
    const start = new Date(sprintStart);
    const end = new Date(start);
    end.setDate(end.getDate() + weeks * 7);
    end.setHours(23, 36, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setSprintEnd(toLocalISO(end));
  };

  const openEditSprintModal = (sprint: AutomationSprint) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const toLocalISO = (isoStr: string) => {
      const d = new Date(isoStr);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setEditSprintId(sprint.id);
    setEditSprintName(sprint.name);
    setEditSprintStart(toLocalISO(sprint.start_date));
    setEditSprintEnd(toLocalISO(sprint.end_date));
    setIsEditSprintOpen(true);
  };

  const setEditDurationWeeks = (weeks: number) => {
    if (!editSprintStart) return;
    const start = new Date(editSprintStart);
    const end = new Date(start);
    end.setDate(end.getDate() + weeks * 7);
    end.setHours(18, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setEditSprintEnd(toLocalISO(end));
  };

  const handleUpdateSprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSprintId || !editSprintName.trim() || !editSprintStart || !editSprintEnd) return;
    try {
      setIsUpdatingSprint(true);
      await jiraAutomationApi.updateSprint(editSprintId, {
        name: editSprintName.trim(),
        start_date: new Date(editSprintStart).toISOString(),
        end_date: new Date(editSprintEnd).toISOString(),
      });
      showToast.success("Sprint Rescheduled", "Sprint dates and details have been updated.");
      setIsEditSprintOpen(false);
      await loadSprints();
      if (selectedSprintId === editSprintId) {
        await loadSprintDetails(editSprintId);
      }
      onRefreshProject();
    } catch (err: any) {
      showToast.error("Failed to reschedule sprint", err.response?.data?.detail || err.message);
    } finally {
      setIsUpdatingSprint(false);
    }
  };

  const handleUpdateSprintStatus = async (sprintId: string, statusPayload: { started?: boolean; closed?: boolean }) => {
    try {
      await jiraAutomationApi.updateSprint(sprintId, statusPayload);
      const actionName = statusPayload.closed ? "Completed" : statusPayload.started ? "Started" : "Updated";
      showToast.success(`Sprint ${actionName}`, `Sprint marked as ${actionName.toLowerCase()} and synced with Jira.`);
      await loadSprints();
      if (selectedSprintId) {
        await loadSprintDetails(selectedSprintId);
      }
      onRefreshProject();
    } catch (err: any) {
      showToast.error("Failed to update sprint status", err.response?.data?.detail || err.message);
    }
  };

  const handlePushSprintToJira = async (sprintId: string) => {
    try {
      const res = await jiraAutomationApi.pushSprintToJira(sprintId);
      showToast.success("Sprint Created in Jira", `Sprint '${res.name}' created on Jira board (ID #${res.jira_sprint_id}).`);
      await loadSprints();
      if (selectedSprintId) {
        await loadSprintDetails(selectedSprintId);
      }
    } catch (err: any) {
      showToast.error("Failed to push sprint to Jira", err.response?.data?.detail || err.message);
    }
  };

  const handleDeleteSprint = async (sprintId: string) => {
    if (!confirm("Are you sure you want to delete this sprint? This will cancel/delete the sprint in Jira as well as locally, and return any tasks to the backlog.")) return;
    try {
      await jiraAutomationApi.deleteSprint(sprintId);
      showToast.success("Sprint Deleted", "Sprint deleted locally and in Jira.");
      await loadSprints();
      onRefreshProject();
    } catch (err: any) {
      showToast.error("Failed to delete sprint", err.message);
    }
  };

  const [isSubmittingSprint, setIsSubmittingSprint] = useState(false);

  const handleCreateSprint = async (startNow: boolean = false) => {
    if (!sprintName.trim() || !sprintStart || !sprintEnd) return;
    try {
      setIsSubmittingSprint(true);
      const res = await jiraAutomationApi.createSprint(project.id, {
        name: sprintName.trim(),
        start_date: new Date(sprintStart).toISOString(),
        end_date: new Date(sprintEnd).toISOString(),
        start_now: startNow,
      });
      if (startNow) {
        showToast.success("Sprint Started in Jira", `Sprint '${res.name}' has been created and started in Jira!`);
      } else {
        showToast.success("Sprint Scheduled", `Sprint '${res.name}' scheduled for automated execution.`);
      }
      setIsCreateSprintOpen(false);
      setSprintName("");
      setSprintStart("");
      setSprintEnd("");
      await loadSprints();
      setSelectedSprintId(res.id);
      onRefreshProject();
    } catch (err: any) {
      showToast.error("Error creating sprint", err.response?.data?.detail || err.message);
    } finally {
      setIsSubmittingSprint(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSprintId || !taskTitle.trim()) return;

    const moves: { status: string; move_at: string }[] = [];
    if (moveInProgressTime) {
      moves.push({ status: "In Progress", move_at: new Date(moveInProgressTime).toISOString() });
    }
    if (moveDoneTime) {
      moves.push({ status: "Done", move_at: new Date(moveDoneTime).toISOString() });
    }

    try {
      await jiraAutomationApi.createTask(selectedSprintId, {
        title: taskTitle.trim(),
        description: taskDesc.trim(),
        priority: taskPriority,
        issue_type: taskIssueType,
        story_points: Number(taskPoints) || undefined,
        assignee_id: taskAssignee || undefined,
        moves,
      });

      showToast.success("Task Scheduled", "Automation task created with status transitions.");
      setIsCreateTaskOpen(false);
      setTaskTitle("");
      setTaskDesc("");
      setMoveInProgressTime("");
      setMoveDoneTime("");
      await loadSprintDetails(selectedSprintId);
    } catch (err: any) {
      showToast.error("Error creating task", err.message);
    }
  };

  const handleTriggerTaskCreate = async (taskId: string) => {
    try {
      const res = await jiraAutomationApi.triggerTaskCreate(taskId);
      showToast.success("Jira Issue Created", `Issue ${res.jira_issue_key} was pushed to Jira!`);
      if (selectedSprintId) {
        await loadSprintDetails(selectedSprintId);
      }
    } catch (err: any) {
      showToast.error("Jira Creation Failed", err.response?.data?.detail || err.message);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Are you sure you want to delete this task?")) return;
    try {
      await jiraAutomationApi.deleteTask(taskId);
      showToast.success("Task Deleted", "Task removed from sprint schedule.");
      if (selectedSprintId) {
        await loadSprintDetails(selectedSprintId);
      }
    } catch (err: any) {
      showToast.error("Failed to delete task", err.message);
    }
  };

  const handleMoveTaskToSprint = async (taskId: string, targetSprintId: string) => {
    if (!targetSprintId || targetSprintId === selectedSprintId) return;
    try {
      await jiraAutomationApi.moveTaskToSprint(taskId, targetSprintId);
      const targetSprint = sprints.find((s) => s.id === targetSprintId);
      showToast.success(
        "Task Moved",
        `Task moved to sprint '${targetSprint?.name || "Target Sprint"}'.`
      );
      await loadSprints();
      if (selectedSprintId) {
        await loadSprintDetails(selectedSprintId);
      }
    } catch (err: any) {
      showToast.error("Failed to move task", err.response?.data?.detail || err.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0b0f19]">
      {/* Top Header Toolbar with View Switcher */}
      <div className="px-6 py-2.5 border-b border-slate-800 bg-[#0d1322] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-1.5 p-1 bg-slate-900/90 rounded-xl border border-slate-800 shadow-sm">
          <button
            onClick={() => setViewMode("calendar")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition cursor-pointer ${
              viewMode === "calendar"
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5 text-cyan-400" />
            <span>Calendar & Timeline</span>
          </button>
          <button
            onClick={() => setViewMode("board")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition cursor-pointer ${
              viewMode === "board"
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Kanban className="w-3.5 h-3.5 text-indigo-400" />
            <span>Sprint Board</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleSyncFromJira}
            disabled={isSyncingFromJira}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs flex items-center space-x-1.5 border border-slate-700 shadow-sm transition cursor-pointer disabled:opacity-50 flex-shrink-0"
            title="Fetch and sync sprints and issues from Jira"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isSyncingFromJira ? "animate-spin" : ""}`} />
            <span>{isSyncingFromJira ? "Syncing..." : "Sync from Jira"}</span>
          </button>
          <button
            onClick={openCreateSprintModal}
            className="px-3 py-1.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-sm transition cursor-pointer flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Schedule Sprint</span>
          </button>
        </div>
      </div>

      {viewMode === "calendar" ? (
        <JiraCalendarView
          project={project}
          sprints={sprints}
          members={members}
          onRefresh={loadSprints}
          onSelectSprint={(sprintId) => {
            setSelectedSprintId(sprintId);
            setViewMode("board");
          }}
        />
      ) : (
        <>
          {/* Sprints Horizontal Ribbon */}
          <div className="px-6 py-2.5 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-2 overflow-x-auto">
              {sprints.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSprintId(s.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-2 transition cursor-pointer whitespace-nowrap ${
                    selectedSprintId === s.id
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                      : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <span>{s.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      s.closed
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-500/30"
                        : s.started
                        ? "bg-blue-950 text-blue-300 border border-blue-500/30 animate-pulse"
                        : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {s.closed ? "Closed" : s.started ? "Active" : "Scheduled"}
                  </span>
                </button>
              ))}
              {sprints.length === 0 && (
                <span className="text-xs text-slate-500">No sprints created yet.</span>
              )}
            </div>
          </div>

      {/* Sprint Body Content */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {activeSprint ? (
          <div className="space-y-6">
            {/* Sprint Summary Card */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h2 className="text-base font-bold text-white">{activeSprint.name}</h2>
                  {activeSprint.jira_sprint_id && (
                    <span className="text-[11px] text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                      Jira Sprint ID: #{activeSprint.jira_sprint_id}
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-4 text-xs text-slate-400">
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>
                      {new Date(activeSprint.start_date).toLocaleDateString()} –{" "}
                      {new Date(activeSprint.end_date).toLocaleDateString()}
                    </span>
                  </span>
                  <span>•</span>
                  <span>
                    Tasks: <strong>{activeSprint.tasks_count}</strong> ({activeSprint.completed_tasks_count} completed)
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {/* Start Sprint if scheduled */}
                {!activeSprint.started && !activeSprint.closed && (
                  <button
                    onClick={() => handleUpdateSprintStatus(activeSprint.id, { started: true })}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
                    title="Activate sprint and start tracking"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start Sprint</span>
                  </button>
                )}

                {/* Complete Sprint if active */}
                {activeSprint.started && !activeSprint.closed && (
                  <button
                    onClick={() => handleUpdateSprintStatus(activeSprint.id, { closed: true, started: false })}
                    className="px-3 py-1.5 rounded-xl bg-purple-600/80 hover:bg-purple-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
                    title="Complete and close sprint"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Complete Sprint</span>
                  </button>
                )}

                {/* Reschedule Sprint Button */}
                <button
                  onClick={() => openEditSprintModal(activeSprint)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer"
                  title="Reschedule sprint dates or edit name"
                >
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Reschedule</span>
                </button>

                {/* Push to Jira button if not synced */}
                {!activeSprint.jira_sprint_id && project.jira_board_id && (
                  <button
                    onClick={() => handlePushSprintToJira(activeSprint.id)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600/60 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer"
                    title="Push and create this sprint on Jira board"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Push to Jira</span>
                  </button>
                )}

                <button
                  onClick={() => handleDeleteSprint(activeSprint.id)}
                  className="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 border border-slate-800 transition cursor-pointer"
                  title="Delete sprint"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => {
                    if (!taskAssignee && defaultAssigneeId) {
                      setTaskAssignee(defaultAssigneeId);
                    }
                    setIsCreateTaskOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Scheduled Task</span>
                </button>
              </div>
            </div>

            {/* Task List / Board */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Sprint Tasks ({activeSprint.tasks?.length || 0})
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeSprint.tasks?.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-indigo-500/40 transition flex flex-col justify-between space-y-3 shadow-lg"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          {t.jira_issue_key ? (
                            <a
                              href={project.jira_domain ? `https://${project.jira_domain}/browse/${t.jira_issue_key}` : undefined}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-500/30 px-2 py-0.5 rounded-lg flex items-center space-x-1 hover:border-indigo-400 hover:text-indigo-300 transition"
                              title="Open issue in Jira Cloud"
                            >
                              <span>{t.jira_issue_key}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-[11px] text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded-lg flex items-center space-x-1">
                              <Clock className="w-3 h-3" />
                              <span>Scheduled</span>
                            </span>
                          )}
                          <div className="flex items-center space-x-1.5">
                            {t.story_points ? (
                              <span className="text-[10px] text-slate-400 font-mono">
                                {t.story_points} pts
                              </span>
                            ) : null}
                            {(t.original_estimate || t.time_spent) && (
                              <span className="text-[10px] font-mono text-cyan-300 bg-slate-900/90 border border-slate-700/60 px-1.5 py-0.5 rounded flex items-center space-x-1" title={`Estimated: ${t.original_estimate || "none"} | Actual Spent: ${t.time_spent || "none"}`}>
                                <Clock className="w-2.5 h-2.5 text-cyan-400" />
                                <span>{t.time_spent ? `${t.time_spent} / ` : ""}{t.original_estimate || "—"}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            t.current_status.toLowerCase() === "done"
                              ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40"
                              : t.current_status.toLowerCase() === "in progress"
                              ? "bg-blue-950/60 text-blue-300 border-blue-500/40"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                          }`}
                        >
                          {t.current_status}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-100 line-clamp-2">{t.title}</h4>

                      {t.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-2">{t.description}</p>
                      )}
                    </div>

                    {/* Metadata & Moves */}
                    <div className="space-y-2 pt-2 border-t border-slate-800/60">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center space-x-1">
                          <User className="w-3 h-3 text-slate-500" />
                          <span>{t.assignee_name || "Unassigned"}</span>
                        </span>
                      </div>

                      {/* Transition steps */}
                      {t.moves && t.moves.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[10px] font-semibold text-slate-500 uppercase">Transitions</div>
                          <div className="space-y-1">
                            {t.moves.map((m) => (
                              <div
                                key={m.id}
                                className="flex items-center justify-between text-[11px] px-2 py-1 rounded-md bg-slate-950/50 border border-slate-800/60"
                              >
                                <span className="font-medium text-slate-300">➔ {m.status}</span>
                                <span className="text-[10px] text-slate-500">
                                  {m.done ? "✓ Done" : new Date(m.move_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Move to another Sprint */}
                      <div className="flex items-center space-x-1.5 bg-slate-950/60 px-2.5 py-1.5 rounded-xl border border-slate-800/80">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-slate-400 flex-shrink-0">Sprint:</span>
                        <select
                          value={t.sprint_id || selectedSprintId || ""}
                          onChange={(e) => handleMoveTaskToSprint(t.id, e.target.value)}
                          className="bg-transparent text-[11px] font-medium text-slate-200 focus:outline-none cursor-pointer hover:text-white transition w-full truncate"
                          title="Move task to another sprint (automatically syncs with Jira)"
                        >
                          {sprints.map((s) => (
                            <option key={s.id} value={s.id} className="bg-slate-900 text-slate-100">
                              {s.name} {s.id === (t.sprint_id || selectedSprintId) ? "(Current)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1">
                        {!t.jira_issue_key ? (
                          <button
                            onClick={() => handleTriggerTaskCreate(t.id)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white text-[11px] font-medium flex items-center space-x-1 transition cursor-pointer"
                            title="Create immediately in Jira"
                          >
                            <Send className="w-3 h-3" />
                            <span>Create in Jira</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-emerald-400 flex items-center space-x-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>In Jira</span>
                          </span>
                        )}

                        <button
                          onClick={() => handleDeleteTask(t.id)}
                          className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {(!activeSprint.tasks || activeSprint.tasks.length === 0) && (
                  <div className="col-span-full p-8 text-center rounded-2xl border border-dashed border-slate-800 text-slate-500 text-xs">
                    No tasks scheduled for this sprint yet. Click "Add Scheduled Task" to queue automatic creations and status transitions!
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-950/50 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-xl">
              <Calendar className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-sm font-bold text-white">
                {sprints.length === 0 ? "No Sprints Found" : "No Sprint Selected"}
              </h3>
              <p className="text-xs text-slate-400">
                {sprints.length === 0
                  ? "Sync your existing sprints and tasks from Jira Cloud, or create a new scheduled sprint."
                  : "Select a sprint from the tabs above to view tasks and schedule transitions."}
              </p>
            </div>
            {sprints.length === 0 && (
              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={handleSyncFromJira}
                  disabled={isSyncingFromJira}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingFromJira ? "animate-spin" : ""}`} />
                  <span>{isSyncingFromJira ? "Syncing from Jira..." : "Sync from Jira"}</span>
                </button>
                <button
                  onClick={() => setIsCreateSprintOpen(true)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold flex items-center space-x-2 border border-slate-700 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Sprint</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
        </>
      )}

      {/* Create / Schedule Sprint Modal */}
      {isCreateSprintOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0f172a] border border-slate-700 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Schedule Automation Sprint</h3>
                  <p className="text-[11px] text-slate-400">Define sprint timelines and sync with Jira</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateSprintOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Sprint Name</label>
              <input
                type="text"
                required
                value={sprintName}
                onChange={(e) => setSprintName(e.target.value)}
                placeholder="e.g. Sprint 2 - Core Features"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">Quick Duration</label>
                <span className="text-[10px] text-slate-500">Auto-sets End Date</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: "1 Week", weeks: 1 },
                  { label: "2 Weeks", weeks: 2 },
                  { label: "3 Weeks", weeks: 3 },
                  { label: "4 Weeks", weeks: 4 },
                ].map((preset) => (
                  <button
                    key={preset.weeks}
                    type="button"
                    onClick={() => setCreateDurationWeeks(preset.weeks)}
                    className="py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/40 text-xs text-slate-300 font-medium transition cursor-pointer text-center"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Start Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={sprintStart}
                  onChange={(e) => setSprintStart(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">End Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={sprintEnd}
                  onChange={(e) => setSprintEnd(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {project.jira_board_id && (
              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-[11px] text-cyan-300 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />
                <span>
                  Will automatically schedule and create this sprint on your Jira Cloud Board #{project.jira_board_id}.
                </span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300 space-y-1">
              <div className="font-semibold text-slate-200 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Automated Lifecycle:</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Sprint is saved locally immediately. The background scheduler checks every minute and will start/close the sprint, create scheduled tasks, carry over incomplete backlog tasks, and execute status moves exactly at the times you set.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 gap-2">
              <button
                type="button"
                disabled={isSubmittingSprint || !sprintName.trim() || !sprintStart || !sprintEnd}
                onClick={() => handleCreateSprint(true)}
                className="px-3.5 py-2 rounded-xl border border-indigo-500/60 hover:bg-indigo-600/20 text-indigo-300 font-semibold text-xs flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Save & Start in Jira now</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateSprintOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingSprint || !sprintName.trim() || !sprintStart || !sprintEnd}
                  onClick={() => handleCreateSprint(false)}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-md shadow-cyan-600/30 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>{isSubmittingSprint ? "Scheduling..." : "Save Schedule"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Reschedule Sprint Modal */}
      {isEditSprintOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateSprint}
            className="w-full max-w-md bg-[#0f172a] border border-slate-700 rounded-3xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Reschedule Sprint</h3>
                  <p className="text-[11px] text-slate-400">Update sprint dates and schedule</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditSprintOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Sprint Name</label>
              <input
                type="text"
                required
                value={editSprintName}
                onChange={(e) => setEditSprintName(e.target.value)}
                placeholder="Sprint Name"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">Quick Duration</label>
                <span className="text-[10px] text-slate-500">Auto-sets End Date</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: "1 Week", weeks: 1 },
                  { label: "2 Weeks", weeks: 2 },
                  { label: "3 Weeks", weeks: 3 },
                  { label: "4 Weeks", weeks: 4 },
                ].map((preset) => (
                  <button
                    key={preset.weeks}
                    type="button"
                    onClick={() => setEditDurationWeeks(preset.weeks)}
                    className="py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-indigo-500/40 text-xs text-slate-300 font-medium transition cursor-pointer text-center"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Start Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={editSprintStart}
                  onChange={(e) => setEditSprintStart(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">End Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={editSprintEnd}
                  onChange={(e) => setEditSprintEnd(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Updating these dates will automatically reschedule the sprint in Jira Cloud as well.
            </p>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsEditSprintOpen(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdatingSprint}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
              >
                <span>{isUpdatingSprint ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Task Modal */}
      {isCreateTaskOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTask}
            className="w-full max-w-lg bg-[#0f172a] border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-sm font-bold text-white">Add Scheduled Automation Task</h3>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Task Title / Summary</label>
              <input
                type="text"
                required
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g. Implement user authentication middleware"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Description</label>
              <textarea
                rows={2}
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                placeholder="Details of the task..."
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Priority</label>
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                >
                  <option value="Lowest">Lowest</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Highest">Highest</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">Type</label>
                <select
                  value={taskIssueType}
                  onChange={(e) => setTaskIssueType(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                >
                  <option value="Task">Task</option>
                  <option value="Meeting">Meeting</option>
                  <option value="Research">Research</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Story Points</label>
                <input
                  type="number"
                  step="0.5"
                  value={taskPoints}
                  onChange={(e) => setTaskPoints(parseFloat(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">Assignee</label>
                <select
                  value={taskAssignee}
                  onChange={(e) => setTaskAssignee(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                >
                  {members.length === 0 ? (
                    <option value="">Atai</option>
                  ) : (
                    <>
                      <option value="">Unassigned</option>
                      {members.map((m) => {
                        const isAtai = m.display_name.toLowerCase().includes("atai");
                        return (
                          <option key={m.user_id} value={m.user_id}>
                            {m.display_name} {isAtai ? "★" : `(${m.role_in_project})`}
                          </option>
                        );
                      })}
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Scheduled Status Transitions */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Scheduled Status Transitions</span>
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Move to 'In Progress' at</label>
                  <input
                    type="datetime-local"
                    value={moveInProgressTime}
                    onChange={(e) => setMoveInProgressTime(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Move to 'Done' at</label>
                  <input
                    type="datetime-local"
                    value={moveDoneTime}
                    onChange={(e) => setMoveDoneTime(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateTaskOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30"
              >
                Schedule Task
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
