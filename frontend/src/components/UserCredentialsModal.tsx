import React, { useState, useEffect } from "react";
import {
  X,
  Key,
  Shield,
  UserPlus,
  Save,
  CheckCircle2,
  Users,
  Trash2,
  Eye,
  EyeOff,
  Bot,
  FolderSync,
} from "lucide-react";
import { useAuthViewModel } from "../viewmodels/useAuthViewModel";
import { authApi } from "../api/authApi";
import { showToast } from "../utils/toast";
import type { UserProfile } from "../types/auth";
import type { AutomationProject } from "../types/jiraAutomation";
import { JiraProjectSettings } from "../pages/jiraPage/JiraProjectSettings";
import { JiraAgentGuideView } from "../pages/jiraPage/JiraAgentGuideModal";

export type UserCredentialsModalTab = "project" | "agent_guide" | "credentials" | "admin_users";

export interface UserCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: UserCredentialsModalTab;
  project?: AutomationProject;
  onRefreshProject?: () => void;
}

export const UserCredentialsModal: React.FC<UserCredentialsModalProps> = ({
  isOpen,
  onClose,
  initialTab,
  project,
  onRefreshProject,
}) => {
  const { currentUser, credentials, updateCredentials, adminCreateUser, adminDeleteUser } =
    useAuthViewModel();

  const [activeTab, setActiveTab] = useState<UserCredentialsModalTab>(
    initialTab || (project ? "project" : "credentials")
  );

  // Credentials form state
  const [jiraAccountId, setJiraAccountId] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiModel, setGeminiModel] = useState("gemini-flash-latest");
  const [isSavingCreds, setIsSavingCreds] = useState(false);

  // Admin user creation state
  const [userList, setUserList] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"member" | "admin">("member");
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    } else if (project) {
      setActiveTab("project");
    } else {
      setActiveTab("credentials");
    }
  }, [initialTab, isOpen, project?.id]);

  useEffect(() => {
    if (credentials) {
      setJiraAccountId(credentials.jira_account_id || "");
      if (credentials.gemini_model) {
        setGeminiModel(credentials.gemini_model);
      }
    }
  }, [credentials]);

  useEffect(() => {
    if (isOpen && currentUser?.role === "admin" && activeTab === "admin_users") {
      loadUsers();
    }
  }, [isOpen, currentUser, activeTab]);

  const loadUsers = async () => {
    try {
      setIsLoadingUsers(true);
      const users = await authApi.adminListUsers();
      setUserList(Array.isArray(users) ? users : []);
    } catch (err: any) {
      showToast.error("Failed to load users", err.message);
      setUserList([]);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  if (!isOpen) return null;

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingCreds(true);
      await updateCredentials({
        jira_account_id: jiraAccountId.trim() || undefined,
        gemini_api_key: geminiApiKey.trim() || undefined,
        gemini_model: geminiModel,
      });
      showToast.success("Settings Saved", "Your credentials have been updated successfully.");
      setGeminiApiKey("");
    } catch (err: any) {
      showToast.error("Failed to save credentials", err.message);
    } finally {
      setIsSavingCreds(false);
    }
  };

  const handleClearGeminiKey = async () => {
    try {
      setIsSavingCreds(true);
      await updateCredentials({
        gemini_api_key: "",
      });
      showToast.success("Gemini Token Cleared", "Reset to system default key.");
      setGeminiApiKey("");
    } catch (err: any) {
      showToast.error("Failed to clear key", err.message);
    } finally {
      setIsSavingCreds(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newUserPassword.trim()) return;

    try {
      setIsCreatingUser(true);
      await adminCreateUser({
        username: newUsername.trim(),
        display_name: newDisplayName.trim() || newUsername.trim(),
        password: newUserPassword.trim(),
        role: newUserRole,
      });
      showToast.success("Member Registered", `Account for @${newUsername} has been created.`);
      setNewUsername("");
      setNewDisplayName("");
      setNewUserPassword("");
      await loadUsers();
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message;
      showToast.error("Registration Failed", msg);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (userId === currentUser?.id) {
      showToast.error("Forbidden", "Cannot delete your own account.");
      return;
    }
    if (!confirm(`Are you sure you want to delete user @${username}?`)) return;
    try {
      await adminDeleteUser(userId);
      showToast.success("User Deleted", `@${username} has been removed.`);
      await loadUsers();
    } catch (err: any) {
      showToast.error("Failed to delete user", err.response?.data?.detail || err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#0b0f19] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>{project ? "Settings & Integrations Hub" : "Identity & Credentials Manager"}</span>
                {project && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-500/40 text-indigo-300 font-normal">
                    {project.name}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Logged in as <span className="text-indigo-300 font-semibold">{currentUser?.display_name || currentUser?.username}</span> (
                <span className="capitalize">{currentUser?.role}</span>)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 pt-3 border-b border-slate-800 flex space-x-2 bg-slate-900/30 text-xs overflow-x-auto flex-shrink-0">
          {project && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab("project")}
                className={`pb-2.5 px-3 font-semibold transition border-b-2 cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
                  activeTab === "project"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <FolderSync className="w-3.5 h-3.5" />
                <span>Project Connection</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("agent_guide")}
                className={`pb-2.5 px-3 font-semibold transition border-b-2 cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
                  activeTab === "agent_guide"
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Agent Integration</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("credentials")}
            className={`pb-2.5 px-3 font-semibold transition border-b-2 cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === "credentials"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>My Identity & AI</span>
          </button>

          {currentUser?.role === "admin" && (
            <button
              type="button"
              onClick={() => setActiveTab("admin_users")}
              className={`pb-2.5 px-3 font-semibold transition border-b-2 cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
                activeTab === "admin_users"
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Team Registration (Admin Only)</span>
            </button>
          )}
        </div>

        {/* Body Content */}
        <div className="overflow-y-auto flex-1 flex flex-col">
          {activeTab === "project" && project && (
            <div className="p-6">
              <JiraProjectSettings
                project={project}
                onRefreshProject={onRefreshProject || (() => {})}
              />
            </div>
          )}

          {activeTab === "agent_guide" && (
            <JiraAgentGuideView
              projectId={project?.id}
              projectName={project?.name}
            />
          )}

          {activeTab === "credentials" && (
            <div className="p-6 space-y-6">
              <form onSubmit={handleSaveCredentials} className="space-y-4">
                <div className="bg-indigo-950/30 border border-indigo-500/20 p-3.5 rounded-xl text-xs text-indigo-200 flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <span>
                    Map your DHBW StudyHub user to your <strong>Atlassian / Jira Account ID</strong>.
                    When automated sprint tasks are assigned to you, they will automatically be assigned to you in Jira Cloud.
                  </span>
                </div>

                {/* Jira Account ID */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">Jira Account ID (Atlassian ID)</label>
                    {credentials?.jira_account_id && (
                      <span className="text-[11px] text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        Configured
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={jiraAccountId}
                    onChange={(e) => setJiraAccountId(e.target.value)}
                    placeholder="e.g. 712020:e8b0a19f-784e-4a24-be77-4c602fd11c73"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    You can find your Account ID in your Jira Profile URL or via the <strong>Discover Users</strong> button in the Team tab.
                  </p>
                </div>

                {/* Gemini API Key */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <Bot className="w-3.5 h-3.5 text-indigo-400" />
                      <label className="text-xs font-semibold text-slate-300">Google Gemini API Token</label>
                    </div>
                    {credentials?.has_gemini_api_key ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          Custom Key
                        </span>
                        <button
                          type="button"
                          onClick={handleClearGeminiKey}
                          disabled={isSavingCreds}
                          className="text-[10px] text-red-400 hover:text-red-300 underline cursor-pointer"
                          title="Remove custom key and use system default key"
                        >
                          Reset to Default
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded-full">
                        System Key Active
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showGeminiKey ? "text" : "password"}
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder={credentials?.has_gemini_api_key ? (credentials.gemini_api_key_masked || "••••••••••••••••") : "AIzaSy..."}
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Required to use the AI Sprint Planner agent. Your token is encrypted and never shared.
                  </p>
                </div>

                {/* Gemini Model */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Gemini Model</label>
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="gemini-flash-latest">Gemini Flash (Recommended - Fast and Cost-Effective)</option>
                    <option value="gemini-pro-latest">Gemini Pro</option>
                    <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
                  </select>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingCreds}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingCreds ? "Saving..." : "Save Identity"}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === "admin_users" && (
            <div className="p-6 space-y-6">
              {/* Add member form */}
              <form onSubmit={handleCreateUser} className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/60 space-y-3">
                <h3 className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <UserPlus className="w-4 h-4 text-emerald-400" />
                  <span>Register New Team Member</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Username</label>
                    <input
                      type="text"
                      required
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="e.g. atai"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Display Name</label>
                    <input
                      type="text"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="e.g. Atai"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Password</label>
                    <input
                      type="password"
                      required
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">Role</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-100 cursor-pointer"
                    >
                      <option value="member">Member (Developer / Tester)</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isCreatingUser}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isCreatingUser ? "Registering..." : "Add Member"}</span>
                  </button>
                </div>
              </form>

              {/* Existing user list */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-300">Existing Platform Users ({userList.length})</h4>
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                  {userList.map((u) => (
                    <div key={u.id} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-slate-200">{u.display_name}</div>
                        <div className="text-slate-400 text-[11px]">@{u.username}</div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            u.role === "admin"
                              ? "bg-purple-950/60 text-purple-300 border-purple-500/30"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                          }`}
                        >
                          {u.role.toUpperCase()}
                        </span>
                        {u.id !== currentUser?.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
                            title="Delete user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {userList.length === 0 && !isLoadingUsers && (
                    <div className="p-4 text-center text-xs text-slate-500">No users found.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
