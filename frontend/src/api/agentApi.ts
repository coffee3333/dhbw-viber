import { apiClient } from "./client";

export interface AgentChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  actions_taken?: string[];
  updated_summary?: string | null;
}

export interface SendAgentMessageParams {
  message: string;
  scope: "lecture" | "subject";
  lecture_id?: string;
  subject_id?: string;
  thread_id?: string;
  token_saver?: boolean;
}

export interface AgentChatResponse {
  response: string;
  thread_id: string;
  actions_taken: string[];
  suggested_followups: string[];
  updated_summary?: string | null;
}

export interface AgentHistoryResponse {
  thread_id: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
  }>;
}

export const agentApi = {
  async sendMessage(params: SendAgentMessageParams): Promise<AgentChatResponse> {
    const res = await apiClient.post<AgentChatResponse>("/agent/chat", params);
    return res.data;
  },

  async getHistory(threadId: string): Promise<AgentHistoryResponse> {
    const res = await apiClient.get<AgentHistoryResponse>(`/agent/history?thread_id=${encodeURIComponent(threadId)}`);
    return res.data;
  },

  async clearHistory(threadId: string): Promise<{ success: boolean; message: string }> {
    const res = await apiClient.delete<{ success: boolean; message: string }>(
      `/agent/history?thread_id=${encodeURIComponent(threadId)}`
    );
    return res.data;
  },
};
