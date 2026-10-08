export interface ActionItemWithContext {
  id: number;
  meeting_id: string;
  task: string;
  assignee?: string | null;
  priority?: string | null;
  deadline?: string | null;
  due_date?: string | null;
  completed: boolean;
  google_task_id?: string | null;
  lecture_title?: string | null;
  subject_name?: string | null;
  subject_color?: string | null;
}

export interface GoogleRemoteTask {
  id: string;
  title: string;
  notes?: string | null;
  due?: string | null;
  status: "needsAction" | "completed";
  updated?: string;
}

export interface CreateTaskPayload {
  task: string;
  meeting_id?: string;
  priority?: string;
  deadline?: string;
  due_date?: string;
  subject_name?: string;
  assignee?: string;
}
