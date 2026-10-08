from fastapi import APIRouter, Depends

from app.agents.templates import TEMPLATE_REGISTRY
from app.core.config import get_settings, save_user_settings
from app.core.security import require_admin
from app.models.schemas import SettingsUpdateSchema

router = APIRouter(prefix="/settings", tags=["settings"])

@router.get("", dependencies=[Depends(require_admin)])
@router.get("/", dependencies=[Depends(require_admin)])
def read_settings():
    s = get_settings()
    gemini_masked = f"...{s.gemini_api_key[-4:]}" if s.gemini_api_key and len(s.gemini_api_key) > 4 else ("Set" if s.gemini_api_key else "")
    openai_masked = f"...{s.openai_api_key[-4:]}" if s.openai_api_key and len(s.openai_api_key) > 4 else ("Set" if s.openai_api_key else "")
    google_id_masked = f"...{s.google_client_id[-8:]}" if s.google_client_id and len(s.google_client_id) > 8 else ("Set" if s.google_client_id else "")
    google_secret_masked = "Set" if s.google_client_secret else ""

    return {
        "transcription_engine": s.transcription_engine,
        "summarization_engine": s.summarization_engine,
        "gemini_model": s.gemini_model,
        "openai_model": s.openai_model,
        "whisper_local_model": s.whisper_local_model,
        "gemini_api_key_masked": gemini_masked,
        "has_gemini_key": bool(s.gemini_api_key),
        "openai_api_key_masked": openai_masked,
        "has_openai_key": bool(s.openai_api_key),
        "google_client_id_masked": google_id_masked,
        "google_secret_masked": google_secret_masked,
        "has_google_client_id": bool(s.google_client_id),
        "has_google_secret": bool(s.google_client_secret),
        "google_auto_sync_calendar": s.google_auto_sync_calendar,
        "google_auto_sync_tasks": s.google_auto_sync_tasks,
        "google_auto_sync_drive": s.google_auto_sync_drive,
        "audio_language": s.audio_language,
        "summary_detail": s.summary_detail,
        "allowed_origins": s.allowed_origins
    }


@router.post("", dependencies=[Depends(require_admin)])
@router.post("/", dependencies=[Depends(require_admin)])
@router.put("", dependencies=[Depends(require_admin)])
@router.put("/", dependencies=[Depends(require_admin)])
def update_settings(payload: SettingsUpdateSchema):
    save_user_settings(payload.model_dump(exclude_none=True))
    return read_settings()


@router.get("/templates")
def get_templates():
    return TEMPLATE_REGISTRY
