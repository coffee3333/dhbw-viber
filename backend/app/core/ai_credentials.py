"""
AI Credentials Resolver (BYOK - Bring Your Own Key Architecture).
Resolves API keys and model preferences:
1. User-specific custom credentials (encrypted in DB) take highest precedence.
2. Global system settings (environment variables / config.json) serve as fallback.
"""
from dataclasses import dataclass
from typing import Any

from app.core.config import get_settings
from app.core.crypto import decrypt_secret
from app.models.user import UserDB


@dataclass
class ResolvedAIConfig:
    summarization_engine: str
    transcription_engine: str
    summarization_api_key: str | None
    summarization_model: str
    transcription_api_key: str | None
    transcription_model: str
    has_custom_keys: bool


def normalize_gemini_model(model: str | None) -> str:
    if not model:
        return "gemini-flash-lite-latest"
    m = model.strip()
    if m.startswith("models/"):
        m = m[7:]
    m_lower = m.lower()

    # Match Lite models (super cheap & eco)
    if "lite" in m_lower or m_lower in (
        "gemini-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-2.0-flash-lite",
        "gemini-2.0-flash-lite-preview",
        "gemini-2.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash-lite",
        "gemini-3.8-flash-lite",
    ):
        return "gemini-flash-lite-latest"

    # Match Pro models
    if "pro" in m_lower:
        return "gemini-pro-latest"

    # Match standard Flash models
    if "flash" in m_lower:
        return "gemini-flash-latest"

    return m



def resolve_user_ai_config(user: UserDB | None = None) -> ResolvedAIConfig:
    """
    Resolve effective AI engines, keys, and model parameters for the given user.
    Falls back gracefully to system settings if the user has not configured personal credentials.
    """
    settings = get_settings()
    creds = getattr(user, "credentials", None) if user else None

    # Determine engines
    summarization_engine = (
        (creds.summarization_engine if creds and creds.summarization_engine else None)
        or settings.summarization_engine
        or "gemini"
    )
    transcription_engine = (
        (creds.transcription_engine if creds and creds.transcription_engine else None)
        or settings.transcription_engine
        or "gemini"
    )

    # Decrypt personal user keys
    user_gemini_key = (
        decrypt_secret(creds.gemini_api_key_encrypted)
        if (creds and creds.gemini_api_key_encrypted)
        else None
    )
    user_openai_key = (
        decrypt_secret(creds.openai_api_key_encrypted)
        if (creds and creds.openai_api_key_encrypted)
        else None
    )

    # Model names
    gemini_model = normalize_gemini_model(
        (creds.gemini_model if creds and creds.gemini_model else None)
        or settings.gemini_model
    )

    openai_model = (
        (creds.openai_model if creds and creds.openai_model else None)
        or settings.openai_model
        or "gpt-4o"
    )

    # Resolve summarization key & model
    if summarization_engine == "gemini":
        summarization_key = user_gemini_key or settings.gemini_api_key
        summarization_model = gemini_model
    elif summarization_engine == "openai":
        summarization_key = user_openai_key or settings.openai_api_key
        summarization_model = openai_model
    else:
        summarization_key = user_gemini_key or settings.gemini_api_key
        summarization_model = gemini_model

    # Resolve transcription key & model
    if transcription_engine == "gemini":
        transcription_key = user_gemini_key or settings.gemini_api_key
        transcription_model = gemini_model
    elif transcription_engine == "openai":
        transcription_key = user_openai_key or settings.openai_api_key
        transcription_model = openai_model
    else:  # local_whisper
        transcription_key = None
        transcription_model = getattr(settings, "whisper_local_model", "base")

    has_custom = bool(user_gemini_key or user_openai_key)

    return ResolvedAIConfig(
        summarization_engine=summarization_engine,
        transcription_engine=transcription_engine,
        summarization_api_key=summarization_key,
        summarization_model=summarization_model,
        transcription_api_key=transcription_key,
        transcription_model=transcription_model,
        has_custom_keys=has_custom,
    )
