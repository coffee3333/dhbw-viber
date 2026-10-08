export interface Subject {
  id: string;
  name: string;
  code?: string | null;
  lecturer?: string | null;
  color: string;
  semester?: string | null;
  lectures_count: number;
}

export interface CreateSubjectPayload {
  name: string;
  code?: string | null;
  lecturer?: string | null;
  color?: string;
  semester?: string | null;
}

export interface UpdateSubjectPayload {
  name?: string;
  code?: string | null;
  lecturer?: string | null;
  color?: string;
  semester?: string | null;
}

export interface Lecture {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    subject_id?: string;
    subject_name?: string;
    lecturer?: string | null;
    room?: string | null;
    meeting_link?: string | null;
    description?: string | null;
    has_recording: boolean;
    recording_id?: string | null;
    recording_status?: string | null;
    media_type?: string | null;
    action_items_count: number;
    assigned_tasks?: Array<{ id: number; task: string; completed: boolean; priority: string; deadline?: string | null }>;
    incoming_tasks_count?: number;
    incoming_tasks?: Array<{
      id: number;
      task: string;
      completed: boolean;
      priority: string;
      deadline?: string | null;
      from_lecture_title?: string;
      from_lecture_id?: string;
    }>;
    has_tasks?: boolean;
  };
}

export interface CalendarSource {
  id: number;
  name: string;
  url?: string | null;
  file_path?: string | null;
  last_synced?: string | null;
  auto_sync: boolean;
  sync_interval_hours: number;
}

export interface SyncUrlPayload {
  url: string;
  name?: string;
}

export interface SyncResponse {
  message: string;
  subjects_created: number;
  total_subjects: number;
  lectures_synced: number;
}

export interface LectureMaterial {
  id: string;
  title: string;
  type: "pdf" | "link" | "file" | "note" | "presentation" | "summary_md" | string;
  url: string;
  filename?: string;
  has_text?: boolean;
  text_content?: string;
  created_at: string;
}

export interface LectureChainItem {
  id: string;
  sequence: number;
  title: string;
  start_time: string;
  end_time: string;
  room?: string | null;
  meeting_link?: string | null;
  description?: string | null;
  status: "scheduled" | "completed" | "postponed" | "canceled" | "happening_now" | "needs_summary" | string;
  has_recording: boolean;
  has_summary: boolean;
  has_materials: boolean;
  has_ai_context?: boolean;
  is_past: boolean;
  is_today: boolean;
  is_upcoming: boolean;
  is_happening_now?: boolean;
  recording_id?: string | null;
  notes_preview?: string | null;
  materials?: LectureMaterial[];
  chips?: string[];
}

export interface SubjectDetail {
  id: string;
  name: string;
  code?: string | null;
  lecturer?: string | null;
  color: string;
  semester?: string | null;
  stats: {
    total: number;
    completed: number;
    upcoming: number;
    postponed: number;
    canceled: number;
  };
  lectures: LectureChainItem[];
}

export interface LectureDetail {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  room?: string | null;
  meeting_link?: string | null;
  description?: string | null;
  status: "scheduled" | "completed" | "postponed" | "canceled";
  notes: string;
  materials: LectureMaterial[];
  ai_summary_override?: string | null;
  google_event_id?: string | null;
  subject?: {
    id: string;
    name: string;
    lecturer?: string | null;
    color: string;
  } | null;
  recording?: any;
  previous_lecture?: {
    id: string;
    title: string;
    start_time: string;
  } | null;
  next_lecture?: {
    id: string;
    title: string;
    start_time: string;
  } | null;
  incoming_tasks?: Array<{
    id: number;
    task: string;
    assignee?: string;
    priority?: string;
    deadline?: string | null;
    completed: boolean;
    from_lecture_id?: string;
    from_lecture_title?: string;
  }>;
  assigned_tasks?: Array<{
    id: number;
    task: string;
    assignee?: string;
    priority?: string;
    deadline?: string | null;
    completed: boolean;
  }>;
}

export interface GrillQuestion {
  question: string;
  difficulty: string;
  topic: string;
  hints: string[];
  model_answer_points: string[];
  question_type: string;
  options: string[];
  context_sources_used?: boolean;
}

export interface GrillEvaluation {
  score: number;
  feedback: string;
  strengths: string[];
  missing_or_incorrect: string[];
  model_answer: string;
  follow_up_question: string;
}
