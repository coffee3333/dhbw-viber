import { apiClient } from "./client";
import type {
  Lecture,
  Subject,
  CalendarSource,
  SyncUrlPayload,
  SyncResponse,
  SubjectDetail,
  LectureDetail,
  CreateSubjectPayload,
  UpdateSubjectPayload,
} from "../types/calendar";

export const calendarApi = {
  async getLectures(start?: string, end?: string, subjectId?: string): Promise<Lecture[]> {
    const params: Record<string, string> = {};
    if (start) params.start = start;
    if (end) params.end = end;
    if (subjectId) params.subject_id = subjectId;
    const res = await apiClient.get<Lecture[]>("/calendar/lectures", { params });
    return res.data;
  },

  async getLecture(id: string): Promise<Lecture> {
    const res = await apiClient.get<Lecture>(`/calendar/lectures/${id}`);
    return res.data;
  },

  async getLectureDetail(id: string): Promise<LectureDetail> {
    const res = await apiClient.get<LectureDetail>(`/calendar/lectures/${id}`);
    return res.data;
  },

  async getSubjectDetail(subjectId: string): Promise<SubjectDetail> {
    const res = await apiClient.get<SubjectDetail>(`/calendar/subjects/${subjectId}`);
    return res.data;
  },

  async updateLectureStatus(lectureId: string, status: string): Promise<{ message: string; status: string }> {
    const res = await apiClient.patch<{ message: string; status: string }>(`/calendar/lectures/${lectureId}/status`, { status });
    return res.data;
  },

  async updateLectureNotes(lectureId: string, notes: string): Promise<{ message: string; notes: string }> {
    const res = await apiClient.patch<{ message: string; notes: string }>(`/calendar/lectures/${lectureId}/notes`, { notes });
    return res.data;
  },

  async addLectureMaterial(lectureId: string, material: { title: string; type?: string; url: string }): Promise<any> {
    const res = await apiClient.post(`/calendar/lectures/${lectureId}/materials`, material);
    return res.data;
  },

  async uploadLectureMaterial(lectureId: string, file: File, materialType?: string): Promise<any> {
    const formData = new FormData();
    formData.append("file", file);
    if (materialType) {
      formData.append("material_type", materialType);
    }
    const res = await apiClient.post(`/calendar/lectures/${lectureId}/materials/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return res.data;
  },

  async generateLectureSummary(lectureId: string, customInstructions?: string): Promise<any> {
    const res = await apiClient.post(`/calendar/lectures/${lectureId}/generate-summary`, {
      custom_instructions: customInstructions
    });
    return res.data;
  },

  async deleteLectureMaterial(lectureId: string, materialId: string): Promise<any> {
    const res = await apiClient.delete(`/calendar/lectures/${lectureId}/materials/${materialId}`);
    return res.data;
  },

  async toggleActionItem(lectureId: string, itemId: number): Promise<{ id: number; completed: boolean }> {
    const res = await apiClient.post<{ id: number; completed: boolean }>(`/calendar/lectures/${lectureId}/action_items/${itemId}/toggle`);
    return res.data;
  },

  async getCurrentOrUpcoming(): Promise<Lecture | null> {
    const res = await apiClient.get<{ lecture: any | null }>("/calendar/current-or-upcoming");
    const raw = res.data?.lecture;
    if (!raw) return null;

    const extendedProps = raw.extendedProps || {
      subject_id: raw.subject_id || "",
      subject_name: raw.subject_name || "Lecture",
      lecturer: raw.lecturer || null,
      room: raw.room || null,
      meeting_link: raw.meeting_link || null,
      description: raw.description || "",
      has_recording: Boolean(raw.has_recording),
      recording_id: raw.recording_id || null,
      recording_status: raw.recording_status || null,
      action_items_count: raw.action_items_count || 0,
      incoming_tasks_count: raw.incoming_tasks_count || 0,
      assigned_tasks: raw.assigned_tasks || [],
      incoming_tasks: raw.incoming_tasks || [],
      has_tasks: Boolean(raw.has_tasks || raw.action_items_count || raw.incoming_tasks_count),
    };

    return {
      id: raw.id,
      title: raw.title,
      start: raw.start || raw.start_time,
      end: raw.end || raw.end_time,
      backgroundColor: raw.backgroundColor || "#4f46e5",
      borderColor: raw.borderColor || "#4f46e5",
      textColor: raw.textColor || "#ffffff",
      extendedProps,
    };
  },

  async getSubjects(): Promise<Subject[]> {
    const res = await apiClient.get<Subject[]>("/calendar/subjects");
    return res.data;
  },

  async getSources(): Promise<CalendarSource[]> {
    const res = await apiClient.get<CalendarSource[]>("/calendar/sources");
    return res.data;
  },

  async syncUrl(payload: SyncUrlPayload): Promise<SyncResponse> {
    const res = await apiClient.post<SyncResponse>("/calendar/sync-url", payload);
    return res.data;
  },

  async uploadIcs(file: File): Promise<SyncResponse> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiClient.post<SyncResponse>("/calendar/upload-ics", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async deleteSource(sourceId: number): Promise<void> {
    await apiClient.delete(`/calendar/sources/${sourceId}`);
  },

  async refreshAll(): Promise<{ message: string }> {
    const res = await apiClient.post<{ message: string }>("/calendar/refresh-all");
    return res.data;
  },

  async createSubject(payload: CreateSubjectPayload): Promise<Subject> {
    const res = await apiClient.post<Subject>("/calendar/subjects", payload);
    return res.data;
  },

  async updateSubject(subjectId: string, payload: UpdateSubjectPayload): Promise<Subject> {
    const res = await apiClient.put<Subject>(`/calendar/subjects/${subjectId}`, payload);
    return res.data;
  },

  async deleteSubject(subjectId: string): Promise<void> {
    await apiClient.delete(`/calendar/subjects/${subjectId}`);
  },

  async cleanupHolidays(): Promise<{ message: string; deleted_count: number; deleted_subjects: string[] }> {
    const res = await apiClient.post<{ message: string; deleted_count: number; deleted_subjects: string[] }>(
      "/calendar/subjects/cleanup-holidays"
    );
    return res.data;
  },

  async clearAll(): Promise<void> {
    await apiClient.delete("/calendar/clear-all");
  },
};
