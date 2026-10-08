import React, { useState, useEffect } from "react";
import {
  X,
  Shield,
  User,
  UserPlus,
  Save,
  Users,
  Trash2,
  Eye,
  EyeOff,
  Bot,
  FolderSync,
  Code2,
  Calendar,
  RefreshCw,
  LogOut,
  Sparkles,
  Upload,
} from "lucide-react";
import { useAuthViewModel } from "../viewmodels/useAuthViewModel";
import { useCalendarViewModel } from "../viewmodels/useCalendarViewModel";
import { authApi } from "../api/authApi";
import { showToast } from "../utils/toast";
import type { UserProfile } from "../types/auth";
import type { AutomationProject } from "../types/jiraAutomation";
import { JiraProjectSettings } from "../pages/jiraPage/JiraProjectSettings";
import { JiraAgentGuideView } from "../pages/jiraPage/JiraAgentGuideModal";

export type UserCredentialsModalTab =
  | "profile"
  | "ai_models"
  | "developer_tools"
  | "timetable"
  | "google_workspace"
  | "project"
  | "agent_guide"
  | "admin_users"
  | "credentials";

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
  const {
    currentUser,
    credentials,
    updateProfile,
    updateCredentials,
    adminCreateUser,
    adminDeleteUser,
    logout,
  } = useAuthViewModel();

  const {
    sources,
    syncUrl,
    uploadIcs,
    deleteSource,
    refreshAllSources,
  } = useCalendarViewModel();

  // Normalize initialTab
  const normalizeTab = (tab?: UserCredentialsModalTab): UserCredentialsModalTab => {
    if (!tab) return project ? "project" : "profile";
    if (tab === "credentials") return "ai_models";
    if (tab === "google_workspace") return "timetable";
    return tab;
  };

  const [activeTab, setActiveTab] = useState<UserCredentialsModalTab>(normalizeTab(initialTab));

  // Profile Form State
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // AI BYOK Form State
  const [summarizationEngine, setSummarizationEngine] = useState<"gemini" | "openai">("gemini");
  const [transcriptionEngine, setTranscriptionEngine] = useState<"gemini" | "openai" | "local_whisper">("gemini");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiModel, setGeminiModel] = useState("gemini-flash-latest");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [openaiModel, setOpenaiModel] = useState("gpt-4o");
  const [isSavingAI, setIsSavingAI] = useState(false);

  // Developer Tools State
  const [jiraAccountId, setJiraAccountId] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [showGithubToken, setShowGithubToken] = useState(false);
  const [gitAuthorName, setGitAuthorName] = useState("");
  const [gitAuthorEmail, setGitAuthorEmail] = useState("");
  const [isSavingDev, setIsSavingDev] = useState(false);

  // Timetable State
  const [calUrlInput, setCalUrlInput] = useState("");
  const [calNameInput, setCalNameInput] = useState("");
  const [isSyncingCal, setIsSyncingCal] = useState(false);
  const [isUploadingIcs, setIsUploadingIcs] = useState(false);

  // Admin User Registration State
  const [userList, setUserList] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"member" | "admin">("member");
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(normalizeTab(initialTab));
    } else if (project) {
      setActiveTab("project");
    } else {
      setActiveTab("profile");
    }
  }, [initialTab, isOpen, project?.id]);

  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.display_name || "");
      setEmail(currentUser.email || "");
    }
  }, [currentUser]);

  useEffect(() => {
    if (credentials) {
      setJiraAccountId(credentials.jira_account_id || "");
      setGitAuthorName(credentials.git_author_name || "");
      setGitAuthorEmail(credentials.git_author_email || "");
      if (credentials.gemini_model) {
        setGeminiModel(credentials.gemini_model);
      }
      if (credentials.openai_model) {
        setOpenaiModel(credentials.openai_model);
      }
      if (credentials.transcription_engine) {
        setTranscriptionEngine(credentials.transcription_engine as any);
      }
      if (credentials.summarization_engine) {
        setSummarizationEngine(credentials.summarization_engine as any);
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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingProfile(true);
      await updateProfile({
        display_name: displayName.trim() || undefined,
        email: email.trim() || undefined,
      });
      showToast.success("Profile Updated", "Your profile details have been saved.");
    } catch (err: any) {
      showToast.error("Failed to save profile", err.response?.data?.detail || err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveAIConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingAI(true);
      await updateCredentials({
        gemini_api_key: geminiApiKey.trim() || undefined,
        gemini_model: geminiModel,
        openai_api_key: openaiApiKey.trim() || undefined,
        openai_model: openaiModel,
        transcription_engine: transcriptionEngine,
        summarization_engine: summarizationEngine,
      });
      showToast.success("AI Configuration Saved", "Your BYOK preferences have been updated.");
      setGeminiApiKey("");
      setOpenaiApiKey("");
    } catch (err: any) {
      showToast.error("Failed to save AI config", err.response?.data?.detail || err.message);
    } finally {
      setIsSavingAI(false);
    }
  };

  const handleClearGeminiKey = async () => {
    try {
      setIsSavingAI(true);
      await updateCredentials({ gemini_api_key: "" });
      showToast.success("Gemini Token Cleared", "Reset to system default key.");
      setGeminiApiKey("");
    } catch (err: any) {
      showToast.error("Failed to clear key", err.message);
    } finally {
      setIsSavingAI(false);
    }
  };

  const handleClearOpenaiKey = async () => {
    try {
      setIsSavingAI(true);
      await updateCredentials({ openai_api_key: "" });
      showToast.success("OpenAI Key Cleared", "Reset to system default key.");
      setOpenaiApiKey("");
    } catch (err: any) {
      showToast.error("Failed to clear key", err.message);
    } finally {
      setIsSavingAI(false);
    }
  };

  const handleSaveDevCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingDev(true);
      await updateCredentials({
        jira_account_id: jiraAccountId.trim() || undefined,
        github_token: githubToken.trim() || undefined,
        git_author_name: gitAuthorName.trim() || undefined,
        git_author_email: gitAuthorEmail.trim() || undefined,
      });
      showToast.success("Developer Credentials Saved", "Git and Jira mappings updated.");
      setGithubToken("");
    } catch (err: any) {
      showToast.error("Failed to save credentials", err.response?.data?.detail || err.message);
    } finally {
      setIsSavingDev(false);
    }
  };

  const handleClearGithubToken = async () => {
    try {
      setIsSavingDev(true);
      await updateCredentials({ github_token: "" });
      showToast.success("GitHub Token Removed", "Token cleared successfully.");
      setGithubToken("");
    } catch (err: any) {
      showToast.error("Failed to clear token", err.message);
    } finally {
      setIsSavingDev(false);
    }
  };

  const handleSyncUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calUrlInput.trim()) return;
    try {
      setIsSyncingCal(true);
      const res = await syncUrl(calUrlInput.trim(), calNameInput.trim() || undefined);
      showToast.success("Calendar Feed Synced", res.message);
      setCalUrlInput("");
      setCalNameInput("");
    } catch (err: any) {
      showToast.error("Sync Failed", err.message);
    } finally {
      setIsSyncingCal(false);
    }
  };

  const handleFileIcsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingIcs(true);
      const res = await uploadIcs(file);
      showToast.success("ICS Imported", res.message);
    } catch (err: any) {
      showToast.error("Upload Failed", err.message);
    } finally {
      setIsUploadingIcs(false);
      e.target.value = "";
    }
  };

  const handleDeleteSource = async (id: number) => {
    if (!confirm("Are you sure you want to remove this timetable source?")) return;
    try {
      await deleteSource(id);
      showToast.success("Source Removed", "Timetable source removed successfully.");
    } catch (err: any) {
      showToast.error("Failed to delete", err.message);
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
      showToast.success("Member Registered", `Account @${newUsername} has been created.`);
      setNewUsername("");
      setNewDisplayName("");
      setNewUserPassword("");
      await loadUsers();
    } catch (err: any) {
      showToast.error("Registration Failed", err.response?.data?.detail || err.message);
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
      <div className="w-full max-w-3xl bg-[#0b0f19] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Account & Credentials Hub</span>
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
          {/* Tab 1: Profile */}
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`pb-2.5 px-3 font-semibold transition border-b-2 cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === "profile"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>

          {/* Tab 2: AI & Models BYOK */}
          <button
            type="button"
            onClick={() => setActiveTab("ai_models")}
            className={`pb-2.5 px-3 font-semibold transition border-b-2 cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === "ai_models"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>AI Models & BYOK</span>
          </button>

          {/* Tab 3: Git & Developer Tools */}
          <button
            type="button"
            onClick={() => setActiveTab("developer_tools")}
            className={`pb-2.5 px-3 font-semibold transition border-b-2 cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === "developer_tools"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Git & Jira Tools</span>
          </button>

          {/* Tab 4: Timetable / Rapla */}
          <button
            type="button"
            onClick={() => setActiveTab("timetable")}
            className={`pb-2.5 px-3 font-semibold transition border-b-2 cursor-pointer flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === "timetable"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Timetable / Rapla</span>
          </button>

          {/* Project Specific Tabs */}
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
                <span>Agent Guide</span>
              </button>
            </>
          )}

          {/* Admin User Management */}
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
              <span>Team & Admin</span>
            </button>
          )}
        </div>

        {/* Tab Body */}
        <div className="overflow-y-auto flex-1 flex flex-col p-6">
          {/* TAB 1: Profile */}
          {activeTab === "profile" && (
            <div className="space-y-6 w-full">
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="flex items-center space-x-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-lg">
                    {currentUser?.display_name ? currentUser.display_name.slice(0, 2).toUpperCase() : "ME"}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                      <span>{currentUser?.display_name || currentUser?.username}</span>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                        {currentUser?.role}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">@{currentUser?.username}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your Full Name"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@dhbw.de"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      onClose();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 font-semibold text-xs flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingProfile ? "Saving..." : "Save Profile"}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: AI Models & BYOK */}
          {activeTab === "ai_models" && (
            <div className="space-y-6 w-full">
              <form onSubmit={handleSaveAIConfig} className="space-y-6">
                {/* Engine Selector */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <label className="text-xs font-semibold text-slate-200 block">
                      AI Summarization & Study Engine
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSummarizationEngine("gemini")}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 border transition cursor-pointer ${
                          summarizationEngine === "gemini"
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30"
                            : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
                        }`}
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Google Gemini</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSummarizationEngine("openai")}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 border transition cursor-pointer ${
                          summarizationEngine === "openai"
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30"
                            : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>OpenAI</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <label className="text-xs font-semibold text-slate-200 block">
                      Audio Transcription Engine
                    </label>
                    <select
                      value={transcriptionEngine}
                      onChange={(e) => setTranscriptionEngine(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="gemini">Google Gemini 2.5 (Fast & Free Tier Recommended)</option>
                      <option value="openai">OpenAI Whisper (Cloud)</option>
                      <option value="local_whisper">Local Whisper (No API Key Required)</option>
                    </select>
                  </div>
                </div>

                {/* Google Gemini Card */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center text-white">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Google Gemini API Key</h4>
                        <p className="text-[10px] text-slate-400">Powers MeetingAgent and Jira Sprint Planner</p>
                      </div>
                    </div>
                    {credentials?.has_gemini_api_key ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          Personal Key Active
                        </span>
                        <button
                          type="button"
                          onClick={handleClearGeminiKey}
                          disabled={isSavingAI}
                          className="text-[10px] text-red-400 hover:text-red-300 underline cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                        Using System Default Key
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type={showGeminiKey ? "text" : "password"}
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      placeholder={credentials?.has_gemini_api_key ? (credentials.gemini_api_key_masked || "••••••••••••••••") : "AIzaSy..."}
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">Gemini Model</label>
                      <select
                        value={geminiModel}
                        onChange={(e) => setGeminiModel(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="gemini-flash-latest">Gemini Flash (Recommended - Fast & Free)</option>
                        <option value="gemini-pro-latest">Gemini Pro</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* OpenAI Card */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center text-white">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">OpenAI API Key</h4>
                        <p className="text-[10px] text-slate-400">For GPT-4o summarization and Whisper audio</p>
                      </div>
                    </div>
                    {credentials?.has_openai_api_key ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          Personal Key Active
                        </span>
                        <button
                          type="button"
                          onClick={handleClearOpenaiKey}
                          disabled={isSavingAI}
                          className="text-[10px] text-red-400 hover:text-red-300 underline cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                        Using System Default Key
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type={showOpenaiKey ? "text" : "password"}
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      placeholder={credentials?.has_openai_api_key ? (credentials.openai_api_key_masked || "••••••••••••••••") : "sk-..."}
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showOpenaiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">OpenAI Model</label>
                      <select
                        value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="gpt-4o">GPT-4o (Omni Recommended)</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                        <option value="o1-mini">o1 Mini</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSavingAI}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingAI ? "Saving Preferences..." : "Save AI Preferences"}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: Developer & Git Tools */}
          {activeTab === "developer_tools" && (
            <div className="space-y-6 w-full">
              <form onSubmit={handleSaveDevCredentials} className="space-y-4">
                {/* Jira Account Mapping */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200">Jira Account ID (Atlassian ID)</label>
                    {credentials?.jira_account_id ? (
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        Configured
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                        Not Set
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={jiraAccountId}
                    onChange={(e) => setJiraAccountId(e.target.value)}
                    placeholder="e.g. 712020:e8b0a19f-784e-4a24-be77-4c602fd11c73"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Maps your DHBW account to your Atlassian Jira Cloud user for automated sprint task assignment.
                  </p>
                </div>

                {/* GitHub Personal Access Token */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200">GitHub Personal Access Token (PAT)</label>
                    {credentials?.has_github_token ? (
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          Configured
                        </span>
                        <button
                          type="button"
                          onClick={handleClearGithubToken}
                          disabled={isSavingDev}
                          className="text-[10px] text-red-400 hover:text-red-300 underline cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                        Not Set
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showGithubToken ? "text" : "password"}
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder={credentials?.has_github_token ? (credentials.github_token_masked || "••••••••••••••••") : "ghp_..."}
                      className="w-full pl-3 pr-10 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGithubToken(!showGithubToken)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showGithubToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Required for automated code commits, feature branching, and pull request generation under your GitHub identity.
                  </p>
                </div>

                {/* Git Author Name & Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Git Author Name</label>
                    <input
                      type="text"
                      value={gitAuthorName}
                      onChange={(e) => setGitAuthorName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Git Author Email</label>
                    <input
                      type="email"
                      value={gitAuthorEmail}
                      onChange={(e) => setGitAuthorEmail(e.target.value)}
                      placeholder="e.g. john.doe@company.com"
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSavingDev}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-md shadow-indigo-600/30 transition cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingDev ? "Saving..." : "Save Developer Settings"}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: Timetable / Rapla Sync */}
          {activeTab === "timetable" && (
            <div className="space-y-6 w-full">
              {/* DHBW Timetable / Rapla Sync Card */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-xs font-bold text-white">DHBW Rapla Timetable & ICS Feeds</h4>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await refreshAllSources();
                        showToast.success("All Sources Synced", "Timetable calendar updated.");
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center space-x-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Refresh Feeds</span>
                    </button>

                    <label className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-medium flex items-center space-x-1 cursor-pointer">
                      <Upload className="w-3 h-3" />
                      <span>{isUploadingIcs ? "Importing..." : "Upload .ics"}</span>
                      <input
                        type="file"
                        accept=".ics"
                        disabled={isUploadingIcs}
                        onChange={handleFileIcsUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <form onSubmit={handleSyncUrl} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">Rapla iCal / Webcal URL</label>
                      <input
                        type="url"
                        value={calUrlInput}
                        onChange={(e) => setCalUrlInput(e.target.value)}
                        placeholder="https://rapla.dhbw.de/rapla?page=iCal&..."
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-400 block mb-1">Calendar Name (Optional)</label>
                      <input
                        type="text"
                        value={calNameInput}
                        onChange={(e) => setCalNameInput(e.target.value)}
                        placeholder="e.g. DHBW Semester 6"
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSyncingCal || !calUrlInput.trim()}
                      className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center space-x-1.5 transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncingCal ? "animate-spin" : ""}`} />
                      <span>Sync Timetable URL</span>
                    </button>
                  </div>
                </form>

                {/* Active Sources List */}
                {sources && sources.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="text-[11px] font-semibold text-slate-400">Configured Calendar Sources</div>
                    <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
                      {sources.map((src) => (
                        <div key={src.id} className="p-2.5 flex items-center justify-between text-xs">
                          <div>
                            <div className="font-semibold text-slate-200">{src.name}</div>
                            <div className="text-[10px] text-slate-400 truncate max-w-sm">{src.url || "Local File Import"}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteSource(src.id)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: Project Settings */}
          {activeTab === "project" && project && (
            <div className="p-2">
              <JiraProjectSettings
                project={project}
                onRefreshProject={onRefreshProject || (() => {})}
              />
            </div>
          )}

          {/* TAB 6: Jira Agent Guide */}
          {activeTab === "agent_guide" && (
            <JiraAgentGuideView
              projectId={project?.id}
              projectName={project?.name}
            />
          )}

          {/* TAB 7: Admin User Management */}
          {activeTab === "admin_users" && currentUser?.role === "admin" && (
            <div className="space-y-6 w-full">
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
