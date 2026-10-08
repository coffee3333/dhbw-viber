export interface UserProfile {
  id: string;
  username: string;
  email?: string | null;
  display_name: string;
  role: "admin" | "member";
  telegram_username?: string | null;
  telegram_chat_id?: string | null;
  telegram_connected?: boolean;
}

export interface UserCredentials {
  github_token_masked?: string | null;
  has_github_token: boolean;
  git_author_name?: string | null;
  git_author_email?: string | null;
  jira_account_id?: string | null;
  gemini_api_key_masked?: string | null;
  has_gemini_api_key?: boolean;
  gemini_model?: string | null;
  openai_api_key_masked?: string | null;
  has_openai_api_key?: boolean;
  openai_model?: string | null;
  transcription_engine?: string | null;
  summarization_engine?: string | null;
}

export interface UserProfileWithCredentials extends UserProfile {
  credentials?: UserCredentials;
}

export interface AuthStatus {
  auth_required: boolean;
  authenticated: boolean;
  user?: UserProfile | null;
}

export interface LoginPayload {
  username: string;
  password: string;
  email?: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: UserProfile;
  message: string;
}

export interface UserProfileUpdateRequest {
  display_name?: string;
  email?: string;
  telegram_username?: string;
  telegram_chat_id?: string;
}

export interface UserCredentialsUpdateRequest {
  github_token?: string;
  git_author_name?: string;
  git_author_email?: string;
  jira_account_id?: string;
  gemini_api_key?: string;
  gemini_model?: string;
  openai_api_key?: string;
  openai_model?: string;
  transcription_engine?: string;
  summarization_engine?: string;
}

export interface AdminCreateUserRequest {
  username: string;
  display_name?: string;
  password: string;
  role: "admin" | "member";
  email?: string;
}
