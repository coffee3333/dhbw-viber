import React, { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  Sparkles,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { jiraAutomationApi } from "../../api/jiraAutomationApi";
import { authApi } from "../../api/authApi";
import { showToast } from "../../utils/toast";
import { useAppStore } from "../../stores/useAppStore";
import { useAuthViewModel } from "../../viewmodels/useAuthViewModel";
import type {
  AutomationProject,
  JiraDiscoveredMember,
  ProjectMember,
} from "../../types/jiraAutomation";
import type { UserProfile } from "../../types/auth";

interface JiraTeamManagerProps {
  project: AutomationProject;
  members: ProjectMember[];
  onRefreshMembers: () => void;
}

export const JiraTeamManager: React.FC<JiraTeamManagerProps> = ({
  project,
  members,
  onRefreshMembers,
}) => {
  const { currentUser } = useAuthViewModel();
  const { setUserCredentialsModalOpen } = useAppStore();

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [discoveredJiraUsers, setDiscoveredJiraUsers] = useState<JiraDiscoveredMember[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Add Member to Project State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [memberRole, setMemberRole] = useState("developer");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadAllUsers();
  }, []);

  const loadAllUsers = async () => {
    try {
      const users = await authApi.adminListUsers();
      setAllUsers(Array.isArray(users) ? users : []);
    } catch {
      setAllUsers([]);
    }
  };

  const handleDiscoverJiraUsers = async () => {
    try {
      setIsDiscovering(true);
      const jiraUsers = await jiraAutomationApi.discoverMembers(project.id);
      setDiscoveredJiraUsers(Array.isArray(jiraUsers) ? jiraUsers : []);
      showToast.success("Jira Users Discovered", `Found ${(jiraUsers || []).length} assignable users in Jira.`);
    } catch (err: any) {
      showToast.error("Discovery Failed", err.response?.data?.detail || err.message);
      setDiscoveredJiraUsers([]);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    try {
      setIsAdding(true);
      await jiraAutomationApi.addMember(project.id, selectedUserId, memberRole);
      showToast.success("Member Added", "Team member assigned to automation project.");
      setIsAddOpen(false);
      setSelectedUserId("");
      onRefreshMembers();
    } catch (err: any) {
      showToast.error("Failed to add member", err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Remove this member from project?")) return;
    try {
      await jiraAutomationApi.removeMember(project.id, userId);
      showToast.success("Member Removed", "User unassigned from project.");
      onRefreshMembers();
    } catch (err: any) {
      showToast.error("Failed to remove member", err.message);
    }
  };

  // Filter users not already in project
  const memberList = Array.isArray(members) ? members : [];
  const userList = Array.isArray(allUsers) ? allUsers : [];
  const memberUserIds = new Set(memberList.map((m) => m.user_id));
  const availableUsers = userList.filter((u) => u && u.id && !memberUserIds.has(u.id));

  return (
    <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-[#0b0f19]">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/20 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white">Team & Jira Account Mapping</h2>
          </div>
          <p className="text-xs text-slate-400">
            Map team members to their Jira Cloud Account IDs so scheduled tasks can be automatically assigned to them.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleDiscoverJiraUsers}
            disabled={isDiscovering}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isDiscovering ? "animate-spin text-cyan-400" : ""}`} />
            <span>Discover Jira Users</span>
          </button>

          <button
            onClick={() => setIsAddOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Assign Member</span>
          </button>

          {currentUser?.role === "admin" && (
            <button
              onClick={() => setUserCredentialsModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-purple-950/70 hover:bg-purple-900/80 text-purple-300 border border-purple-500/40 text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
              title="Register a new platform user"
            >
              <UserPlus className="w-3.5 h-3.5 text-purple-400" />
              <span>Register User</span>
            </button>
          )}
        </div>
      </div>

      {/* Project Members List */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          Assigned Members ({memberList.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {memberList.map((m) => (
            <div
              key={m.id}
              className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white">{m.display_name}</h4>
                    <p className="text-xs text-slate-400 font-mono">@{m.username || m.display_name.toLowerCase().replace(/\s+/g, "")}</p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-950/60 text-indigo-300 border border-indigo-500/30">
                    {m.role_in_project}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  {/* Jira Account ID */}
                  <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Jira Account ID</span>
                      {m.jira_account_id ? (
                        <span className="text-emerald-400 font-medium flex items-center space-x-1 text-[10px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Linked</span>
                        </span>
                      ) : (
                        <span className="text-amber-400 font-medium flex items-center space-x-1 text-[10px]">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Not Linked</span>
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-indigo-300 truncate">
                      {m.jira_account_id || "No Jira ID set"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-800/60">
                <button
                  onClick={() => handleRemoveMember(m.user_id)}
                  className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                  title="Remove from project"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {memberList.length === 0 && (
            <div className="col-span-full p-8 text-center rounded-2xl border border-dashed border-slate-800 text-slate-500 text-xs">
              No members assigned yet. Click "Assign Member" to add team members to this project.
            </div>
          )}
        </div>
      </div>

      {/* Discovered Jira Users Panel */}
      {discoveredJiraUsers.length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Discovered Jira Assignable Users ({discoveredJiraUsers.length})</span>
            </h3>
            <span className="text-[11px] text-slate-500">
              Copy Account ID to set in member's credentials
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {discoveredJiraUsers.map((ju) => (
              <div
                key={ju.account_id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div className="min-w-0 pr-2">
                  <div className="font-semibold text-slate-200 truncate">{ju.display_name}</div>
                  <div className="text-[11px] text-slate-400 truncate">{ju.email || "No email"}</div>
                  <div className="text-[10px] font-mono text-cyan-400 truncate">{ju.account_id}</div>
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(ju.account_id);
                    showToast.success("Copied", `Jira ID for ${ju.display_name} copied to clipboard!`);
                  }}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold flex-shrink-0 cursor-pointer"
                >
                  Copy ID
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assign Member Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAddMember}
            className="w-full max-w-md bg-[#0f172a] border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-sm font-bold text-white">Assign Member to Project</h3>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Select User</label>
              <select
                required
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 cursor-pointer"
              >
                <option value="">-- Choose User --</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name} (@{u.username})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Project Role</label>
              <input
                type="text"
                value={memberRole}
                onChange={(e) => setMemberRole(e.target.value)}
                placeholder="developer, tester, lead..."
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAdding || !selectedUserId}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
