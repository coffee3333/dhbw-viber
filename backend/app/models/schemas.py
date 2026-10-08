from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

# ----------------- Action Items & Transcripts -----------------

class ActionItemSchema(BaseModel):
    id: int | None = None
    task: str
    assignee: str | None = "Unassigned"
    priority: str | None = "Medium"
    deadline: str | None = None
    completed: bool = False

    model_config = {"from_attributes": True}


class TranscriptSegmentSchema(BaseModel):
    id: int | None = None
    start: float
    end: float
    speaker: str | None = "Speaker"
    text: str

    model_config = {"from_attributes": True}


# ----------------- Summaries & Meetings -----------------

class MeetingSummarySchema(BaseModel):
    title: str | None = None
    overview: str = ""
    executive_summary: str = ""
    key_points: list[str] = Field(default_factory=list)
    decisions: list[str] = Field(default_factory=list)
    action_items: list[ActionItemSchema] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    markdown_content: str = ""


class MeetingResponseSchema(BaseModel):
    id: str
    lecture_id: str | None = None
    title: str
    platform: str
    created_at: datetime | None = None
    duration_seconds: float = 0.0
    audio_filename: str | None = None
    video_filename: str | None = None
    media_type: str = "audio"
    status: str
    error_message: str | None = None
    language: str | None = "en"
    template_used: str = "standard"

    # Transcripts & Summary
    full_text: str = ""
    summary: MeetingSummarySchema | None = None
    transcript: list[TranscriptSegmentSchema] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class MeetingListItemSchema(BaseModel):
    id: str
    lecture_id: str | None = None
    title: str
    platform: str
    created_at: datetime | None = None
    duration_seconds: float = 0.0
    media_type: str = "audio"
    status: str
    action_items_count: int = 0
    has_summary: bool = False
    transcript_preview: str = ""

    model_config = {"from_attributes": True}


# ----------------- DHBW Subjects & Lectures -----------------

class SubjectSchema(BaseModel):
    id: str
    name: str
    code: str | None = None
    lecturer: str | None = None
    color: str = "#4f46e5"
    semester: str | None = None
    lectures_count: int | None = 0

    model_config = {"from_attributes": True}


class SubjectCreateSchema(BaseModel):
    name: str
    code: str | None = None
    lecturer: str | None = None
    color: str | None = "#4f46e5"
    semester: str | None = None


class SubjectUpdateSchema(BaseModel):
    name: str | None = None
    code: str | None = None
    lecturer: str | None = None
    color: str | None = None
    semester: str | None = None


class LectureCreateSchema(BaseModel):
    subject_id: str
    title: str
    start_time: datetime
    end_time: datetime
    room: str | None = None
    meeting_link: str | None = None
    description: str | None = None
    status: str | None = "scheduled"


class LectureUpdateSchema(BaseModel):
    title: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    room: str | None = None
    meeting_link: str | None = None
    description: str | None = None
    status: str | None = None


class LectureSchema(BaseModel):
    id: str
    subject_id: str
    external_uid: str | None = None
    title: str
    start_time: datetime
    end_time: datetime
    room: str | None = None
    meeting_link: str | None = None
    description: str | None = None

    # Linked recording info
    has_recording: bool = False
    recording_id: str | None = None
    recording_status: str | None = None
    media_type: str | None = None
    action_items_count: int = 0

    # Subject details for calendar display
    subject_name: str | None = None
    subject_color: str | None = None
    subject_lecturer: str | None = None

    model_config = {"from_attributes": True}


class LectureChainItemSchema(BaseModel):
    id: str
    sequence: int
    title: str
    start_time: str
    end_time: str
    room: str | None = None
    meeting_link: str | None = None
    description: str | None = None
    status: str = "scheduled"  # scheduled, completed, postponed, canceled, happening_now, needs_summary
    has_recording: bool = False
    has_summary: bool = False
    has_materials: bool = False
    has_ai_context: bool = False
    is_past: bool = False
    is_today: bool = False
    is_upcoming: bool = False
    is_happening_now: bool = False
    recording_id: str | None = None
    notes_preview: str | None = None
    materials: list[dict[str, Any]] = Field(default_factory=list)
    chips: list[str] = Field(default_factory=list)
    incoming_tasks_count: int = 0
    assigned_tasks_count: int = 0


class SubjectDetailSchema(BaseModel):
    id: str
    name: str
    code: str | None = None
    lecturer: str | None = None
    color: str = "#4f46e5"
    semester: str | None = None
    stats: dict = Field(default_factory=dict)
    lectures: list[LectureChainItemSchema] = Field(default_factory=list)


class LectureStatusUpdate(BaseModel):
    status: str  # scheduled, completed, postponed, canceled


class LectureNotesUpdate(BaseModel):
    notes: str


class LectureMaterialCreate(BaseModel):
    title: str
    type: str | None = "link"  # pdf, link, file, note
    url: str


class CalendarSourceSchema(BaseModel):
    id: int
    name: str
    url: str | None = None
    last_synced: datetime | None = None
    auto_sync: bool = True
    sync_interval_hours: int = 6

    model_config = {"from_attributes": True}


class CalendarSyncRequestSchema(BaseModel):
    url: str | None = None  # Rapla / iCal webcal URL
    name: str | None = "DHBW Timetable"


# ----------------- Settings & Chat -----------------

class SettingsUpdateSchema(BaseModel):
    transcription_engine: str | None = None
    summarization_engine: str | None = None
    gemini_model: str | None = None
    openai_model: str | None = None
    whisper_local_model: str | None = None
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_auto_sync_calendar: bool | None = None
    google_auto_sync_tasks: bool | None = None
    google_auto_sync_drive: bool | None = None
    audio_language: str | None = None
    summary_detail: str | None = None
    allowed_origins: list[str] | str | None = None


class ChatRequestSchema(BaseModel):
    question: str


class ChatResponseSchema(BaseModel):
    answer: str
