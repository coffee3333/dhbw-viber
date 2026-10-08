import { apiClient } from "./client";
import type { Meeting } from "../types/meeting";

export const meetingsApi = {
  async listMeetings(): Promise<Meeting[]> {
    const res = await apiClient.get<Meeting[]>("/meetings/");
    return res.data;
  },

  async getMeeting(id: string): Promise<Meeting> {
    const res = await apiClient.get<Meeting>(`/meetings/${id}`);
    return res.data;
  },

  async uploadRecording(formData: FormData): Promise<Meeting> {
    const res = await apiClient.post<Meeting>("/meetings/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async recordBlob(formData: FormData): Promise<Meeting> {
    const res = await apiClient.post<Meeting>("/meetings/record-blob", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async deleteMeeting(id: string): Promise<void> {
    await apiClient.delete(`/meetings/${id}`);
  },

  async chat(meetingId: string, message: string): Promise<{ answer: string; sources?: string[] }> {
    const res = await apiClient.post<{ answer: string; sources?: string[] }>("/chat/", {
      meeting_id: meetingId,
      message,
    });
    return res.data;
  },

  async exportNotes(meetingId: string, format: "markdown" | "text" = "markdown"): Promise<Blob> {
    const res = await apiClient.get(`/meetings/${meetingId}/export`, {
      params: { format },
      responseType: "blob",
    });
    return res.data;
  },
};
