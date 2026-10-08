import { apiClient } from "./client";
import type {
  AutomationProject,
  AutomationSprint,
  AutomationTask,
  CreateProjectPayload,
  CreateSprintPayload,
  CreateTaskPayload,
  JiraDiscoveredBoard,
  JiraDiscoveredField,
  JiraDiscoveredMember,
  ProjectMember,
  TaskStatusMove,
  TestCredentialsPayload,
  TestCredentialsResponse,
  AgentGuideResponse,
} from "../types/jiraAutomation";

export const jiraAutomationApi = {
  // ==================== PROJECTS ====================
  async listProjects(): Promise<AutomationProject[]> {
    const res = await apiClient.get<AutomationProject[]>("/jira-automation/projects");
    return res.data;
  },

  async getProject(projectId: string): Promise<AutomationProject> {
    const res = await apiClient.get<AutomationProject>(`/jira-automation/projects/${projectId}`);
    return res.data;
  },

  async createProject(payload: CreateProjectPayload): Promise<AutomationProject> {
    const res = await apiClient.post<AutomationProject>("/jira-automation/projects", payload);
    return res.data;
  },

  async updateProject(projectId: string, payload: Partial<CreateProjectPayload>): Promise<AutomationProject> {
    const res = await apiClient.patch<AutomationProject>(`/jira-automation/projects/${projectId}`, payload);
    return res.data;
  },

  async deleteProject(projectId: string): Promise<void> {
    await apiClient.delete(`/jira-automation/projects/${projectId}`);
  },

  // ==================== MEMBERS ====================
  async listMembers(projectId: string): Promise<ProjectMember[]> {
    const res = await apiClient.get<ProjectMember[]>(`/jira-automation/projects/${projectId}/members`);
    return res.data;
  },

  async addMember(projectId: string, userId: string, roleInProject: string = "developer"): Promise<ProjectMember> {
    const res = await apiClient.post<ProjectMember>(`/jira-automation/projects/${projectId}/members`, {
      user_id: userId,
      role_in_project: roleInProject,
    });
    return res.data;
  },

  async removeMember(projectId: string, userId: string): Promise<void> {
    await apiClient.delete(`/jira-automation/projects/${projectId}/members/${userId}`);
  },

  // ==================== JIRA DISCOVERY ====================
  async testCredentials(payload: TestCredentialsPayload): Promise<TestCredentialsResponse> {
    const res = await apiClient.post<TestCredentialsResponse>("/jira-automation/test-credentials", payload);
    return res.data;
  },

  async testConnection(projectId: string): Promise<{ status: string; displayName?: string; emailAddress?: string }> {
    const res = await apiClient.post<{ status: string; displayName?: string; emailAddress?: string }>(
      `/jira-automation/projects/${projectId}/test-connection`
    );
    return res.data;
  },

  async discoverMembers(projectId: string): Promise<JiraDiscoveredMember[]> {
    const res = await apiClient.get<JiraDiscoveredMember[]>(`/jira-automation/projects/${projectId}/discover/members`);
    return res.data;
  },

  async discoverFields(projectId: string): Promise<JiraDiscoveredField[]> {
    const res = await apiClient.get<JiraDiscoveredField[]>(`/jira-automation/projects/${projectId}/discover/fields`);
    return res.data;
  },

  async discoverBoards(projectId: string): Promise<JiraDiscoveredBoard[]> {
    const res = await apiClient.get<JiraDiscoveredBoard[]>(`/jira-automation/projects/${projectId}/discover/boards`);
    return res.data;
  },

  async getIssueTypes(projectId: string): Promise<{ name: string; id?: string; icon_url?: string }[]> {
    const res = await apiClient.get<{ name: string; id?: string; icon_url?: string }[]>(
      `/jira-automation/projects/${projectId}/issue-types`
    );
    return res.data;
  },

  async syncSprints(projectId: string): Promise<{ status: string; synced: number; synced_sprints?: number; synced_tasks?: number; total_board_sprints: number }> {
    const res = await apiClient.post<{ status: string; synced: number; synced_sprints?: number; synced_tasks?: number; total_board_sprints: number }>(
      `/jira-automation/projects/${projectId}/sync-sprints`
    );
    return res.data;
  },

  // ==================== SPRINTS ====================
  async listSprints(projectId: string, boardId?: number): Promise<AutomationSprint[]> {
    const params = boardId ? { board_id: boardId } : {};
    const res = await apiClient.get<AutomationSprint[]>(`/jira-automation/projects/${projectId}/sprints`, { params });
    return res.data;
  },

  async getSprint(sprintId: string): Promise<AutomationSprint> {
    const res = await apiClient.get<AutomationSprint>(`/jira-automation/sprints/${sprintId}`);
    return res.data;
  },

  async createSprint(projectId: string, payload: CreateSprintPayload): Promise<AutomationSprint> {
    const res = await apiClient.post<AutomationSprint>(`/jira-automation/projects/${projectId}/sprints`, payload);
    return res.data;
  },

  async updateSprint(sprintId: string, payload: Partial<CreateSprintPayload & { started: boolean; closed: boolean }>): Promise<AutomationSprint> {
    const res = await apiClient.patch<AutomationSprint>(`/jira-automation/sprints/${sprintId}`, payload);
    return res.data;
  },

  async deleteSprint(sprintId: string): Promise<void> {
    await apiClient.delete(`/jira-automation/sprints/${sprintId}`);
  },

  async pushSprintToJira(sprintId: string): Promise<AutomationSprint> {
    const res = await apiClient.post<AutomationSprint>(`/jira-automation/sprints/${sprintId}/push-to-jira`);
    return res.data;
  },

  async startSprint(sprintId: string): Promise<AutomationSprint> {
    const res = await apiClient.post<AutomationSprint>(`/jira-automation/sprints/${sprintId}/start`);
    return res.data;
  },

  async closeSprint(sprintId: string): Promise<AutomationSprint> {
    const res = await apiClient.post<AutomationSprint>(`/jira-automation/sprints/${sprintId}/close`);
    return res.data;
  },



  // ==================== TASKS & MOVES ====================
  async createTask(sprintId: string, payload: CreateTaskPayload): Promise<AutomationTask> {
    const res = await apiClient.post<AutomationTask>(`/jira-automation/sprints/${sprintId}/tasks`, payload);
    return res.data;
  },

  async getTask(taskId: string): Promise<AutomationTask> {
    const res = await apiClient.get<AutomationTask>(`/jira-automation/tasks/${taskId}`);
    return res.data;
  },

  async updateTask(taskId: string, payload: Partial<CreateTaskPayload & { current_status: string; sprint_id: string }>): Promise<AutomationTask> {
    const res = await apiClient.patch<AutomationTask>(`/jira-automation/tasks/${taskId}`, payload);
    return res.data;
  },

  async deleteTask(taskId: string): Promise<void> {
    await apiClient.delete(`/jira-automation/tasks/${taskId}`);
  },

  async moveTaskToSprint(taskId: string, sprintId: string): Promise<AutomationTask> {
    const res = await apiClient.post<AutomationTask>(`/jira-automation/tasks/${taskId}/move-to-sprint`, {
      sprint_id: sprintId,
    });
    return res.data;
  },

  async addTaskMove(taskId: string, status: string, moveAt: string): Promise<TaskStatusMove> {
    const res = await apiClient.post<TaskStatusMove>(`/jira-automation/tasks/${taskId}/moves`, {
      status,
      move_at: moveAt,
    });
    return res.data;
  },

  async deleteTaskMove(moveId: string): Promise<void> {
    await apiClient.delete(`/jira-automation/moves/${moveId}`);
  },

  // ==================== MANUAL TRIGGERS ====================
  async triggerSprintStart(projectId: string): Promise<{ status: string; message: string }> {
    const res = await apiClient.post(`/jira-automation/projects/${projectId}/trigger/sprint-start`);
    return res.data;
  },

  async triggerSprintClose(projectId: string): Promise<{ status: string; message: string }> {
    const res = await apiClient.post(`/jira-automation/projects/${projectId}/trigger/sprint-close`);
    return res.data;
  },

  async triggerMoves(projectId: string): Promise<{ status: string; message: string }> {
    const res = await apiClient.post(`/jira-automation/projects/${projectId}/trigger/moves`);
    return res.data;
  },

  async triggerTaskCreate(taskId: string): Promise<AutomationTask> {
    const res = await apiClient.post<AutomationTask>(`/jira-automation/tasks/${taskId}/trigger-create`);
    return res.data;
  },

  async agentChat(projectId: string, message: string, history?: { role: string; content: string }[]): Promise<{
    message: string;
    plan: any | null;
  }> {
    const res = await apiClient.post<{ message: string; plan: any | null }>("/jira-automation/agent/chat", {
      project_id: projectId,
      message,
      history,
    });
    return res.data;
  },

  async agentExecutePlan(projectId: string, plan: any): Promise<{
    success: boolean;
    message: string;
    created_sprints: number;
    created_tasks: number;
    created_moves: number;
  }> {
    const res = await apiClient.post<{
      success: boolean;
      message: string;
      created_sprints: number;
      created_tasks: number;
      created_moves: number;
    }>("/jira-automation/agent/execute-plan", {
      project_id: projectId,
      plan,
    });
    return res.data;
  },

  // ==================== AGENT INTEGRATION GUIDE ====================
  async getAgentGuide(projectId?: string, origin?: string): Promise<AgentGuideResponse> {
    const params: Record<string, string> = {};
    if (origin) params.origin = origin;
    const url = projectId
      ? `/jira-automation/projects/${projectId}/agent-guide`
      : `/jira-automation/agent-guide`;
    const res = await apiClient.get<AgentGuideResponse>(url, { params });
    return res.data;
  },
};

