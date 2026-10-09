import React, { useState, useEffect } from "react";
import {
  Save,
  Plug,
  Eye,
  EyeOff,
  FolderSync,
  AlertTriangle,
  Trash2,
  X,
  LayoutGrid,
  RefreshCw,
  CheckCircle2,
  Bot,
  Download,
  FileText,
} from "lucide-react";
import { jiraAutomationApi } from "../../api/jiraAutomationApi";
import { useAuthViewModel } from "../../viewmodels/useAuthViewModel";
import { showToast } from "../../utils/toast";
import type { AutomationProject, JiraDiscoveredBoard } from "../../types/jiraAutomation";
import { JiraAgentGuideModal } from "./JiraAgentGuideModal";

interface JiraProjectSettingsProps {
  project: AutomationProject;
  onRefreshProject: () => void;
  onClose?: () => void;
}

export const JiraProjectSettings: React.FC<JiraProjectSettingsProps> = ({
  project,
  onRefreshProject,
  onClose,
}) => {
  const { credentials, updateCredentials } = useAuthViewModel();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || "");

  // Jira config
  const [jiraDomain, setJiraDomain] = useState(project.jira_domain || "");
  const [jiraEmail, setJiraEmail] = useState(project.jira_email || "");
  const [jiraToken, setJiraToken] = useState("");
  const [showJiraToken, setShowJiraToken] = useState(false);
  const [jiraKey, setJiraKey] = useState(project.jira_project_key || "");
  const [jiraBoardId, setJiraBoardId] = useState(project.jira_board_id?.toString() || "");
  const [jiraAccountId, setJiraAccountId] = useState(credentials?.jira_account_id || "");

  useEffect(() => {
    if (credentials?.jira_account_id !== undefined) {
      setJiraAccountId(credentials.jira_account_id || "");
    }
  }, [credentials?.jira_account_id]);

  // Discovered Boards state
  const [discoveredBoards, setDiscoveredBoards] = useState<JiraDiscoveredBoard[]>([]);
  const [isLoadingBoards, setIsLoadingBoards] = useState(false);

  const loadDiscoveredBoards = async () => {
    if (!project.id || !project.has_jira_token) return;
    try {
      setIsLoadingBoards(true);
      const boards = await jiraAutomationApi.discoverBoards(project.id);
      setDiscoveredBoards(boards);
    } catch (err: any) {
      console.warn("Could not load boards:", err);
    } finally {
      setIsLoadingBoards(false);
    }
  };

  useEffect(() => {
    if (project.has_jira_token) {
      loadDiscoveredBoards();
    }
  }, [project.id, project.has_jira_token]);

  const [isSaving, setIsSaving] = useState(false);
  const [isTestingJira, setIsTestingJira] = useState(false);
  const [isSyncingSprints, setIsSyncingSprints] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isDownloadingGuide, setIsDownloadingGuide] = useState(false);

  const handleQuickDownload = async (filename: "AGENTS.md" | "CLAUDE.md") => {
    try {
      setIsDownloadingGuide(true);
      const origin = typeof window !== "undefined" ? window.location.origin : undefined;
      const guide = await jiraAutomationApi.getAgentGuide(project.id, origin);
      const text = filename === "AGENTS.md" ? guide.agents_md : guide.claude_md;
      const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast.success("Downloaded", `${filename} downloaded successfully.`);
    } catch (err: any) {
      showToast.error("Download failed", err.response?.data?.detail || err.message);
    } finally {
      setIsDownloadingGuide(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm(`Are you sure you want to delete project "${project.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      setIsDeleting(true);
      await jiraAutomationApi.deleteProject(project.id);
      showToast.success("Project Deleted", `Project "${project.name}" was removed.`);
      onRefreshProject();
    } catch (err: any) {
      showToast.error("Failed to delete project", err.response?.data?.detail || err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await jiraAutomationApi.updateProject(project.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        jira_domain: jiraDomain.trim() || undefined,
        jira_email: jiraEmail.trim() || undefined,
        jira_api_token: jiraToken.trim() || undefined,
        jira_project_key: jiraKey.trim() || undefined,
        jira_board_id: jiraBoardId ? parseInt(jiraBoardId) : undefined,
      });

      if (jiraAccountId !== (credentials?.jira_account_id || "")) {
        await updateCredentials({
          jira_account_id: jiraAccountId.trim() || undefined,
        });
      }

      setJiraToken("");
      showToast.success("Settings Saved", "Project and Jira account configurations updated.");
      onRefreshProject();
    } catch (err: any) {
      showToast.error("Failed to save settings", err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestJiraConnection = async () => {
    try {
      setIsTestingJira(true);
      const res = await jiraAutomationApi.testConnection(project.id);
      showToast.success(
        "Jira Connected",
        `Successfully authenticated as ${res.displayName || res.emailAddress}`
      );
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message;
      showToast.error("Jira Connection Error", msg);
    } finally {
      setIsTestingJira(false);
    }
  };

  const handleSyncSprints = async () => {
    try {
      setIsSyncingSprints(true);
      const res = await jiraAutomationApi.syncSprints(project.id);
      showToast.success(
        "Sprints Synced",
        `Synced ${res.synced} sprints from Jira Board #${project.jira_board_id}.`
      );
      onRefreshProject();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message;
      showToast.error("Sync Failed", msg);
    } finally {
      setIsSyncingSprints(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-[#0b0f19]">
      <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
        {onClose && (
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-base font-bold text-white">Project Settings</h2>
              <p className="text-xs text-slate-400">Configure Jira Cloud credentials and board sync</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Project Meta */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white">General Project Settings</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Project Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* Jira Cloud API Config */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Plug className="w-4 h-4 text-indigo-400" />
                <span>Atlassian Jira Cloud Integration</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Encrypted (AES-256). Used for Jira automation.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleSyncSprints}
                disabled={isSyncingSprints || !project.has_jira_token}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 border border-slate-700 transition cursor-pointer disabled:opacity-50"
              >
                <FolderSync className={`w-3.5 h-3.5 ${isSyncingSprints ? "animate-spin text-cyan-400" : ""}`} />
                <span>Sync Board Sprints</span>
              </button>

              <button
                type="button"
                onClick={handleTestJiraConnection}
                disabled={isTestingJira || !project.has_jira_token}
                className="px-3 py-1.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Plug className="w-3.5 h-3.5" />
                <span>{isTestingJira ? "Testing..." : "Test Connection"}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Jira Domain (Atlassian Host)</label>
              <input
                type="text"
                value={jiraDomain}
                onChange={(e) => setJiraDomain(e.target.value)}
                placeholder="company.atlassian.net"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Jira Account Email</label>
              <input
                type="email"
                value={jiraEmail}
                onChange={(e) => setJiraEmail(e.target.value)}
                placeholder="admin@company.com"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">Jira API Token</label>
                {project.has_jira_token && (
                  <span className="text-[10px] text-emerald-400">Active: {project.jira_api_token_masked}</span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showJiraToken ? "text" : "password"}
                  value={jiraToken}
                  onChange={(e) => setJiraToken(e.target.value)}
                  placeholder={project.has_jira_token ? "Leave blank to keep existing token" : "ATATT3xFfGF0..."}
                  className="w-full pl-3 pr-10 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowJiraToken(!showJiraToken)}
                  className="absolute right-3 top-2 text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  {showJiraToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Project Key</label>
                <input
                  type="text"
                  value={jiraKey}
                  onChange={(e) => setJiraKey(e.target.value)}
                  placeholder="e.g. KAN"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 uppercase"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-400">Agile Board ID</label>
                  <button
                    type="button"
                    onClick={loadDiscoveredBoards}
                    disabled={isLoadingBoards || !project.has_jira_token}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${isLoadingBoards ? "animate-spin" : ""}`} />
                    <span>Scan Boards</span>
                  </button>
                </div>
                <input
                  type="number"
                  value={jiraBoardId}
                  onChange={(e) => setJiraBoardId(e.target.value)}
                  placeholder="e.g. 1"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-1 md:col-span-2 pt-1 border-t border-slate-800/60">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">Personal Jira Account ID (Atlassian User ID)</label>
                {credentials?.jira_account_id ? (
                  <span className="text-[10px] text-emerald-400">Configured</span>
                ) : (
                  <span className="text-[10px] text-slate-500">Optional</span>
                )}
              </div>
              <input
                type="text"
                value={jiraAccountId}
                onChange={(e) => setJiraAccountId(e.target.value)}
                placeholder="e.g. 712020:e8b0a19f-784e-4a24-be77-4c602fd11c73"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono"
              />
              <p className="text-[10px] text-slate-500">
                Maps your personal user profile to Jira Cloud for sprint ticket assignments and AI task planning.
              </p>
            </div>
          </div>

          {/* Discovered Agile Boards section */}
          <div className="space-y-2.5 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <LayoutGrid className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-bold text-slate-200">
                  Available Jira Boards {discoveredBoards.length > 0 ? `(${discoveredBoards.length})` : ""}
                </h4>
              </div>
              <span className="text-[10px] text-slate-400">
                Click any board below to select it
              </span>
            </div>

            {isLoadingBoards && (
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>Scanning boards from Jira Cloud...</span>
              </div>
            )}

            {!isLoadingBoards && discoveredBoards.length === 0 && (
              <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-500">
                {project.has_jira_token
                  ? "No boards loaded. Click 'Scan Boards' above or check your credentials."
                  : "Add your Jira credentials above to discover and select boards."}
              </div>
            )}

            {!isLoadingBoards && discoveredBoards.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {discoveredBoards.map((b) => {
                  const isSelected = jiraBoardId === b.id.toString();
                  const pKey = b.location?.projectKey;
                  const pName = b.location?.projectName || b.location?.displayName;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setJiraBoardId(b.id.toString());
                        if (pKey && pKey !== jiraKey) {
                          setJiraKey(pKey);
                        }
                      }}
                      className={`text-left p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between space-y-1.5 ${
                        isSelected
                          ? "bg-indigo-950/60 border-indigo-500 text-white shadow-md ring-1 ring-indigo-500/50"
                          : "bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300 hover:bg-slate-850"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-bold truncate mr-2">{b.name}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                            isSelected
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-800 text-slate-300 border border-slate-700"
                          }`}
                        >
                          Board #{b.id}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 w-full pt-0.5">
                        <span className="truncate">
                          {pName ? `${pName} (${pKey || "?"})` : pKey ? `Project: ${pKey}` : "Agile Board"}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase font-mono">
                          {b.type || "simple"}
                        </span>
                      </div>

                      {isSelected ? (
                        <div className="flex items-center space-x-1.5 text-[10px] text-indigo-300 font-semibold pt-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Active Board for this Project</span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-500 hover:text-slate-300 pt-1">
                          Click to select this board →
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? "Saving..." : "Save Project Configuration"}</span>
          </button>
        </div>

        {/* Agent Integration Guide (AGENTS.md / CLAUDE.md) */}
        <div className="p-5 rounded-2xl bg-indigo-950/20 border border-indigo-800/40 flex flex-col space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>Agent Integration Guide</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-900/60 border border-indigo-700/50 text-indigo-300 font-mono">
                    AGENTS.md / CLAUDE.md
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Allow Claude Code, Antigravity CLI (agy), or Cursor agents to schedule meetings & manage Jira tasks in this project.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white font-semibold text-xs flex items-center space-x-1.5 border border-indigo-500/40 transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>View & Customize</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-indigo-900/40">
            <span className="text-xs text-slate-400">Quick Downloads:</span>
            <button
              type="button"
              onClick={() => handleQuickDownload("AGENTS.md")}
              disabled={isDownloadingGuide}
              className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>Download AGENTS.md</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickDownload("CLAUDE.md")}
              disabled={isDownloadingGuide}
              className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>Download CLAUDE.md</span>
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="p-5 rounded-2xl bg-rose-950/20 border border-rose-900/40 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-rose-400 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Danger Zone</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Permanently delete this automation project and all associated scheduled tasks.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDeleteProject}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-semibold text-xs flex items-center space-x-2 shadow-lg shadow-rose-600/20 transition cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isDeleting ? "Deleting..." : "Delete Project"}</span>
          </button>
        </div>
      </form>

      <JiraAgentGuideModal
        projectId={project.id}
        projectName={project.name}
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />
    </div>
  );
};
