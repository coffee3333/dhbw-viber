import React, { useState, useEffect } from "react";
import {
  ListTodo,
  Plug,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import { useAppStore } from "../../stores/useAppStore";
import { jiraAutomationApi } from "../../api/jiraAutomationApi";
import { showToast } from "../../utils/toast";
import { JiraCalendarView } from "./JiraCalendarView";
import type { AutomationProject, AutomationSprint, ProjectMember, TestCredentialsResponse } from "../../types/jiraAutomation";

export const JiraAutomationPage: React.FC = () => {
  const { selectedProjectId, setSelectedProjectId } = useAppStore();

  const [projects, setProjects] = useState<AutomationProject[]>([]);
  const [currentProject, setCurrentProject] = useState<AutomationProject | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [sprints, setSprints] = useState<AutomationSprint[]>([]);
  const [_isLoading, setIsLoading] = useState(false);

  // New Project & Jira Connection Modal
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newProjDomain, setNewProjDomain] = useState("");
  const [newProjEmail, setNewProjEmail] = useState("");
  const [newProjToken, setNewProjToken] = useState("");
  const [showProjToken, setShowProjToken] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [newProjKey, setNewProjKey] = useState("");
  const [newProjBoardId, setNewProjBoardId] = useState<number | undefined>(undefined);
  const [autoSyncOnCreate, setAutoSyncOnCreate] = useState(true);

  // Discovery status
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredData, setDiscoveredData] = useState<TestCredentialsResponse | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadSprints = async (projId: string, boardId?: number) => {
    try {
      const data = await jiraAutomationApi.listSprints(projId, boardId);
      setSprints(data);
    } catch (err: any) {
      console.error("Failed to load sprints:", err);
    }
  };

  useEffect(() => {
    if (selectedProjectId && projects.length > 0) {
      const p = projects.find((x) => x.id === selectedProjectId) || projects[0];
      setCurrentProject(p);
      loadMembers(p.id);
      loadSprints(p.id, p.jira_board_id || undefined);
    } else if (projects.length > 0) {
      setCurrentProject(projects[0]);
      setSelectedProjectId(projects[0].id);
      loadMembers(projects[0].id);
      loadSprints(projects[0].id, projects[0].jira_board_id || undefined);
    } else {
      setCurrentProject(null);
      setSprints([]);
    }
  }, [selectedProjectId, projects]);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const data = await jiraAutomationApi.listProjects();
      setProjects(data);
      if (data.length > 0) {
        const targetId = selectedProjectId || data[0].id;
        const active = data.find((x) => x.id === targetId) || data[0];
        setCurrentProject(active);
        await loadSprints(active.id, active.jira_board_id || undefined);
        await loadMembers(active.id);
      }
    } catch (err: any) {
      showToast.error("Failed to load projects", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMembers = async (projId: string) => {
    try {
      const data = await jiraAutomationApi.listMembers(projId);
      setMembers(data);
    } catch (err: any) {
      console.error("Failed to load members:", err);
    }
  };

  const handleDiscoverJira = async () => {
    if (!newProjDomain.trim() || !newProjEmail.trim() || !newProjToken.trim()) {
      setDiscoveryError("Please enter your Jira Domain, Account Email, and API Token.");
      return;
    }

    try {
      setIsDiscovering(true);
      setDiscoveryError(null);

      // Clean domain if user entered https:// or trailing slashes
      const cleanDomain = newProjDomain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
      setNewProjDomain(cleanDomain);

      const res = await jiraAutomationApi.testCredentials({
        jira_domain: cleanDomain,
        jira_email: newProjEmail.trim(),
        jira_api_token: newProjToken.trim(),
      });

      setDiscoveredData(res);
      showToast.success("Jira Connected!", `Authenticated as ${res.displayName}`);

      // Auto-select first project
      if (res.projects && res.projects.length > 0) {
        const firstProj = res.projects[0];
        setNewProjKey(firstProj.key);
        if (!newProjName.trim()) {
          setNewProjName(firstProj.name);
        }
        // Match board
        const matchingBoard = res.boards?.find((b) => b.project_key === firstProj.key);
        if (matchingBoard) {
          setNewProjBoardId(matchingBoard.id);
        } else if (res.boards && res.boards.length > 0) {
          setNewProjBoardId(res.boards[0].id);
        }
      } else if (res.boards && res.boards.length > 0) {
        setNewProjBoardId(res.boards[0].id);
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || "Failed to authenticate with Jira";
      setDiscoveryError(msg);
      showToast.error("Connection Failed", msg);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSelectDiscoveredProject = (projKey: string) => {
    setNewProjKey(projKey);
    const found = discoveredData?.projects.find((p) => p.key === projKey);
    if (found) {
      setNewProjName(found.name);
    }
    const matchingBoard = discoveredData?.boards.find((b) => b.project_key === projKey);
    if (matchingBoard) {
      setNewProjBoardId(matchingBoard.id);
    }
  };

  const resetModalState = () => {
    setNewProjName("");
    setNewProjKey("");
    setNewProjDomain("");
    setNewProjEmail("");
    setNewProjToken("");
    setShowProjToken(false);
    setNewProjBoardId(undefined);
    setDiscoveredData(null);
    setDiscoveryError(null);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;

    try {
      setIsCreatingProject(true);
      const cleanDomain = newProjDomain.trim()
        ? newProjDomain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")
        : undefined;

      const res = await jiraAutomationApi.createProject({
        name: newProjName.trim(),
        jira_project_key: newProjKey.trim() || undefined,
        jira_domain: cleanDomain,
        jira_email: newProjEmail.trim() || undefined,
        jira_api_token: newProjToken.trim() || undefined,
        jira_board_id: newProjBoardId,
      });

      let syncMsg = "";
      if (autoSyncOnCreate && cleanDomain && newProjToken.trim() && newProjBoardId) {
        try {
          const syncRes = await jiraAutomationApi.syncSprints(res.id);
          const sCount = syncRes.synced_sprints ?? syncRes.synced ?? 0;
          const tCount = syncRes.synced_tasks ?? 0;
          syncMsg = ` Synced ${sCount} sprints and ${tCount} tasks.`;
        } catch (syncErr: any) {
          console.warn("Initial sync error:", syncErr);
        }
      }

      showToast.success("Project Created", `Automation project '${res.name}' created.${syncMsg}`);
      setIsNewProjectOpen(false);
      resetModalState();
      await loadProjects();
      setSelectedProjectId(res.id);
    } catch (err: any) {
      showToast.error("Failed to create project", err.response?.data?.detail || err.message);
    } finally {
      setIsCreatingProject(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b0f19] text-slate-100 overflow-hidden">
      {/* Main Single-Screen Calendar View */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {currentProject ? (
          <JiraCalendarView
            project={currentProject}
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={(projId) => setSelectedProjectId(projId)}
            onOpenNewProject={() => {
              resetModalState();
              setIsNewProjectOpen(true);
            }}
            sprints={sprints}
            members={members}
            onRefresh={async () => {
              await loadProjects();
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-950/50 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-xl">
              <ListTodo className="w-8 h-8" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h2 className="text-base font-bold text-white">No Jira Projects Connected</h2>
              <p className="text-xs text-slate-400">
                Connect your Jira Cloud workspace to automatically discover boards, sync existing sprints, and schedule your tasks.
              </p>
            </div>
            <button
              onClick={() => {
                resetModalState();
                setIsNewProjectOpen(true);
              }}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
            >
              <Plug className="w-4 h-4" />
              <span>Connect Jira Cloud</span>
            </button>
          </div>
        )}
      </div>

      {/* Connect Jira Cloud Modal */}
      {isNewProjectOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#0f172a] border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Plug className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Connect Jira Cloud Project</h3>
                  <p className="text-[11px] text-slate-400">Discover your boards, sprints, and issues directly from Jira</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsNewProjectOpen(false);
                  resetModalState();
                }}
                className="text-slate-500 hover:text-slate-300 text-sm font-semibold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Step 1: Jira Credentials */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                1. Jira Cloud Credentials
              </span>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">Jira Host Domain</label>
                <div className="flex items-center rounded-xl bg-slate-950 border border-slate-700/80 px-3 py-1.5 focus-within:border-indigo-500">
                  <span className="text-xs text-slate-500 mr-1">https://</span>
                  <input
                    type="text"
                    value={newProjDomain}
                    onChange={(e) => setNewProjDomain(e.target.value)}
                    placeholder="your-company.atlassian.net"
                    className="flex-1 bg-transparent text-xs text-slate-100 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">Atlassian Account Email</label>
                <input
                  type="email"
                  value={newProjEmail}
                  onChange={(e) => setNewProjEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-400">Atlassian API Token</label>
                  <a
                    href="https://id.atlassian.com/manage-profile/security/api-tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-indigo-400 hover:underline"
                  >
                    Generate API Token ↗
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showProjToken ? "text" : "password"}
                    value={newProjToken}
                    onChange={(e) => setNewProjToken(e.target.value)}
                    placeholder="ATATT3xFfGF0..."
                    className="w-full pl-3 pr-10 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowProjToken(!showProjToken)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showProjToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDiscoverJira}
                disabled={isDiscovering || !newProjDomain.trim() || !newProjEmail.trim() || !newProjToken.trim()}
                className="w-full py-2 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center space-x-2 transition cursor-pointer disabled:opacity-50 shadow-md"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isDiscovering ? "animate-spin" : ""}`} />
                <span>{isDiscovering ? "Connecting & Discovering..." : "Connect & Discover Jira Projects"}</span>
              </button>

              {discoveryError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-start space-x-2 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{discoveryError}</span>
                </div>
              )}

              {discoveredData && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center space-x-2 text-emerald-300 text-xs">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Authenticated as <strong>{discoveredData.displayName}</strong>. Found{" "}
                    {discoveredData.projects?.length || 0} projects and {discoveredData.boards?.length || 0} boards.
                  </span>
                </div>
              )}
            </div>

            {/* Step 2: Project & Board Configuration */}
            <form onSubmit={handleCreateProject} className="space-y-4">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                2. Project & Board Configuration
              </span>

              {discoveredData && discoveredData.projects?.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Select Jira Project</label>
                  <select
                    value={newProjKey}
                    onChange={(e) => handleSelectDiscoveredProject(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 cursor-pointer"
                  >
                    {discoveredData.projects.map((p) => (
                      <option key={p.id} value={p.key}>
                        {p.name} ({p.key})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {discoveredData && discoveredData.boards?.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Select Agile Board</label>
                  <div className="relative">
                    <select
                      value={newProjBoardId ?? ""}
                      onChange={(e) => setNewProjBoardId(e.target.value ? parseInt(e.target.value) : undefined)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 cursor-pointer"
                    >
                      <option value="">-- Select Agile Board --</option>
                      {discoveredData.boards.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.type.toUpperCase()}) {b.project_key ? `[${b.project_key}]` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Project Display Name</label>
                  <input
                    type="text"
                    required
                    value={newProjName}
                    onChange={(e) => setNewProjName(e.target.value)}
                    placeholder="e.g. Mobile App Sprint Schedule"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Jira Project Key</label>
                  <input
                    type="text"
                    value={newProjKey}
                    onChange={(e) => setNewProjKey(e.target.value)}
                    placeholder="e.g. KAN"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 uppercase"
                  />
                </div>
              </div>

              {!discoveredData && (
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Agile Board ID (optional)</label>
                  <input
                    type="number"
                    value={newProjBoardId ?? ""}
                    onChange={(e) => setNewProjBoardId(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="e.g. 1"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                  />
                </div>
              )}

              {newProjBoardId && (
                <label className="flex items-center space-x-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={autoSyncOnCreate}
                    onChange={(e) => setAutoSyncOnCreate(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                  />
                  <span className="text-xs text-slate-300">
                    Immediately sync all sprints and tasks from this board after creating
                  </span>
                </label>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewProjectOpen(false);
                    resetModalState();
                  }}
                  className="px-3.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProject || !newProjName.trim()}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 disabled:opacity-50 transition cursor-pointer flex items-center space-x-1.5"
                >
                  {isCreatingProject ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating & Syncing...</span>
                    </>
                  ) : (
                    <span>{newProjBoardId && autoSyncOnCreate ? "Create & Sync from Jira" : "Create Project"}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
