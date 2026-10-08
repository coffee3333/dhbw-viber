import json
from pathlib import Path

from app.core.logger import get_logger
from app.models.schemas import TranscriptSegmentSchema
from app.services.audio import convert_to_mp3, convert_to_wav, format_timestamp

logger = get_logger("meeting_agent.transcription")

# Global cache for local whisper model
_local_whisper_cache = {}

def get_local_whisper_model(model_size: str = "base"):
    if model_size not in _local_whisper_cache:
        from faster_whisper import WhisperModel
        logger.info(f"Loading local faster-whisper model: {model_size} on CPU...")
        _local_whisper_cache[model_size] = WhisperModel(model_size, device="cpu", compute_type="int8")
    return _local_whisper_cache[model_size]


def transcribe_with_local_whisper(
    audio_path: Path,
    model_size: str = "base",
    language: str = "auto"
) -> tuple[list[TranscriptSegmentSchema], str, str]:
    """Transcribe audio locally using faster-whisper (100% offline)."""
    wav_path = audio_path if audio_path.suffix.lower() == ".wav" else convert_to_wav(audio_path)
    model = get_local_whisper_model(model_size)
    lang_param = None if language in ("auto", "", None) else language

    segments_iter, info = model.transcribe(
        str(wav_path),
        language=lang_param,
        beam_size=5,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500}
    )

    detected_language = info.language
    segments: list[TranscriptSegmentSchema] = []
    full_text_parts = []

    for seg in segments_iter:
        text = seg.text.strip()
        if not text:
            continue
        segments.append(TranscriptSegmentSchema(
            start=round(seg.start, 2),
            end=round(seg.end, 2),
            speaker="Speaker",
            text=text
        ))
        full_text_parts.append(f"[{format_timestamp(seg.start)}] {text}")

    full_text = "\n".join(full_text_parts)
    return segments, full_text, detected_language


def transcribe_with_gemini(
    audio_path: Path,
    api_key: str,
    model_name: str = "gemini-flash-latest",
    language: str = "auto"
) -> tuple[list[TranscriptSegmentSchema], str, str]:
    """Transcribe audio using Google Gemini multimodal audio."""
    from google import genai
    from google.genai import types

    mp3_path = convert_to_mp3(audio_path)
    client = genai.Client(api_key=api_key)

    uploaded_file = client.files.upload(file=str(mp3_path))
    prompt = f"""You are a professional audio transcriber and diarizer.
Transcribe this entire audio file verbatim, identifying speaker turns and timestamps.
{"Target language: " + language if language != "auto" else "Detect the spoken language automatically."}

Return a valid JSON object strictly matching this schema:
{{
  "language": "detected language code",
  "segments": [
    {{
      "start": 0.0,
      "end": 8.5,
      "speaker": "Speaker 1 (or name if known)",
      "text": "Exact words..."
    }}
  ],
  "full_text": "[00:00] Speaker 1: Exact words..."
}}

Output only the raw JSON, no markdown code fence."""

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=[uploaded_file, prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        data = json.loads(response.text.strip())
        segments = []
        for s in data.get("segments", []):
            segments.append(TranscriptSegmentSchema(
                start=float(s.get("start", 0.0)),
                end=float(s.get("end", 0.0)),
                speaker=s.get("speaker", "Speaker"),
                text=s.get("text", "")
            ))
        full_text = data.get("full_text", "")
        if not full_text:
            full_text = "\n".join([f"[{format_timestamp(s.start)}] {s.speaker}: {s.text}" for s in segments])
        return segments, full_text, data.get("language", "en")
    finally:
        try:
            client.files.delete(name=uploaded_file.name)
        except Exception as e:
            logger.warning(f"Failed to delete uploaded Gemini file {uploaded_file.name}: {e}")


def transcribe_with_openai(
    audio_path: Path,
    api_key: str,
    language: str = "auto"
) -> tuple[list[TranscriptSegmentSchema], str, str]:
    """Transcribe audio using OpenAI Whisper API."""
    from openai import OpenAI

    mp3_path = convert_to_mp3(audio_path)
    client = OpenAI(api_key=api_key)

    kwargs = {
        "model": "whisper-1",
        "response_format": "verbose_json",
        "timestamp_granularities": ["segment"]
    }
    if language and language != "auto":
        kwargs["language"] = language

    with open(mp3_path, "rb") as f:
        response = client.audio.transcriptions.create(file=f, **kwargs)

    segments: list[TranscriptSegmentSchema] = []
    full_text_parts = []
    raw_segments = getattr(response, "segments", []) or []

    for s in raw_segments:
        start = getattr(s, "start", 0.0) if hasattr(s, "start") else s.get("start", 0.0)
        end = getattr(s, "end", 0.0) if hasattr(s, "end") else s.get("end", 0.0)
        text = getattr(s, "text", "").strip() if hasattr(s, "text") else s.get("text", "").strip()

        segments.append(TranscriptSegmentSchema(
            start=round(float(start), 2),
            end=round(float(end), 2),
            speaker="Speaker",
            text=text
        ))
        full_text_parts.append(f"[{format_timestamp(start)}] {text}")

    full_text = "\n".join(full_text_parts) if full_text_parts else (getattr(response, "text", "") or "")
    detected_lang = getattr(response, "language", "en") or "en"
    return segments, full_text, detected_lang


def transcribe_audio(
    file_path: Path,
    engine: str = "gemini",
    api_key: str | None = None,
    gemini_model: str = "gemini-flash-latest",
    whisper_local_model: str = "base",
    language: str = "auto"
) -> tuple[list[TranscriptSegmentSchema], str, str]:
    """Unified transcription dispatcher."""
    if engine == "gemini":
        if not api_key:
            raise ValueError("Gemini API key is required. Set it in Settings or GEMINI_API_KEY environment variable.")
        return transcribe_with_gemini(file_path, api_key=api_key, model_name=gemini_model, language=language)
    elif engine == "openai":
        if not api_key:
            raise ValueError("OpenAI API key is required. Set it in Settings or OPENAI_API_KEY environment variable.")
        return transcribe_with_openai(file_path, api_key=api_key, language=language)
    elif engine == "local_whisper":
        return transcribe_with_local_whisper(file_path, model_size=whisper_local_model, language=language)
    else:
        raise ValueError(f"Unknown transcription engine: {engine}")
