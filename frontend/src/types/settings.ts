export interface AppSettings {
  app_name: string;
  app_version: string;
  transcription_engine: "gemini" | "local_whisper" | "openai";
  summarization_engine: "gemini" | "openai";
  gemini_model: string;
  openai_model: string;
  has_gemini_key: boolean;
  has_openai_key: boolean;
  has_google_client_id?: boolean;
  has_google_secret?: boolean;
  gemini_api_key?: string;
  openai_api_key?: string;
  google_client_id?: string;
  google_client_secret?: string;
  allowed_origins: string;
  google_auto_sync_calendar: boolean;
  google_auto_sync_tasks: boolean;
  google_auto_sync_drive: boolean;
}

export interface GoogleStatus {
  connected: boolean;
  email?: string | null;
  has_credentials: boolean;
  auto_sync_calendar: boolean;
  auto_sync_tasks: boolean;
  auto_sync_drive: boolean;
}
