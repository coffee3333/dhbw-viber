import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Play,
  Plus,
  X,
  Send,
  CalendarDays,
  Calendar,
  RefreshCw,
  Settings,
  MoreHorizontal,
  Trash2,
  Sparkles,
  Clock,
  ArrowRight,
  LayoutGrid,
  Pencil,
  Check,
  ExternalLink,
} from "lucide-react";
import { jiraAutomationApi } from "../../api/jiraAutomationApi";
import { showToast } from "../../utils/toast";
import { JiraPlannerChat } from "./JiraPlannerChat";
import { UserCredentialsModal, type UserCredentialsModalTab } from "../../components/UserCredentialsModal";
import type {
  AutomationProject,
  AutomationSprint,
  AutomationTask,
  CreateTaskPayload,
  ProjectMember,
  JiraDiscoveredBoard,
} from "../../types/jiraAutomation";

interface JiraCalendarViewProps {
  project: AutomationProject;
  projects?: AutomationProject[];
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  onOpenNewProject?: () => void;
  sprints: AutomationSprint[];
  members: ProjectMember[];
  onRefresh: () => void;
  onSelectSprint?: (sprintId: string) => void;
}

interface CalendarEventItem {
  id: string;
  type: "create" | "move" | "jira-group";
  taskId: string;
  taskTitle: string;
  taskKey?: string | null;
  sprintId: string;
  sprintName: string;
  status: string;
  eventTime: Date;
  done: boolean;
  task: AutomationTask;
  groupTasks?: AutomationTask[];
}

interface TaskFormState {
  id?: string;
  sprintId: string;
  title: string;
  description: string;
  priority: string;
  issueType: string;
  assigneeId: string;
  startDate: string;
  dueDate: string;
  originalEstimate: string;
  timeSpent: string;
  storyPoints: string;
  createAt: string;
  moves: { id?: string; status: string; move_at: string; done?: boolean }[];
  jiraIssueKey?: string | null;
  created?: boolean;
}

const PRIORITIES = ["Highest", "High", "Medium", "Low", "Lowest"] as const;
const DEFAULT_ISSUE_TYPES = ["Task", "Meeting", "Research"] as const;
const MOVE_STATUSES = ["In Progress", "Done"] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "To Do": { bg: "bg-indigo-950/80", text: "text-indigo-200", border: "border-indigo-500/50" },
  "In Progress": { bg: "bg-blue-950/80", text: "text-blue-200", border: "border-blue-500/50" },
  "Done": { bg: "bg-emerald-950/80", text: "text-emerald-300", border: "border-emerald-500/50" },
  "Create (To Do)": { bg: "bg-indigo-950/80", text: "text-indigo-200", border: "border-indigo-500/50" },
  "create": { bg: "bg-indigo-950/80", text: "text-indigo-200", border: "border-indigo-500/50" },
  "jira-group": { bg: "bg-cyan-950/80", text: "text-cyan-200", border: "border-cyan-500/50" },
};

