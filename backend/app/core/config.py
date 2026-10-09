import contextlib
import json
import logging
import os
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("meeting_agent.config")

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
RECORDINGS_DIR = DATA_DIR / "recordings"
MATERIALS_DIR = DATA_DIR / "materials"
LOGS_DIR = DATA_DIR / "logs"
CONFIG_FILE = DATA_DIR / "config.json"

RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
MATERIALS_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

def get_persistent_secret() -> str:
    secret_path = DATA_DIR / ".secret_key"
    if secret_path.exists():
        try:
            val = secret_path.read_text(encoding="utf-8").strip()
            if val:
                return val
        except (OSError, UnicodeDecodeError):
            pass
    val = secrets.token_urlsafe(32)
    with contextlib.suppress(OSError):
        secret_path.write_text(val, encoding="utf-8")
        with contextlib.suppress(OSError):
            secret_path.chmod(0o600)
    return val

class Settings(BaseSettings):
    # App Information
    app_name: str = "MeetingAgent AI"
    app_version: str = "0.2.0"
    debug: bool = False
    log_level: str = "INFO"
    host: str = "127.0.0.1"
    port: int = 8000

    # Security & Production Settings
    secret_key: str = ""
    encryption_master_key: str | None = None
    app_password: str | None = None  # Single-user master password (if set, auth is enforced)
    session_cookie_name: str = "meeting_session"
    session_expire_days: int = 14
    allowed_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000,https://dhbw-viber.atai.site"  # Comma-separated list of origins for CORS in production
    max_upload_size_mb: int = 1000


    # Database
    database_url: str = f"sqlite:///{DATA_DIR / 'meetings.db'}"

    # AI Providers ("gemini", "openai", "local_whisper")
    transcription_engine: str = "gemini"
    summarization_engine: str = "gemini"

    # Model specifications
    gemini_model: str = "gemini-2.5-flash"
    openai_model: str = "gpt-4o"
    whisper_local_model: str = "base"

    # API Keys
    gemini_api_key: str | None = None
    openai_api_key: str | None = None

    # Google Workspace OAuth & Sync Settings
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/api/v1/google/oauth2callback"
    google_auto_sync_calendar: bool = False
    google_auto_sync_tasks: bool = True
    google_auto_sync_drive: bool = False

    # Processing Preferences
    audio_language: str = "auto"
    summary_detail: str = "standard"

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def cors_origins(self) -> list[str]:
        if self.allowed_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


def get_settings() -> Settings:
    settings = Settings()
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                saved = json.load(f)
                for k, v in saved.items():
                    if hasattr(settings, k) and v is not None:
                        setattr(settings, k, v)
        except Exception as e:
            logger.warning(f"Could not read config.json: {e}")

    # Fallbacks from environment variables
    for key, env_var in [
        ("gemini_api_key", "GEMINI_API_KEY"),
        ("openai_api_key", "OPENAI_API_KEY"),
        ("google_client_id", "GOOGLE_CLIENT_ID"),
        ("google_client_secret", "GOOGLE_CLIENT_SECRET"),
        ("secret_key", "SECRET_KEY"),
        ("encryption_master_key", "ENCRYPTION_MASTER_KEY"),
        ("app_password", "APP_PASSWORD"),
    ]:
        val = os.environ.get(env_var)
        if val:
            setattr(settings, key, val)

    if not settings.secret_key:
        settings.secret_key = get_persistent_secret()

    return settings



def save_user_settings(updated_data: dict) -> None:
    current = {}
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, encoding="utf-8") as f:
                current = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning(f"Could not load existing config.json: {e}")

    current.update({k: v for k, v in updated_data.items() if v is not None})
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2)
