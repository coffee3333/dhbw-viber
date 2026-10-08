import { apiClient } from "./client";
import type { GrillQuestion, GrillEvaluation } from "../types/calendar";

export interface GrillMeParams {
  subject_id?: string;
  lecture_id?: string;
  topic_focus?: string;
  difficulty?: string;
}

export interface EvaluateParams {
  subject_id?: string;
  lecture_id?: string;
  question: string;
  student_answer: string;
}

export interface SearchParams {
  query: string;
  subject_id?: string;
  lecture_id?: string;
  limit?: number;
}

export const ragApi = {
  async grillMe(params: GrillMeParams): Promise<GrillQuestion> {
    const res = await apiClient.post<GrillQuestion>("/rag/grill-me", params);
    return res.data;
  },

  async evaluate(params: EvaluateParams): Promise<GrillEvaluation> {
    const res = await apiClient.post<GrillEvaluation>("/rag/evaluate", params);
    return res.data;
  },

  async search(params: SearchParams): Promise<{ results: any[]; count: number }> {
    const res = await apiClient.post<{ results: any[]; count: number }>("/rag/search", params);
    return res.data;
  },

  async syncAll(): Promise<{ message: string; lectures_indexed: number; chunks_created: number }> {
    const res = await apiClient.post<{ message: string; lectures_indexed: number; chunks_created: number }>("/rag/sync");
    return res.data;
  },

  async getStats(): Promise<{ total_chunks: number; is_indexed: boolean }> {
    const res = await apiClient.get<{ total_chunks: number; is_indexed: boolean }>("/rag/stats");
    return res.data;
  },
};
