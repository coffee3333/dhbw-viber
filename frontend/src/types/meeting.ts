export interface ActionItem {
  id: string;
  task: string;
  assignee?: string | null;
  due_date?: string | null;
  status: string;
  priority: string;
  google_task_id?: string | null;
}

export interface TranscriptSegment {
  id: string;
  speaker?: string | null;
  start_time: number;
  end_time: number;
  text: string;
}

export interface Meeting {
  id: string;
  lecture_id?: string | null;
  title: string;
  status: "pending" | "processing" | "completed" | "failed";
  media_type: "audio" | "video";
  audio_path?: string | null;
  duration_seconds?: number | null;
  summary_short?: string | null;
  summary_full?: string | null;
  key_points?: string[] | null;
  topics?: Array<{ topic: string; summary: string }> | null;
  google_drive_file_id?: string | null;
  created_at: string;
  action_items?: ActionItem[];
  transcript_segments?: TranscriptSegment[];
}

export interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  sources?: string[];
}
