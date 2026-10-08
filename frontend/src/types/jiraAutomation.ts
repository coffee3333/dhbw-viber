export interface TaskStatusMove {
  id: string;
  task_id: string;
  status: string;
  from_status?: string | null;
  move_at: string;
  done: boolean;
  executed_at?: string | null;
}

export interface AutomationTask {
  id: string;
  sprint_id: string;
  assignee_id?: string | null;
  assignee_name?: string | null;
  title: string;
  description: string;
  priority: string;
  issue_type: string;
  jira_issue_key?: string | null;
  created: boolean;
  current_status: string;
  create_at?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  story_points?: number | null;
  original_estimate?: string | null;
  time_spent?: string | null;
  git_config?: {
    repo?: "backend" | "frontend";
    reference_commit?: string;
  } | null;
  custom_fields?: Record<string, any> | null;
  from_jira?: boolean;
  moves: TaskStatusMove[];
}

export interface AutomationSprint {
  id: string;
  project_id: string;
  name: string;
  start_date: string;
  end_date: string;
  jira_sprint_id?: number | null;
  board_id?: number | null;
  started: boolean;
  closed: boolean;
  from_jira: boolean;
  created_at?: string | null;
  tasks_count: number;
  completed_tasks_count: number;
  tasks?: AutomationTask[];
}

export interface ProjectMember {
  id: string;
  user_id: string;
  username?: string;
  email?: string;
  display_name: string;
  role: string;
  role_in_project: string;
  jira_account_id?: string | null;
  git_author_name?: string | null;
  git_author_email?: string | null;
  has_github_token: boolean;
  telegram_chat_id?: string | null;
}

export interface AutomationProject {
  id: string;
  name: string;
  description?: string | null;
  jira_domain?: string | null;
  jira_email?: string | null;
  jira_api_token_masked?: string | null;
  has_jira_token: boolean;
  jira_project_key?: string | null;
  jira_board_id?: number | null;
  source_repo_backend?: string | null;
  source_repo_frontend?: string | null;
  target_repo_backend?: string | null;
  target_repo_frontend?: string | null;
  custom_fields_map?: Record<string, any> | null;
  has_telegram_token: boolean;
  telegram_channel_chat_id?: string | null;
  is_active: boolean;
  created_at?: string | null;
  member_count: number;
  sprint_count: number;
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  jira_domain?: string;
  jira_email?: string;
  jira_api_token?: string;
  jira_project_key?: string;
  jira_board_id?: number;
  source_repo_backend?: string;
  source_repo_frontend?: string;
  target_repo_backend?: string;
  target_repo_frontend?: string;
  custom_fields_map?: Record<string, any>;
  telegram_bot_token?: string;
  telegram_channel_chat_id?: string;
  is_active?: boolean;
}

export interface CreateSprintPayload {
  name: string;
  start_date: string;
  end_date: string;
  board_id?: number;
  start_now?: boolean;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  priority?: string;
  issue_type?: string;
  assignee_id?: string;
  create_at?: string;
  start_date?: string;
  due_date?: string;
  story_points?: number;
  original_estimate?: string;
  time_spent?: string;
  git_config?: {
    repo?: "backend" | "frontend";
    reference_commit?: string;
  };
  custom_fields?: Record<string, any>;
  moves?: { status: string; move_at: string }[];
}

export interface JiraDiscoveredMember {
  account_id: string;
  display_name: string;
  email?: string;
  avatar_url?: string;
  active: boolean;
}

export interface JiraDiscoveredField {
  id: string;
  name: string;
  custom: boolean;
}

export interface JiraDiscoveredBoard {
  id: number;
  name: string;
  type: string;
  location?: {
    projectId?: number;
    displayName?: string;
    projectName?: string;
    projectKey?: string;
    projectTypeKey?: string;
    name?: string;
  };
  isPrivate?: boolean;
}

export interface DiscoveredProject {
  id: string;
  key: string;
  name: string;
}

export interface DiscoveredBoard {
  id: number;
  name: string;
  type: string;
  project_key?: string | null;
}

export interface TestCredentialsPayload {
  jira_domain: string;
  jira_email: string;
  jira_api_token: string;
}

export interface TestCredentialsResponse {
  status: string;
  displayName: string;
  projects: DiscoveredProject[];
  boards: DiscoveredBoard[];
}

export interface AgentGuideResponse {
  project_id: string | null;
  project_name: string | null;
  jira_project_key: string | null;
  jira_board_id: number | null;
  base_url: string;
  agents_md: string;
  claude_md: string;
}