export function parseApiDate(isoStr?: string | null): Date {
  if (!isoStr) return new Date();
  let s = String(isoStr).trim();
  if (s.includes("T") && !s.endsWith("Z") && !/[+-]\d{2}(:\d{2})?$/.test(s)) {
    s += "Z";
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

function emptyTaskForm(
  sprintId: string = "",
  date?: Date,
  sprintEndDate?: Date,
  defaultAssigneeId: string = "",
  defaultIssueType: string = "Task"
): TaskFormState {
  const pad = (n: number) => String(n).padStart(2, "0");
  const toLocalISO = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const toLocalDate = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const defaultCreateAt = new Date();
  defaultCreateAt.setMinutes(Math.ceil(defaultCreateAt.getMinutes() / 5) * 5, 0, 0);

  return {
    sprintId,
    title: "",
    description: "",
    priority: "Medium",
    issueType: defaultIssueType,
    assigneeId: defaultAssigneeId,
    startDate: date ? toLocalDate(date) : "",
    dueDate: sprintEndDate ? toLocalDate(sprintEndDate) : "",
    originalEstimate: "",
    timeSpent: "",
    storyPoints: "",
    createAt: toLocalISO(defaultCreateAt),
    moves: [],
  };
}

function taskToForm(task: AutomationTask): TaskFormState {
  const pad = (n: number) => String(n).padStart(2, "0");
  const toLocalISO = (isoStr: string) => {
    try {
      const d = parseApiDate(isoStr);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  };
  const toLocalDate = (isoStr: string) => {
    try {
      const d = parseApiDate(isoStr);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    } catch {
      return "";
    }
  };

  return {
    id: task.id,
    sprintId: task.sprint_id,
    title: task.title,
    description: task.description || "",
    priority: task.priority || "Medium",
    issueType: task.issue_type || "Task",
    assigneeId: task.assignee_id || "",
    startDate: task.start_date ? toLocalDate(task.start_date) : "",
    dueDate: task.due_date ? toLocalDate(task.due_date) : "",
    originalEstimate: task.original_estimate || "",
    timeSpent: task.time_spent || "",
    storyPoints: task.story_points != null ? String(task.story_points) : "",
    createAt: task.create_at ? toLocalISO(task.create_at) : "",
    moves: (task.moves || []).map((m) => ({
      id: m.id,
      status: m.status,
      move_at: m.move_at ? toLocalISO(m.move_at) : "",
      done: m.done,
    })),
    jiraIssueKey: task.jira_issue_key,
    created: task.created,
  };
}

export const JiraCalendarView: React.FC<JiraCalendarViewProps> = ({
  project,
  projects,
  selectedProjectId,
  onSelectProject,
  onOpenNewProject,
  sprints,
  members,
  onRefresh,
  onSelectSprint,
}) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const [selectedSprintFilter, setSelectedSprintFilter] = useState<string>("all");

  // Priority assignee lookup: Atai first, or first project member
  const defaultAssigneeId = useMemo(() => {
    const atai = members.find((m) => m.display_name.toLowerCase().includes("atai"));
    return atai ? atai.user_id : (members[0]?.user_id || "");
  }, [members]);

  // Dynamic Jira issue types (defaults to Task, Meeting, Research matching Jira)
  const [issueTypes, setIssueTypes] = useState<string[]>([...DEFAULT_ISSUE_TYPES]);

  React.useEffect(() => {
    if (!project.id) return;
    jiraAutomationApi
      .getIssueTypes(project.id)
      .then((types) => {
        if (Array.isArray(types) && types.length > 0) {
          setIssueTypes(types.map((t) => t.name));
        }
      })
      .catch((err) => {
        console.warn("Could not load Jira issue types:", err);
      });
  }, [project.id]);

  // Active Boards state & switcher
  const [boards, setBoards] = useState<JiraDiscoveredBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number>(() => project.jira_board_id || 101);
  const [activeBoardName, setActiveBoardName] = useState<string>(() => {
    return project.jira_project_key ? `${project.jira_project_key} board` : "CP board";
  });
  const [isSwitchingBoard, setIsSwitchingBoard] = useState(false);

  useEffect(() => {
    if (project.jira_board_id) {
      setSelectedBoardId(project.jira_board_id);
    }
  }, [project.jira_board_id]);

  useEffect(() => {
    if (boards.length > 0) {
      const found = boards.find((b) => b.id === selectedBoardId);
      if (found) {
        setActiveBoardName(found.name);
      }
    }
  }, [selectedBoardId, boards]);

  useEffect(() => {
    if (!project.id || !project.has_jira_token) return;
    jiraAutomationApi
      .discoverBoards(project.id)
      .then((data) => {
        if (Array.isArray(data)) {
          setBoards(data);
          const currentId = project.jira_board_id || selectedBoardId;
          const found = data.find((b) => b.id === currentId);
          if (found) {
            setActiveBoardName(found.name);
          } else if (data.length > 0 && !project.jira_board_id) {
            setActiveBoardName(data[0].name);
          }
        }
      })
      .catch((err) => {
        console.warn("Could not load Jira boards:", err);
      });
  }, [project.id, project.jira_board_id, project.has_jira_token]);

  const handleSwitchBoard = async (boardId: number) => {
    if (!boardId || boardId === selectedBoardId) return;
    const selectedBoard = boards.find((b) => b.id === boardId);
    try {
      setIsSwitchingBoard(true);
      setSelectedBoardId(boardId);
      if (selectedBoard) {
        setActiveBoardName(selectedBoard.name);
      }
      await jiraAutomationApi.updateProject(project.id, {
        jira_board_id: boardId,
        jira_project_key: selectedBoard?.location?.projectKey || project.jira_project_key || undefined,
      });
      showToast.success("Board Changed", `Active board set to ${selectedBoard?.name || boardId}`);
      onRefresh();
      // Auto-sync board sprints in background without freezing UI
      jiraAutomationApi
        .syncSprints(project.id)
        .then(() => onRefresh())
        .catch((e) => console.warn("Background sprint sync warning:", e));
    } catch (err: any) {
      showToast.error("Failed to switch board", err.message);
      setSelectedBoardId(project.jira_board_id || 101);
    } finally {
      setIsSwitchingBoard(false);
    }
  };

  // Filter sprints for currently active board
  const boardSprints = useMemo(() => {
    return sprints.filter((s) => !s.board_id || s.board_id === selectedBoardId);
  }, [sprints, selectedBoardId]);


  // Sprints banner display limiter
  const [showAllSprintsBanner, setShowAllSprintsBanner] = useState(false);
  const displaySprints = useMemo(() => {
    if (showAllSprintsBanner || boardSprints.length <= 5) {
      return boardSprints;
    }
    const activeAndFuture = boardSprints.filter((s) => !s.closed);
    const closed = boardSprints.filter((s) => s.closed);
    const recentClosed = closed.slice(-Math.max(1, 5 - activeAndFuture.length));
    const combined = [...recentClosed, ...activeAndFuture];
    return boardSprints.filter((s) => combined.some((c) => c.id === s.id));
  }, [boardSprints, showAllSprintsBanner]);

  // Overflow Menu & Settings Hub state
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [isSettingsHubOpen, setIsSettingsHubOpen] = useState(false);
  const [settingsHubTab, setSettingsHubTab] = useState<UserCredentialsModalTab>("project");
  const [isSyncingFromJira, setIsSyncingFromJira] = useState(false);
  const [isRunningNow, setIsRunningNow] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  const openSettingsHub = (tab: UserCredentialsModalTab = "project") => {
    setSettingsHubTab(tab);
    setIsSettingsHubOpen(true);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setIsOverflowOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSyncFromJira = async () => {
    try {
      setIsSyncingFromJira(true);
      const res = await jiraAutomationApi.syncSprints(project.id);
      const sCount = res.synced_sprints ?? res.synced ?? 0;
      const tCount = res.synced_tasks ?? 0;
      showToast.success("Synced from Jira", `Synced ${sCount} sprints and ${tCount} tasks.`);
      onRefresh();
    } catch (err: any) {
      showToast.error("Sync Failed", err.response?.data?.detail || err.message);
    } finally {
      setIsSyncingFromJira(false);
    }
  };

  const handleRunNow = async () => {
    try {
      setIsRunningNow(true);
      await jiraAutomationApi.triggerSprintStart(project.id);
      await jiraAutomationApi.triggerMoves(project.id);
      await jiraAutomationApi.triggerSprintClose(project.id);
      showToast.success("Automation Tick Executed", "Sprint starts and scheduled moves have been evaluated.");
      onRefresh();
    } catch (err: any) {
      showToast.error("Execution Failed", err.response?.data?.detail || err.message);
    } finally {
      setIsRunningNow(false);
    }
  };

  // Task Dialog (Create / Edit) state
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [taskDialogMode, setTaskDialogMode] = useState<"create" | "edit">("create");
  const [createNow, setCreateNow] = useState(true);
  const [taskForm, setTaskForm] = useState<TaskFormState>(() =>
    emptyTaskForm("", undefined, undefined, defaultAssigneeId)
  );
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Sprint Info modal state
  const [selectedSprintInfo, setSelectedSprintInfo] = useState<AutomationSprint | null>(null);
  const [isEditingSprintEnd, setIsEditingSprintEnd] = useState(false);
  const [editedSprintEnd, setEditedSprintEnd] = useState("");
  const [isSavingSprintEnd, setIsSavingSprintEnd] = useState(false);

  // Day Overview modal state (to view all events/tasks for a day when clicking +N more)
  const [selectedDayEvents, setSelectedDayEvents] = useState<{
    date: Date;
    events: CalendarEventItem[];
  } | null>(null);

  // Jira Group Tasks Modal state (when clicking compact Jira tasks badge)
  const [selectedJiraGroup, setSelectedJiraGroup] = useState<{
    sprintName: string;
    date: Date;
    tasks: AutomationTask[];
  } | null>(null);
  const [jiraSearchQuery, setJiraSearchQuery] = useState("");

  // Schedule Sprint modal state
  const [isScheduleSprintOpen, setIsScheduleSprintOpen] = useState(false);
  const [sprintName, setSprintName] = useState("");
  const [sprintStart, setSprintStart] = useState("");
  const [sprintEnd, setSprintEnd] = useState("");
  const [isSubmittingSprint, setIsSubmittingSprint] = useState(false);

  // Helper to open Task Dialog for a specific date (when clicking a calendar cell)
  const openCreateTaskDialog = (date?: Date) => {
    const clickedDate = date ? new Date(date) : new Date();
    // Find sprint covering this date
    const sprint =
      boardSprints.find((s) => {
        const start = parseApiDate(s.start_date).setHours(0, 0, 0, 0);
        const end = parseApiDate(s.end_date).setHours(23, 59, 59, 999);
        const cur = clickedDate.getTime();
        return cur >= start && cur <= end;
      }) ??
      boardSprints.find((s) => s.started && !s.closed) ??
      boardSprints[0];

    const sprintEndDate = sprint ? parseApiDate(sprint.end_date) : undefined;
    const defaultType = issueTypes.find((t) => t.toLowerCase() === "task") || issueTypes[0] || "Task";
    setTaskForm(emptyTaskForm(sprint?.id ?? "", clickedDate, sprintEndDate, defaultAssigneeId, defaultType));
    setCreateNow(true);
    setTaskDialogMode("create");
    setIsTaskDialogOpen(true);
  };

  const openEditTaskDialog = (task: AutomationTask) => {
    setTaskForm(taskToForm(task));
    if (!task.created) {
      const isPastOrNow = !task.create_at || parseApiDate(task.create_at).getTime() <= Date.now() + 60000;
      setCreateNow(isPastOrNow);
    } else {
      setCreateNow(false);
    }
    setTaskDialogMode("edit");
    setIsTaskDialogOpen(true);
  };

  const openScheduleSprint = (fromDate?: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const now = new Date();
    let start: Date;
    if (fromDate) {
      start = new Date(fromDate);
      if (start.toDateString() === now.toDateString()) {
        start = new Date(now);
        start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5, 0, 0);
      } else {
        start.setHours(9, 0, 0, 0);
      }
    } else {
      start = new Date(now);
      start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5, 0, 0);
    }

    const end = new Date(start);
    end.setDate(end.getDate() + 14); // 2 weeks default
    if (fromDate && start.toDateString() !== now.toDateString()) {
      end.setHours(18, 0, 0, 0);
    }

    setSprintStart(toLocalISO(start));
    setSprintEnd(toLocalISO(end));
    const nextNum = boardSprints.length + 1;
    const prefix = project.jira_project_key ? `${project.jira_project_key} ` : "";
    setSprintName(`${prefix}Sprint ${nextNum}`);
    setIsScheduleSprintOpen(true);
  };

  const setSprintDurationWeeks = (weeks: number) => {
    if (!sprintStart) return;
    const start = new Date(sprintStart);
    const end = new Date(start);
    end.setDate(end.getDate() + weeks * 7);
    const pad = (n: number) => String(n).padStart(2, "0");
    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setSprintEnd(toLocalISO(end));
  };

  const handleCreateSprint = async (startNow: boolean = false) => {
    if (!sprintName.trim() || !sprintStart || !sprintEnd) return;
    try {
      setIsSubmittingSprint(true);
      const res = await jiraAutomationApi.createSprint(project.id, {
        name: sprintName.trim(),
        start_date: new Date(sprintStart).toISOString(),
        end_date: new Date(sprintEnd).toISOString(),
        board_id: selectedBoardId,
        start_now: startNow,
      });
      if (startNow) {
        showToast.success("Sprint Started in Jira", `Sprint '${res.name}' has been created and started in Jira!`);
      } else {
        showToast.success("Sprint Scheduled", `Sprint '${res.name}' scheduled for automated execution.`);
      }
      setIsScheduleSprintOpen(false);
      setSprintName("");
      setSprintStart("");
      setSprintEnd("");
      onRefresh();
    } catch (err: any) {
      showToast.error("Error creating sprint", err.response?.data?.detail || err.message);
    } finally {
      setIsSubmittingSprint(false);
    }
  };

  // Task Dialog Move Handlers
  const addMoveRow = () => {
    const hasDoneInProgress = taskForm.moves.some((m) => m.status === "In Progress" && m.done);
    const hasPendingInProgress = taskForm.moves.some((m) => m.status === "In Progress" && !m.done);
    const nextStatus = (!hasDoneInProgress && !hasPendingInProgress) ? "In Progress" : "Done";
    const pad = (n: number) => String(n).padStart(2, "0");
    const now = new Date();
    const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T14:00`;
    setTaskForm({
      ...taskForm,
      moves: [...taskForm.moves, { status: nextStatus, move_at: iso, done: false }],
    });
  };

  const removeMoveRow = (index: number) => {
    setTaskForm({
      ...taskForm,
      moves: taskForm.moves.filter((_, i) => i !== index),
    });
  };

  const autoFillMoves = () => {
    const sprint = boardSprints.find((s) => s.id === taskForm.sprintId) || sprints.find((s) => s.id === taskForm.sprintId);
    if (!sprint) {
      showToast.error("Sprint not selected", "Please select a sprint first to auto-fill moves.");
      return;
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    const toLocalISO = (dt: Date) =>
      `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;

    // 1. In Progress at task start date (or sprint start) at 10:00
    let startDt = taskForm.startDate ? new Date(taskForm.startDate) : parseApiDate(sprint.start_date);
    startDt.setHours(10, 0, 0, 0);

    // 2. Done at task due date (or sprint end) at 17:00
    let endDt = taskForm.dueDate ? new Date(taskForm.dueDate) : parseApiDate(sprint.end_date);
    endDt.setHours(17, 0, 0, 0);

    if (endDt.getTime() <= startDt.getTime()) {
      endDt = new Date(startDt.getTime() + 2 * 24 * 60 * 60 * 1000);
      endDt.setHours(17, 0, 0, 0);
    }

    // Keep any already completed moves (e.g. In Progress that is done)
    const existingDoneMoves = taskForm.moves.filter((m) => m.done);
    const hasDoneInProgress = existingDoneMoves.some((m) => m.status === "In Progress");
    const hasDoneDone = existingDoneMoves.some((m) => m.status === "Done");

    const newMoves = [...existingDoneMoves];
    if (!hasDoneInProgress) {
      newMoves.push({ status: "In Progress", move_at: toLocalISO(startDt), done: false });
    }
    if (!hasDoneDone) {
      newMoves.push({ status: "Done", move_at: toLocalISO(endDt), done: false });
    }

    setTaskForm({
      ...taskForm,
      moves: newMoves,
    });
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.title.trim()) {
      showToast.error("Validation Error", "Title is required");
      return;
    }
    if (!taskForm.sprintId) {
      showToast.error("Validation Error", "Sprint is required");
      return;
    }

    const createAtValue = createNow
      ? new Date().toISOString()
      : taskForm.createAt
      ? new Date(taskForm.createAt).toISOString()
      : undefined;

    const payload: CreateTaskPayload = {
      title: taskForm.title.trim(),
      description: taskForm.description || undefined,
      priority: taskForm.priority,
      issue_type: taskForm.issueType,
      assignee_id: taskForm.assigneeId || undefined,
      start_date: taskForm.startDate ? new Date(taskForm.startDate).toISOString() : undefined,
      due_date: taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : undefined,
      story_points: taskForm.storyPoints ? parseFloat(taskForm.storyPoints) : undefined,
      original_estimate: taskForm.originalEstimate || undefined,
      time_spent: taskForm.timeSpent || undefined,
      create_at: createAtValue,
      moves: taskForm.moves
        .filter((m) => m.move_at)
        .map((m) => ({
          id: m.id || undefined,
          status: m.status,
          move_at: new Date(m.move_at).toISOString(),
          done: m.done || false,
        })),
    };

    try {
      setIsSubmittingTask(true);
      if (taskDialogMode === "edit" && taskForm.id) {
        await jiraAutomationApi.updateTask(taskForm.id, {
          ...payload,
          sprint_id: taskForm.sprintId,
        });
        showToast.success("Task Updated", `Task '${taskForm.title}' saved.`);
      } else {
        const createdTask = await jiraAutomationApi.createTask(taskForm.sprintId, payload);
        if (createdTask.jira_issue_key) {
          showToast.success(
            "Appeared in Jira (To Do)",
            `Issue ${createdTask.jira_issue_key} was created and placed into To Do on the active Jira Board!`
          );
        } else {
          showToast.success("Task Created", `Task '${taskForm.title}' scheduled for sprint.`);
        }
      }
      setIsTaskDialogOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast.error("Failed to save task", err.response?.data?.detail || err.message);
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!taskForm.id) return;
    if (!confirm(`Are you sure you want to delete task "${taskForm.title}"?`)) return;
    try {
      await jiraAutomationApi.deleteTask(taskForm.id);
      showToast.success("Task Deleted", "Task removed from schedule.");
      setIsTaskDialogOpen(false);
      onRefresh();
    } catch (err: any) {
      showToast.error("Failed to delete task", err.message);
    }
  };

  const handlePushTaskToJira = async () => {
    if (!taskForm.id) return;
    try {
      const res = await jiraAutomationApi.triggerTaskCreate(taskForm.id);
      showToast.success("Pushed to Jira", `Issue ${res.jira_issue_key} created in Jira!`);
      setTaskForm((prev) => ({
        ...prev,
        jiraIssueKey: res.jira_issue_key,
        created: true,
      }));
      onRefresh();
    } catch (err: any) {
      showToast.error("Failed to push task to Jira", err.response?.data?.detail || err.message);
    }
  };

  const handleStartSprintNow = async (sprintId: string) => {
    try {
      await jiraAutomationApi.startSprint(sprintId);
      showToast.success("Sprint Started", "Sprint activated in Jira Agile with tasks!");
      setSelectedSprintInfo(null);
      onRefresh();
    } catch (err: any) {
      showToast.error("Failed to start sprint", err.response?.data?.detail || err.message);
    }
  };

  const handleCloseSprintNow = async (sprintId: string) => {
    try {
      await jiraAutomationApi.closeSprint(sprintId);
      showToast.success("Sprint Closed", "Sprint closed in Jira Agile. Incomplete tasks moved to backlog.");
      setSelectedSprintInfo(null);
      setIsEditingSprintEnd(false);
      onRefresh();
    } catch (err: any) {
      showToast.error("Failed to close sprint", err.response?.data?.detail || err.message);
    }
  };

  const [isDeletingSprint, setIsDeletingSprint] = useState(false);

  const handleDeleteSprint = async (sprintId: string, sprintName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${sprintName}"? This will cancel/delete the sprint in Jira as well as locally. Any Jira tasks will return to the backlog.`
      )
    ) {
      return;
    }
    try {
      setIsDeletingSprint(true);
      await jiraAutomationApi.deleteSprint(sprintId);
      showToast.success("Sprint Deleted", `Sprint "${sprintName}" has been deleted locally and in Jira.`);
      setSelectedSprintInfo(null);
      setIsEditingSprintEnd(false);
      onRefresh();
    } catch (err: any) {
      showToast.error("Failed to delete sprint", err.response?.data?.detail || err.message);
    } finally {
      setIsDeletingSprint(false);
    }
  };

  const handleStartEditSprintEnd = () => {
    if (!selectedSprintInfo) return;
    const pad = (n: number) => String(n).padStart(2, "0");
    const d = parseApiDate(selectedSprintInfo.end_date);
    const localIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setEditedSprintEnd(localIso);
    setIsEditingSprintEnd(true);
  };

  const handleSaveSprintEnd = async () => {
    if (!selectedSprintInfo || !editedSprintEnd) return;
    try {
      setIsSavingSprintEnd(true);
      const newEndDate = new Date(editedSprintEnd).toISOString();
      const updated = await jiraAutomationApi.updateSprint(selectedSprintInfo.id, {
        end_date: newEndDate,
      });
      showToast.success("Sprint End Updated", "Sprint end date updated in Jira & local schedule.");
      setSelectedSprintInfo(updated);
      setIsEditingSprintEnd(false);
      onRefresh();
    } catch (err: any) {
      showToast.error("Failed to update sprint end date", err.response?.data?.detail || err.message);
    } finally {
      setIsSavingSprintEnd(false);
    }
  };

  // Month navigation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const handleToday = () => setCurrentDate(new Date());

  // Filtered sprints based on selected filter (all, active, closed, or sprint ID)
  const filteredSprints = useMemo(() => {
    if (selectedSprintFilter === "all") return boardSprints;
    if (selectedSprintFilter === "active") return boardSprints.filter((s) => !s.closed);
    if (selectedSprintFilter === "closed") return boardSprints.filter((s) => s.closed);
    return boardSprints.filter((s) => s.id === selectedSprintFilter);
  }, [boardSprints, selectedSprintFilter]);

  // Compile calendar events (Creations, Moves, and Jira-imported groups)
  const calendarEvents = useMemo(() => {
    const events: CalendarEventItem[] = [];

    filteredSprints.forEach((s) => {
      // Map to group tasks created in Jira by day
      const jiraTasksByDay = new Map<string, { date: Date; tasks: AutomationTask[] }>();

      (s.tasks || []).forEach((t) => {
        // If task was created in Jira / imported from backlog, group it compactly on its start date
        if (t.from_jira) {
          const rawDate = t.create_at || t.start_date || s.start_date;
          if (rawDate) {
            const parsedDate = parseApiDate(rawDate);
            if (!isNaN(parsedDate.getTime())) {
              const dayKey = `${parsedDate.getFullYear()}-${parsedDate.getMonth()}-${parsedDate.getDate()}`;
              if (!jiraTasksByDay.has(dayKey)) {
                jiraTasksByDay.set(dayKey, { date: parsedDate, tasks: [] });
              }
              jiraTasksByDay.get(dayKey)!.tasks.push(t);
            }
          }
        } else {
          // Tool-created task: render individual creation/scheduled entry
          const rawDate = t.create_at || t.start_date || s.start_date;
          if (rawDate) {
            const parsedDate = parseApiDate(rawDate);
            if (!isNaN(parsedDate.getTime())) {
              events.push({
                id: `create-${t.id}`,
                type: "create",
                taskId: t.id,
                taskTitle: t.title,
                taskKey: t.jira_issue_key,
                sprintId: s.id,
                sprintName: s.name,
                status: t.created ? (t.current_status || "To Do") : "Create (To Do)",
                eventTime: parsedDate,
                done: t.created,
                task: t,
              });
            }
          }
        }

        // 2. Status moves on move_at dates
        (t.moves || []).forEach((m) => {
          if (m.move_at) {
            events.push({
              id: `move-${m.id}`,
              type: "move",
              taskId: t.id,
              taskTitle: t.title,
              taskKey: t.jira_issue_key,
              sprintId: s.id,
              sprintName: s.name,
              status: m.status,
              eventTime: parseApiDate(m.move_at),
              done: m.done,
              task: t,
            });
          }
        });
      });

      // Add compact Jira group pills for each day that has Jira tasks
      jiraTasksByDay.forEach(({ date, tasks }, dayKey) => {
        events.push({
          id: `jira-group-${s.id}-${dayKey}`,
          type: "jira-group",
          taskId: `jira-group-${s.id}-${dayKey}`,
          taskTitle: `${tasks.length} Jira task${tasks.length > 1 ? "s" : ""}`,
          taskKey: null,
          sprintId: s.id,
          sprintName: s.name,
          status: "jira-group",
          eventTime: date,
          done: true,
          task: tasks[0],
          groupTasks: tasks,
        });
      });
    });

    return events;
  }, [filteredSprints]);

  // Calendar days grid calculation (Monday-first)
  const calendarGrid = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysInMonth = lastDayOfMonth.getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const cells: { date: Date; isCurrentMonth: boolean }[] = [];

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({
        date: new Date(year, month, day),
        isCurrentMonth: true,
      });
    }

    const remaining = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      cells.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return cells;
  }, [year, month]);

  // Group into 7-day weeks
  const calendarWeeks = useMemo(() => {
    const weeks: { date: Date; isCurrentMonth: boolean }[][] = [];
    for (let i = 0; i < calendarGrid.length; i += 7) {
      weeks.push(calendarGrid.slice(i, i + 7));
    }
    return weeks;
  }, [calendarGrid]);

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const getEventsForDate = (date: Date) => {
    return calendarEvents.filter((e) => {
      return (
        e.eventTime.getDate() === date.getDate() &&
        e.eventTime.getMonth() === date.getMonth() &&
        e.eventTime.getFullYear() === date.getFullYear()
      );
    });
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0b0f19] w-full min-w-0 max-w-full overflow-hidden">
      {/* 1. Single Clean Unified Top Header */}
      <div className="h-16 px-6 border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur-md flex items-center justify-between flex-shrink-0 gap-4 w-full min-w-0 max-w-full">
        {/* Left: Active Board Selector + Domain badge */}
        <div className="flex items-center space-x-2.5 min-w-0">
          {/* Only show project dropdown if multiple projects exist */}
          {projects && projects.length > 1 && (
            <div className="relative">
              <select
                value={selectedProjectId || project.id}
                onChange={(e) => onSelectProject?.(e.target.value)}
                className="bg-slate-900 border border-slate-700/80 hover:border-slate-600 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer pr-8 appearance-none shadow-sm max-w-[200px] truncate"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.jira_project_key ? `(${p.jira_project_key})` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          )}

          {/* Active Jira Board Selector with Board Name */}
          <div className="relative flex items-center">
            {isSwitchingBoard ? (
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400 absolute left-2.5 animate-spin pointer-events-none" />
            ) : (
              <LayoutGrid className="w-3.5 h-3.5 text-indigo-400 absolute left-2.5 pointer-events-none" />
            )}
            <select
              value={selectedBoardId}
              onChange={(e) => handleSwitchBoard(Number(e.target.value))}
              disabled={isSwitchingBoard}
              className="bg-indigo-950/60 border border-indigo-500/40 hover:border-indigo-400 rounded-xl pl-8 pr-7 py-1.5 text-xs font-bold text-white focus:outline-none cursor-pointer appearance-none shadow-sm transition max-w-[200px] truncate disabled:opacity-50"
              title="Active Jira Board (Click to switch)"
            >
              {boards.length > 0 ? (
                boards.map((b) => (
                  <option key={b.id} value={b.id} className="bg-slate-900 text-slate-100">
                    {b.name}
                  </option>
                ))
              ) : (
                <option value={selectedBoardId}>
                  {activeBoardName || "CP board"}
                </option>
              )}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-indigo-400 absolute right-2 pointer-events-none" />
          </div>

          {onOpenNewProject && (
            <button
              onClick={onOpenNewProject}
              className="p-1.5 rounded-xl bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer flex-shrink-0"
              title="Connect New Jira Project"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Center: Month Navigation */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          <div className="flex items-center space-x-1 bg-slate-900/90 p-0.5 rounded-xl border border-slate-800 shadow-sm">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-2.5 py-1 rounded-lg hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-sm md:text-base font-bold text-white tracking-tight ml-2">
            {monthNames[month]} {year}
          </h2>
        </div>

        {/* Right: Actions (+ New Sprint, ···) */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {/* Sprint Filter */}
          <select
            value={selectedSprintFilter}
            onChange={(e) => setSelectedSprintFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none cursor-pointer max-w-[130px] sm:max-w-[180px] truncate"
            title="Filter sprints on calendar"
          >
            <option value="all">All Sprints ({boardSprints.length})</option>
            <option value="active">Active & Upcoming ({boardSprints.filter((s) => !s.closed).length})</option>
            <option value="closed">Closed Only ({boardSprints.filter((s) => s.closed).length})</option>
            {boardSprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.closed ? "Closed" : s.started ? "Active" : "Future"})
              </option>
            ))}
          </select>

          <button
            onClick={() => openScheduleSprint()}
            className="px-3 py-1.5 rounded-xl border border-slate-700/80 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
          >
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            <span>+ New Sprint</span>
          </button>

          {/* Overflow Menu: Sync, Run Now, Settings */}
          <div className="relative" ref={overflowRef}>
            <button
              onClick={() => setIsOverflowOpen(!isOverflowOpen)}
              className="p-1.5 rounded-xl bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
              title="More Actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {isOverflowOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5">
                <button
                  onClick={async () => {
                    setIsOverflowOpen(false);
                    await handleSyncFromJira();
                  }}
                  disabled={isSyncingFromJira}
                  className="w-full px-3 py-2 rounded-xl text-left flex items-center space-x-2 text-slate-200 hover:bg-slate-800 hover:text-white transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isSyncingFromJira ? "animate-spin" : ""}`} />
                  <span>{isSyncingFromJira ? "Syncing..." : "Sync from Jira"}</span>
                </button>

                <button
                  onClick={async () => {
                    setIsOverflowOpen(false);
                    await handleRunNow();
                  }}
                  disabled={isRunningNow}
                  className="w-full px-3 py-2 rounded-xl text-left flex items-center space-x-2 text-slate-200 hover:bg-slate-800 hover:text-white transition cursor-pointer disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 text-amber-400 ${isRunningNow ? "animate-spin" : ""}`} />
                  <span>{isRunningNow ? "Processing..." : "Run Automation Now"}</span>
                </button>

                <div className="border-t border-slate-800 my-1" />

                <button
                  onClick={() => {
                    setIsOverflowOpen(false);
                    openSettingsHub("project");
                  }}
                  className="w-full px-3 py-2 rounded-xl text-left flex items-center space-x-2 text-slate-200 hover:bg-slate-800 hover:text-white transition cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-purple-400" />
                  <span>Settings & Integrations</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sprints Overview Banner */}
      {boardSprints.length > 0 && (
        <div className="w-full min-w-0 max-w-full px-4 sm:px-6 py-2 border-b border-slate-800/80 bg-slate-900/30 flex flex-wrap items-center gap-2 flex-shrink-0 text-xs max-h-48 overflow-y-auto">
          <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider whitespace-nowrap mr-1">
            Sprints ({boardSprints.length}):
          </span>
          {displaySprints.map((s) => (
            <div
              key={s.id}
              onClick={() => {
                setSelectedSprintInfo(s);
                if (s.start_date) {
                  setCurrentDate(parseApiDate(s.start_date));
                }
              }}
              title="Click to view sprint details and navigate calendar"
              className={`flex items-center space-x-2 px-2.5 py-1 rounded-xl border text-xs whitespace-nowrap cursor-pointer transition hover:scale-[1.02] shadow-sm select-none ${
                s.closed
                  ? "bg-slate-900/60 border-slate-700/80 text-slate-400 hover:border-slate-500"
                  : s.started
                  ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200 shadow-sm shadow-emerald-900/30 hover:border-emerald-400"
                  : "bg-indigo-950/40 border-indigo-500/40 text-indigo-300 hover:border-indigo-400"
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.closed ? "bg-slate-400" : s.started ? "bg-emerald-400 animate-pulse" : "bg-indigo-400"}`} />
              <span className="font-semibold text-white">{s.name}</span>
              <span className="text-[10px] text-slate-400">
                ({parseApiDate(s.start_date).toLocaleDateString([], { month: "short", day: "numeric" })} –{" "}
                {parseApiDate(s.end_date).toLocaleDateString([], { month: "short", day: "numeric" })})
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-950/60 font-mono text-slate-300">
                {s.tasks_count}
              </span>
            </div>
          ))}
          {boardSprints.length > 5 && (
            <button
              onClick={() => setShowAllSprintsBanner(!showAllSprintsBanner)}
              className="px-2.5 py-1 rounded-xl border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer flex items-center space-x-1 shadow-sm whitespace-nowrap flex-shrink-0"
            >
              <span>{showAllSprintsBanner ? "Show fewer" : `+${boardSprints.length - displaySprints.length} more`}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showAllSprintsBanner ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      )}

      {/* 2. Interactive Calendar Grid (Click Day -> Create Task; Click Event -> Edit Task) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto w-full min-w-0 max-w-full">
        {/* Days of week header */}
        <div className="grid grid-cols-7 border-b border-slate-800 bg-[#0f172a] text-center text-xs font-bold text-slate-400 flex-shrink-0">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div key={day} className="py-2.5 border-r border-slate-800/60 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Weeks rows */}
        <div className="flex-1 flex flex-col divide-y divide-slate-800/60 bg-[#0b0f19]">
          {calendarWeeks.map((week, weekIdx) => {
            const weekStartTime = new Date(week[0].date).setHours(0, 0, 0, 0);
            const weekEndTime = new Date(week[6].date).setHours(23, 59, 59, 999);

            const weekSprints = filteredSprints.filter((s) => {
              const sStart = parseApiDate(s.start_date).setHours(0, 0, 0, 0);
              const sEnd = parseApiDate(s.end_date).setHours(23, 59, 59, 999);
              return sEnd >= weekStartTime && sStart <= weekEndTime;
            });

            return (
              <div key={weekIdx} className="flex-1 flex flex-col min-h-[140px] bg-[#0b0f19]">
                {/* Spanning sprint ribbons across this week */}
                {weekSprints.length > 0 && (
                  <div className="grid grid-cols-7 gap-1 px-1 pt-1 bg-slate-950/30 flex-shrink-0">
                    {weekSprints.map((s) => {
                      const sStart = parseApiDate(s.start_date).setHours(0, 0, 0, 0);
                      const sEnd = parseApiDate(s.end_date).setHours(23, 59, 59, 999);

                      let startCol = 1;
                      let endCol = 7;

                      for (let d = 0; d < 7; d++) {
                        const dayStart = new Date(week[d].date).setHours(0, 0, 0, 0);
                        const dayEnd = new Date(week[d].date).setHours(23, 59, 59, 999);
                        if (sStart >= dayStart && sStart <= dayEnd) {
                          startCol = d + 1;
                        }
                        if (sEnd >= dayStart && sEnd <= dayEnd) {
                          endCol = d + 1;
                        }
                      }

                      const colSpan = Math.max(1, endCol - startCol + 1);

                      return (
                        <div
                          key={s.id}
                          style={{
                            gridColumn: `${startCol} / span ${colSpan}`,
                          }}
                          onClick={() => setSelectedSprintInfo(s)}
                          className={`mb-0.5 px-2 py-0.5 rounded text-[11px] font-semibold border border-dashed flex items-center justify-between cursor-pointer transition truncate shadow-sm ${
                            s.closed
                              ? "bg-slate-800/90 border-slate-600 text-slate-300 hover:bg-slate-750"
                              : s.started
                              ? "bg-emerald-950/70 border-emerald-500/80 text-emerald-200 hover:bg-emerald-900/70"
                              : "bg-indigo-950/70 border-indigo-500/80 text-indigo-200 hover:bg-indigo-900/70"
                          }`}
                          title={`${s.name} (${parseApiDate(s.start_date).toLocaleDateString([], { month: "short", day: "numeric" })} – ${parseApiDate(s.end_date).toLocaleDateString([], { month: "short", day: "numeric" })})`}
                        >
                          <div className="flex items-center space-x-1.5 truncate">
                            <span className={`w-1.5 h-1.5 rounded-full ${s.closed ? "bg-slate-400" : s.started ? "bg-emerald-400 animate-pulse" : "bg-indigo-400"}`} />
                            <span className="truncate">{s.name}</span>
                            <span className="text-[10px] opacity-75 font-normal hidden md:inline">
                              {parseApiDate(s.start_date).toLocaleDateString([], { month: "short", day: "numeric" })} – {parseApiDate(s.end_date).toLocaleDateString([], { month: "short", day: "numeric" })}
                            </span>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/40 font-mono ml-1 flex-shrink-0">
                            {s.tasks_count} tasks
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* The 7 day cells */}
                <div className="flex-1 grid grid-cols-7 auto-rows-fr">
                  {week.map((cell, dayIdx) => {
                    const today = isToday(cell.date);
                    const events = getEventsForDate(cell.date);

                    return (
                      <div
                        key={dayIdx}
                        onClick={() => openCreateTaskDialog(cell.date)}
                        className={`group p-2 border-r border-slate-800/60 last:border-r-0 transition flex flex-col justify-between hover:bg-slate-900/50 cursor-pointer ${
                          cell.isCurrentMonth ? "bg-[#0b0f19]" : "bg-slate-950/40 opacity-40"
                        } ${today ? "ring-1 ring-inset ring-indigo-500/50 bg-indigo-950/10" : ""}`}
                      >
                        <div>
                          {/* Day Number + Add Task Hint */}
                          <div className="flex items-center justify-between mb-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                if (events.length > 0) {
                                  e.stopPropagation();
                                  setSelectedDayEvents({ date: cell.date, events });
                                }
                              }}
                              className={`text-xs font-bold px-1.5 py-0.5 rounded-lg transition ${
                                today
                                  ? "bg-indigo-600 text-white"
                                  : cell.isCurrentMonth
                                  ? events.length > 0
                                    ? "text-slate-200 hover:bg-slate-800 cursor-pointer"
                                    : "text-slate-300"
                                  : "text-slate-600"
                              }`}
                              title={events.length > 0 ? "View day overview" : undefined}
                            >
                              {cell.date.getDate()}
                            </button>

                            <span className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 flex items-center space-x-0.5 transition">
                              <Plus className="w-3 h-3" />
                              <span>Task</span>
                            </span>
                          </div>

                          {/* Events list */}
                          <div className="space-y-1">
                            {(events.length <= 5 ? events : events.slice(0, 4)).map((ev) => {
                              if (ev.type === "jira-group") {
                                return (
                                  <div
                                    key={ev.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedJiraGroup({
                                        sprintName: ev.sprintName,
                                        date: ev.eventTime,
                                        tasks: ev.groupTasks || [],
                                      });
                                    }}
                                    className="px-1.5 py-0.5 rounded text-[11px] font-semibold border flex items-center space-x-1.5 truncate shadow-sm transition hover:scale-[1.02] cursor-pointer bg-cyan-950/80 text-cyan-200 border-cyan-500/40 hover:border-cyan-400"
                                    title={`Click to view ${ev.taskTitle} from Jira in modal (${ev.sprintName})`}
                                  >
                                    <CalendarDays className="w-3 h-3 text-cyan-400 shrink-0" />
                                    <span className="truncate">{ev.taskTitle}</span>
                                    <span className="text-[9px] opacity-70 font-mono truncate ml-auto shrink-0">
                                      {ev.sprintName}
                                    </span>
                                  </div>
                                );
                              }

                              const style = STATUS_COLORS[ev.status] || STATUS_COLORS["Done"];
                              return (
                                <div
                                  key={ev.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (ev.task) openEditTaskDialog(ev.task);
                                  }}
                                  className={`px-1.5 py-0.5 rounded text-[11px] font-medium border flex items-center space-x-1 truncate shadow-sm transition hover:scale-[1.02] cursor-pointer ${style.bg} ${style.text} ${style.border}`}
                                  title={`${ev.taskTitle} (${ev.type === "create" ? "Appear in Jira" : "➔ " + ev.status} at ${ev.eventTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`}
                                >
                                  <span className="text-[10px] opacity-75 font-mono">
                                    {ev.done
                                      ? "✓"
                                      : ev.type === "create"
                                      ? "+"
                                      : "→"}
                                  </span>
                                  <span className="truncate">
                                    {ev.taskKey ? `${ev.taskKey} ` : ""}{ev.taskTitle}
                                  </span>
                                  {ev.task?.original_estimate && (
                                    <span className="ml-auto text-[9px] font-mono px-1 rounded bg-black/40 text-slate-300 opacity-80 shrink-0" title={`Estimated: ${ev.task.original_estimate}`}>
                                      {ev.task.original_estimate}
                                    </span>
                                  )}
                                </div>
                              );
                            })}

                            {events.length > 5 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDayEvents({ date: cell.date, events });
                                }}
                                className="w-full text-left text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold px-1.5 py-0.5 rounded hover:bg-indigo-950/60 transition cursor-pointer flex items-center justify-between group/more"
                              >
                                <span>+{events.length - 4} more</span>
                                <span className="text-[10px] opacity-75 group-hover/more:underline">View all →</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {events.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDayEvents({ date: cell.date, events });
                            }}
                            className="text-[9px] text-slate-500 hover:text-indigo-400 font-medium pt-1 text-right block w-full transition cursor-pointer"
                          >
                            {events.length} event{events.length > 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Task Create / Edit Dialog matching reference architecture */}
      {isTaskDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTask}
            className="w-full max-w-lg bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#2a2d3a]">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">
                  {taskDialogMode === "edit" ? "Edit Task" : "New Task"}
                </h3>
                {taskForm.jiraIssueKey && (
                  <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/40 px-2 py-0.5 rounded-full">
                    {taskForm.jiraIssueKey}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsTaskDialogOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sprint selection */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Sprint *</label>
              <select
                required
                value={taskForm.sprintId}
                onChange={(e) => {
                  const s = boardSprints.find((sp) => sp.id === e.target.value) || sprints.find((sp) => sp.id === e.target.value);
                  const pad = (n: number) => String(n).padStart(2, "0");
                  const due = s ? parseApiDate(s.end_date) : undefined;
                  const dueStr = due ? `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}` : taskForm.dueDate;
                  setTaskForm({ ...taskForm, sprintId: e.target.value, dueDate: dueStr });
                }}
                className="w-full px-3 py-2 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="" disabled>Select sprint</option>
                {boardSprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.closed ? "Closed" : s.started ? "Active" : "Upcoming"})
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Title *</label>
              <input
                type="text"
                required
                autoFocus
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="e.g. Implement token refresh logic"
                className="w-full px-3 py-2 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Description</label>
              <textarea
                rows={2}
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                placeholder="Task details and technical requirements..."
                className="w-full px-3 py-2 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            {/* Priority & Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Priority</label>
                <select
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">Type</label>
                <select
                  value={taskForm.issueType}
                  onChange={(e) => setTaskForm({ ...taskForm, issueType: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {issueTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Assignee */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Assignee</label>
              <select
                value={taskForm.assigneeId}
                onChange={(e) => setTaskForm({ ...taskForm, assigneeId: e.target.value })}
                className="w-full px-2.5 py-1.5 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
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

            {/* Dates: Start & Due */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Start Date</label>
                <input
                  type="date"
                  value={taskForm.startDate}
                  onChange={(e) => setTaskForm({ ...taskForm, startDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">Due Date</label>
                <input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Estimate, Time Spent, Story Points */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Original Estimate</label>
                <input
                  type="text"
                  placeholder="2h, 1h 30m, 3d"
                  value={taskForm.originalEstimate}
                  onChange={(e) => setTaskForm({ ...taskForm, originalEstimate: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">Time Spent</label>
                <input
                  type="text"
                  placeholder="1h 30m"
                  value={taskForm.timeSpent}
                  onChange={(e) => setTaskForm({ ...taskForm, timeSpent: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">Story Points</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={taskForm.storyPoints}
                  onChange={(e) => setTaskForm({ ...taskForm, storyPoints: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Appears in Jira (To Do) */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                Appears in Jira (To Do) *
              </label>

              {taskForm.created ? (
                <div className="p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-indigo-300 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>✓ Already created in Jira ({taskForm.jiraIssueKey || "Synced"})</span>
                  </span>
                  {taskForm.createAt && (
                    <span className="text-[11px] text-slate-400 font-mono">
                      {taskForm.createAt.replace("T", " ")}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <input
                    type="datetime-local"
                    value={taskForm.createAt}
                    onChange={(e) => {
                      setCreateNow(false);
                      setTaskForm({ ...taskForm, createAt: e.target.value });
                    }}
                    className={`flex-1 px-2.5 py-1.5 rounded-xl bg-[#0f1117] border text-xs text-slate-100 focus:outline-none focus:border-indigo-500 transition ${
                      createNow ? "border-indigo-500/60" : "border-[#2a2d3a]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCreateNow(true);
                      const pad = (n: number) => String(n).padStart(2, "0");
                      const d = new Date();
                      const nowIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                      setTaskForm({ ...taskForm, createAt: nowIso });
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                      createNow
                        ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                        : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white"
                    }`}
                  >
                    Now
                  </button>
                </div>
              )}
            </div>

            {/* SCHEDULED MOVES */}
            <div className="p-3.5 rounded-xl bg-[#0f1117] border border-[#2a2d3a] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 tracking-wide">
                  SCHEDULED MOVES
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={autoFillMoves}
                    className="px-2 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/40 text-[11px] font-semibold text-indigo-300 cursor-pointer transition"
                  >
                    Auto-fill
                  </button>
                  <button
                    type="button"
                    onClick={addMoveRow}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer transition flex items-center space-x-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {taskForm.moves.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-1">
                  No moves scheduled. Click "Auto-fill" to space out transitions across the sprint.
                </p>
              ) : (
                <div className="space-y-2">
                  {taskForm.moves.map((m, i) => (
                    <div key={i} className="flex items-center space-x-2">
                      <select
                        value={m.status}
                        disabled={m.done}
                        onChange={(e) => {
                          const updated = [...taskForm.moves];
                          updated[i].status = e.target.value;
                          setTaskForm({ ...taskForm, moves: updated });
                        }}
                        className="w-32 px-2 py-1 rounded-lg bg-[#1a1d27] border border-[#2a2d3a] text-xs text-slate-100 disabled:opacity-50 cursor-pointer"
                      >
                        {MOVE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>

                      <input
                        type="datetime-local"
                        value={m.move_at}
                        disabled={m.done}
                        onChange={(e) => {
                          const updated = [...taskForm.moves];
                          updated[i].move_at = e.target.value;
                          setTaskForm({ ...taskForm, moves: updated });
                        }}
                        className="flex-1 px-2 py-1 rounded-lg bg-[#1a1d27] border border-[#2a2d3a] text-xs text-slate-100 disabled:opacity-50"
                      />

                      {m.done ? (
                        <span className="text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30">
                          ✓ Done
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeMoveRow(i)}
                          className="p-1 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dialog Footer Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[#2a2d3a]">
              <div>
                {taskDialogMode === "edit" && (
                  <button
                    type="button"
                    onClick={handleDeleteTask}
                    className="px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {taskDialogMode === "edit" && !taskForm.created && (
                  <button
                    type="button"
                    onClick={handlePushTaskToJira}
                    className="px-3 py-1.5 rounded-xl border border-indigo-500/40 text-indigo-300 hover:bg-indigo-950/40 text-xs font-semibold flex items-center space-x-1 transition cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Push to Jira Now</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsTaskDialogOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingTask}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 disabled:opacity-50 cursor-pointer flex items-center space-x-1.5"
                >
                  {isSubmittingTask ? "Saving..." : taskDialogMode === "edit" ? "Save Changes" : "Create Task"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 4. Sprint Info Modal (When clicking a sprint ribbon) */}
      {selectedSprintInfo && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#2a2d3a]">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-white">{selectedSprintInfo.name}</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    selectedSprintInfo.closed
                      ? "bg-slate-800 text-slate-300"
                      : selectedSprintInfo.started
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-500/30"
                      : "bg-indigo-950 text-indigo-300 border border-indigo-500/30"
                  }`}
                >
                  {selectedSprintInfo.closed ? "Closed" : selectedSprintInfo.started ? "Active" : "Upcoming"}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  disabled={isDeletingSprint}
                  onClick={() => handleDeleteSprint(selectedSprintInfo.id, selectedSprintInfo.name)}
                  className="text-slate-400 hover:text-red-400 p-1.5 cursor-pointer transition rounded-lg hover:bg-red-950/40"
                  title="Delete sprint"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSprintInfo(null);
                    setIsEditingSprintEnd(false);
                  }}
                  className="text-slate-400 hover:text-white p-1 cursor-pointer"
                  title="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              {selectedSprintInfo.jira_sprint_id && (
                <div className="p-2 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-cyan-300 font-mono text-[11px]">
                  Jira Sprint ID: #{selectedSprintInfo.jira_sprint_id}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[#0f1117] border border-[#2a2d3a]">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold mb-1">STARTS</span>
                  <span className="text-slate-200">
                    {parseApiDate(selectedSprintInfo.start_date).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500 block uppercase font-bold">ENDS</span>
                    {!isEditingSprintEnd && !selectedSprintInfo.closed && (
                      <button
                        type="button"
                        onClick={handleStartEditSprintEnd}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center space-x-0.5 cursor-pointer"
                        title="Edit sprint end date"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                  {isEditingSprintEnd ? (
                    <div className="space-y-1.5 pt-0.5">
                      <input
                        type="datetime-local"
                        value={editedSprintEnd}
                        onChange={(e) => setEditedSprintEnd(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg bg-[#1a1d27] border border-indigo-500/80 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <div className="flex items-center space-x-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => setIsEditingSprintEnd(false)}
                          disabled={isSavingSprintEnd}
                          className="px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-white bg-slate-800 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveSprintEnd}
                          disabled={isSavingSprintEnd || !editedSprintEnd}
                          className="px-2.5 py-0.5 rounded text-[10px] text-white bg-indigo-600 hover:bg-indigo-500 font-semibold flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                        >
                          {isSavingSprintEnd ? (
                            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          ) : (
                            <Check className="w-2.5 h-2.5" />
                          )}
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-200">
                      {parseApiDate(selectedSprintInfo.end_date).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0f1117] border border-[#2a2d3a]">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">TASKS</span>
                <span className="text-slate-200 font-medium">
                  {selectedSprintInfo.tasks_count} total tasks ({selectedSprintInfo.completed_tasks_count} completed)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#2a2d3a]">
              <div className="flex items-center space-x-2">
                {!selectedSprintInfo.started && !selectedSprintInfo.closed && (
                  <button
                    type="button"
                    onClick={() => handleStartSprintNow(selectedSprintInfo.id)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start in Jira Now</span>
                  </button>
                )}

                {selectedSprintInfo.started && !selectedSprintInfo.closed && (
                  <button
                    type="button"
                    onClick={() => handleCloseSprintNow(selectedSprintInfo.id)}
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center space-x-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Close Sprint Now</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isDeletingSprint}
                  onClick={() => handleDeleteSprint(selectedSprintInfo.id, selectedSprintInfo.name)}
                  className="px-3 py-1.5 rounded-xl border border-red-500/40 hover:bg-red-950/40 text-red-400 hover:text-red-300 text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Delete this sprint"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeletingSprint ? "Deleting..." : "Delete Sprint"}</span>
                </button>
              </div>

              <div className="flex items-center space-x-2 ml-auto">
                {onSelectSprint && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSprint(selectedSprintInfo.id);
                      setSelectedSprintInfo(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                  >
                    Board
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedSprintInfo(null);
                    setIsEditingSprintEnd(false);
                  }}
                  className="px-3.5 py-1.5 rounded-xl text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Schedule Sprint Modal matching reference */}
      {isScheduleSprintOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#2a2d3a]">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Schedule Sprint</h3>
                  <p className="text-[11px] text-slate-400">Define sprint timelines & automation rules</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleSprintOpen(false)}
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
                placeholder="e.g. KAN Sprint 2"
                className="w-full px-3 py-2 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
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
                    onClick={() => setSprintDurationWeeks(preset.weeks)}
                    className="py-1.5 px-2 rounded-lg bg-[#0f1117] hover:bg-slate-800 border border-[#2a2d3a] hover:border-cyan-500/40 text-xs text-slate-300 font-medium transition cursor-pointer text-center"
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
                  className="w-full px-2.5 py-1.5 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">End Date & Time</label>
                <input
                  type="datetime-local"
                  required
                  value={sprintEnd}
                  onChange={(e) => setSprintEnd(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-[11px] text-slate-300 space-y-1">
              <div className="font-semibold text-slate-200 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Automated Lifecycle:</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Sprint is saved locally immediately. The background scheduler checks every minute and will start/close the sprint, create scheduled tasks, carry over incomplete backlog tasks, and execute status moves exactly at the times you set.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#2a2d3a] gap-2">
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
                  onClick={() => setIsScheduleSprintOpen(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingSprint || !sprintName.trim() || !sprintStart || !sprintEnd}
                  onClick={() => handleCreateSprint(false)}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-md shadow-cyan-600/30 disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>{isSubmittingSprint ? "Saving..." : "Save Schedule"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5.5 Day Overview Modal */}
      {selectedDayEvents && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="p-5 border-b border-[#2a2d3a] flex items-center justify-between bg-[#141721]">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <span>
                      {selectedDayEvents.date.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-500/40 text-indigo-300">
                      {selectedDayEvents.events.length} event{selectedDayEvents.events.length > 1 ? "s" : ""}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Click any task to view or edit details, moves, and Jira sync status.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const d = selectedDayEvents.date;
                    setSelectedDayEvents(null);
                    openCreateTaskDialog(d);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Task</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDayEvents(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* List of events */}
            <div className="p-5 overflow-y-auto space-y-2.5 divide-y divide-slate-800/40">
              {selectedDayEvents.events
                .slice()
                .sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime())
                .map((ev) => {
                  if (ev.type === "jira-group") {
                    return (
                      <div
                        key={ev.id}
                        onClick={() => {
                          setSelectedDayEvents(null);
                          setSelectedJiraGroup({
                            sprintName: ev.sprintName,
                            date: ev.eventTime,
                            tasks: ev.groupTasks || [],
                          });
                        }}
                        className="pt-2.5 first:pt-0 group flex items-center justify-between p-3 rounded-xl bg-cyan-950/40 hover:bg-cyan-950/60 border border-cyan-500/40 hover:border-cyan-400 transition cursor-pointer shadow-sm"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border bg-cyan-950/80 border-cyan-500/40 text-cyan-300">
                            <CalendarDays className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white group-hover:text-cyan-200 transition">
                              {ev.taskTitle}
                            </span>
                            <p className="text-[11px] text-slate-400">
                              Sprint: {ev.sprintName} • Click to view all tasks in modal
                            </p>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-0.5 transition" />
                      </div>
                    );
                  }

                  const style = STATUS_COLORS[ev.status] || STATUS_COLORS["Done"];
                  const assigneeName =
                    ev.task?.assignee_name ||
                    members.find((m) => m.user_id === ev.task?.assignee_id || m.id === ev.task?.assignee_id)?.display_name;
                  return (
                    <div
                      key={ev.id}
                      onClick={() => {
                        setSelectedDayEvents(null);
                        if (ev.task) openEditTaskDialog(ev.task);
                      }}
                      className="pt-2.5 first:pt-0 group flex items-center justify-between p-3 rounded-xl bg-[#0f1117]/80 hover:bg-[#1f2333] border border-[#2a2d3a] hover:border-indigo-500/50 transition cursor-pointer shadow-sm"
                    >
                      <div className="flex items-start space-x-3 min-w-0 flex-1 mr-3">
                        {/* Status / Done icon badge */}
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                            ev.done
                              ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-400"
                              : "bg-amber-950/60 border-amber-500/30 text-amber-300"
                          }`}
                          title={ev.done ? "Completed & Synced to Jira" : "Pending scheduled trigger"}
                        >
                          {ev.done ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <Clock className="w-3.5 h-3.5" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            {ev.taskKey && (
                              <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-500/30 px-1.5 py-0.5 rounded">
                                {ev.taskKey}
                              </span>
                            )}
                            <span className="text-xs font-semibold text-white group-hover:text-indigo-200 transition truncate">
                              {ev.taskTitle}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {ev.task.issue_type}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">
                              {ev.sprintName}
                            </span>
                          </div>

                          <div className="flex items-center space-x-3 mt-1.5 text-[11px] text-slate-400">
                            <span className="flex items-center space-x-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span>
                                {ev.eventTime.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </span>

                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${style.bg} ${style.text} ${style.border}`}
                            >
                              {ev.type === "create" ? "Create (To Do)" : `➔ ${ev.status}`}
                            </span>

                            {assigneeName && (
                              <span className="text-slate-400 text-[11px]">
                                Assignee: <span className="text-slate-200 font-medium">{assigneeName}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition flex items-center space-x-1 font-medium">
                          <span>Edit</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#2a2d3a] bg-[#141721] flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Total events for this day: <span className="text-white font-bold">{selectedDayEvents.events.length}</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedDayEvents(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5.6 Jira Group Tasks Modal (when clicking the compact Jira tasks badge) */}
      {selectedJiraGroup && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#1a1d27] border border-[#2a2d3a] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="p-5 border-b border-[#2a2d3a] flex items-center justify-between bg-[#141721]">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <span>Tasks from Jira</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                      {selectedJiraGroup.tasks.length} task{selectedJiraGroup.tasks.length > 1 ? "s" : ""}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sprint: <span className="text-slate-200 font-medium">{selectedJiraGroup.sprintName}</span> • {selectedJiraGroup.date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedJiraGroup(null);
                  setJiraSearchQuery("");
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick search input if more than 3 tasks */}
            {selectedJiraGroup.tasks.length > 3 && (
              <div className="px-5 pt-3 pb-1 bg-[#141721]/50 border-b border-[#2a2d3a]/60">
                <input
                  type="text"
                  placeholder="Filter tasks by key, title, assignee, or status..."
                  value={jiraSearchQuery}
                  onChange={(e) => setJiraSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-[#0f1117] border border-[#2a2d3a] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}

            {/* List of Jira tasks */}
            <div className="p-5 overflow-y-auto space-y-2.5 divide-y divide-slate-800/40">
              {selectedJiraGroup.tasks
                .filter((t) => {
                  if (!jiraSearchQuery.trim()) return true;
                  const q = jiraSearchQuery.toLowerCase();
                  return (
                    (t.jira_issue_key && t.jira_issue_key.toLowerCase().includes(q)) ||
                    t.title.toLowerCase().includes(q) ||
                    t.current_status.toLowerCase().includes(q) ||
                    (t.assignee_name && t.assignee_name.toLowerCase().includes(q))
                  );
                })
                .map((t) => {
                  const style = STATUS_COLORS[t.current_status] || STATUS_COLORS["To Do"];
                  const assigneeName =
                    t.assignee_name ||
                    members.find((m) => m.user_id === t.assignee_id || m.id === t.assignee_id)?.display_name;

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedJiraGroup(null);
                        openEditTaskDialog(t);
                      }}
                      className="pt-2.5 first:pt-0 group flex items-center justify-between p-3 rounded-xl bg-[#0f1117]/80 hover:bg-[#1f2333] border border-[#2a2d3a] hover:border-cyan-500/50 transition cursor-pointer shadow-sm"
                    >
                      <div className="flex items-start space-x-3 min-w-0 flex-1 mr-3">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border bg-cyan-950/80 border-cyan-500/40 text-cyan-400"
                          title="Imported from Jira"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            {t.jira_issue_key && (
                              project.jira_domain ? (
                                <a
                                  href={`https://${project.jira_domain}/browse/${t.jira_issue_key}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-mono text-xs font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/30 px-1.5 py-0.5 rounded flex items-center space-x-1"
                                  title="Open issue in Jira"
                                >
                                  <span>{t.jira_issue_key}</span>
                                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                </a>
                              ) : (
                                <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded">
                                  {t.jira_issue_key}
                                </span>
                              )
                            )}
                            <span className="text-xs font-semibold text-white group-hover:text-cyan-200 transition truncate">
                              {t.title}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {t.issue_type}
                            </span>
                            {t.moves && t.moves.length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">
                                {t.moves.length} move{t.moves.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-3 mt-1.5 text-[11px] text-slate-400">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${style.bg} ${style.text} ${style.border}`}
                            >
                              {t.current_status}
                            </span>

                            {t.priority && (
                              <span className="text-slate-400 text-[11px]">
                                Priority: <span className="text-slate-200 font-medium">{t.priority}</span>
                              </span>
                            )}

                            {assigneeName && (
                              <span className="text-slate-400 text-[11px]">
                                Assignee: <span className="text-slate-200 font-medium">{assigneeName}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedJiraGroup(null);
                            openEditTaskDialog(t);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-semibold flex items-center space-x-1 transition cursor-pointer"
                        >
                          <span>Schedule / Edit</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#2a2d3a] bg-[#141721] flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Total Jira tasks: <span className="text-white font-bold">{selectedJiraGroup.tasks.length}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedJiraGroup(null);
                  setJiraSearchQuery("");
                }}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. AI Planner Floating Button & Slide-over Drawer */}
      <JiraPlannerChat
        projectId={project.id}
        projectName={project.name}
        onPlanExecuted={async () => {
          await onRefresh();
        }}
        onOpenProfile={() => openSettingsHub("credentials")}
      />

      {/* 7. Unified Settings & Integrations Hub (Project Connection, Agent Guide, AI & Team) */}
      <UserCredentialsModal
        isOpen={isSettingsHubOpen}
        onClose={() => setIsSettingsHubOpen(false)}
        initialTab={settingsHubTab}
        project={project}
        onRefreshProject={onRefresh}
      />
    </div>
  );
};
