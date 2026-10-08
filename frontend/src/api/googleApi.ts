import { apiClient } from "./client";
import type { GoogleStatus } from "../types/settings";
import type { ActionItemWithContext, CreateTaskPayload, GoogleRemoteTask } from "../types/tasks";

export const googleApi = {
  async getStatus(): Promise<GoogleStatus> {
    const res = await apiClient.get<GoogleStatus>("/google/status");
    return res.data;
  },

  async getLoginUrl(): Promise<{ auth_url: string }> {
    const res = await apiClient.get<{ auth_url: string }>("/google/login");
    return res.data;
  },

  async disconnect(): Promise<void> {
    await apiClient.post("/google/disconnect");
  },

  async syncCalendar(): Promise<{ message: string; synced: number }> {
    const res = await apiClient.post<{ message: string; synced: number }>("/google/sync-calendar");
    return res.data;
  },

  async syncLecture(lectureId: string): Promise<{ message: string; event_id: string }> {
    const res = await apiClient.post<{ message: string; event_id: string }>(`/google/sync-lecture/${lectureId}`);
    return res.data;
  },

  // ==================== GOOGLE TASKS SYNC ====================

  async syncAllTasks(): Promise<{
    message: string;
    total_items: number;
    created_count: number;
    updated_count: number;
  }> {
    const res = await apiClient.post<{
      message: string;
      total_items: number;
      created_count: number;
      updated_count: number;
    }>("/google/sync-tasks");
    return res.data;
  },

  async syncTasks(meetingId: string): Promise<{ message: string; synced_count: number }> {
    const res = await apiClient.post<{ message: string; synced_count: number }>(`/google/sync-tasks/${meetingId}`);
    return res.data;
  },

  async syncJiraTasks(projectId?: string): Promise<{
    message: string;
    total_tasks: number;
    created_count: number;
    updated_count: number;
  }> {
    const url = projectId ? `/google/sync-jira-tasks?project_id=${projectId}` : "/google/sync-jira-tasks";
    const res = await apiClient.post<{
      message: string;
      total_tasks: number;
      created_count: number;
      updated_count: number;
    }>(url);
    return res.data;
  },

  async pullTasks(): Promise<{ message: string; updated_count: number }> {
    const res = await apiClient.post<{ message: string; updated_count: number }>("/google/pull-tasks");
    return res.data;
  },

  async getRemoteTasks(listTitle?: string): Promise<GoogleRemoteTask[]> {
    const url = listTitle ? `/google/tasks?list_title=${encodeURIComponent(listTitle)}` : "/google/tasks";
    const res = await apiClient.get<GoogleRemoteTask[]>(url);
    return Array.isArray(res.data) ? res.data : [];
  },

  // ==================== ACTION ITEMS & HOMEWORK ====================

  async getActionItems(): Promise<ActionItemWithContext[]> {
    const res = await apiClient.get<ActionItemWithContext[]>("/google/action-items");
    return Array.isArray(res.data) ? res.data : [];
  },

  async createActionItem(payload: CreateTaskPayload): Promise<ActionItemWithContext> {
    const res = await apiClient.post<ActionItemWithContext>("/google/action-items", payload);
    return res.data;
  },

  async toggleActionItem(itemId: number): Promise<{ id: number; completed: boolean; google_task_id?: string }> {
    const res = await apiClient.post<{ id: number; completed: boolean; google_task_id?: string }>(
      `/google/action-items/${itemId}/toggle`
    );
    return res.data;
  },

  async deleteActionItem(itemId: number): Promise<void> {
    await apiClient.delete(`/google/action-items/${itemId}`);
  },

  // ==================== DRIVE BACKUP ====================

  async backupDrive(meetingId: string): Promise<{ message: string; web_view_link?: string }> {
    const res = await apiClient.post<{ message: string; web_view_link?: string }>(`/google/backup-drive/${meetingId}`);
    return res.data;
  },
};
