import json
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.types import TypeDecorator

from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


class SubjectDB(Base):
    __tablename__ = "subjects"

    id = Column(String(64), primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    code = Column(String(50), nullable=True)
    lecturer = Column(String(255), nullable=True)
    color = Column(String(50), default="#4f46e5")
    semester = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=utc_now)

    # Relationships
    lectures = relationship(
        "LectureDB",
        back_populates="subject",
        cascade="all, delete-orphan",
        order_by="LectureDB.start_time"
    )


class LectureDB(Base):
    __tablename__ = "lectures"

    id = Column(String(64), primary_key=True, index=True)
    subject_id = Column(String(64), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    external_uid = Column(String(255), nullable=True, index=True)  # iCal UID
    google_event_id = Column(String(255), nullable=True, index=True)  # Google Calendar Event ID
    title = Column(String(255), nullable=False)
    start_time = Column(DateTime, nullable=False, index=True)
    end_time = Column(DateTime, nullable=False, index=True)
    room = Column(String(255), nullable=True)
    meeting_link = Column(String(512), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="scheduled")  # scheduled, completed, postponed, canceled
    notes = Column(Text, default="")
    materials_json = Column(Text, default="[]")
    ai_summary_override = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    # Relationships
    subject = relationship("SubjectDB", back_populates="lectures")
    meetings = relationship(
        "MeetingDB",
        back_populates="lecture",
        cascade="all, delete-orphan",
        order_by=lambda: MeetingDB.created_at.desc()
    )

    @property
    def materials(self):
        try:
            return json.loads(self.materials_json or "[]")
        except (json.JSONDecodeError, TypeError, ValueError):
            return []

    @materials.setter
    def materials(self, val):
        self.materials_json = json.dumps(val or [])


class EmbeddingType(TypeDecorator):
    """
    Dual-compatible vector embedding column:
    - On PostgreSQL: maps to native pgvector Vector(768)
    - On SQLite: maps to JSON serialized text array of floats
    """
    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            try:
                from pgvector.sqlalchemy import Vector
                return dialect.type_descriptor(Vector(768))
            except (ImportError, Exception):
                return dialect.type_descriptor(Text())
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        if isinstance(value, (list, tuple)):
            return json.dumps(list(value))
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return list(value) if hasattr(value, "__iter__") else value
        if isinstance(value, str):
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError, ValueError):
                return []
        return value


class LectureKnowledgeChunkDB(Base):
    __tablename__ = "lecture_knowledge_chunks"

    id = Column(String(64), primary_key=True, index=True)
    subject_id = Column(String(64), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=True, index=True)
    lecture_id = Column(String(64), ForeignKey("lectures.id", ondelete="CASCADE"), nullable=True, index=True)
    source_type = Column(String(50), default="summary", index=True)  # summary, key_points, transcript, notes, material
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    metadata_json = Column(Text, default="{}")
    embedding = Column(EmbeddingType, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    # Relationships
    subject = relationship("SubjectDB")
    lecture = relationship("LectureDB")


class CalendarSourceDB(Base):
    __tablename__ = "calendar_sources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), default="DHBW Calendar")
    url = Column(Text, nullable=True)  # webcal:// or https:// Rapla iCal feed
    file_path = Column(String(255), nullable=True)  # If imported from uploaded .ics file
    last_synced = Column(DateTime, nullable=True)
    auto_sync = Column(Boolean, default=True)
    sync_interval_hours = Column(Integer, default=6)
    created_at = Column(DateTime, default=utc_now)


class MeetingDB(Base):
    __tablename__ = "meetings"

    id = Column(String(64), primary_key=True, index=True)
    lecture_id = Column(String(64), ForeignKey("lectures.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(255), default="Untitled Meeting")
    platform = Column(String(50), default="general")
    created_at = Column(DateTime, default=utc_now)
    duration_seconds = Column(Float, default=0.0)
    audio_filename = Column(String(255), nullable=True)
    video_filename = Column(String(255), nullable=True)
    media_type = Column(String(20), default="audio")
    status = Column(String(50), default="created")
    error_message = Column(Text, nullable=True)
    language = Column(String(20), default="en")
    template_used = Column(String(50), default="standard")

    # Google Drive Backup
    google_drive_folder_id = Column(String(255), nullable=True)
    google_drive_file_id = Column(String(255), nullable=True)

    # Transcripts & Summaries
    full_text = Column(Text, default="")
    overview = Column(Text, default="")
    executive_summary = Column(Text, default="")
    key_points_json = Column(Text, default="[]")
    decisions_json = Column(Text, default="[]")
    open_questions_json = Column(Text, default="[]")
    markdown_content = Column(Text, default="")

    # Relationships
    lecture = relationship("LectureDB", back_populates="meetings")
    action_items = relationship(
        "ActionItemDB",
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="ActionItemDB.id"
    )
    transcript_segments = relationship(
        "TranscriptSegmentDB",
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="TranscriptSegmentDB.start"
    )

    @property
    def key_points(self):
        try:
            return json.loads(self.key_points_json or "[]")
        except (json.JSONDecodeError, TypeError, ValueError):
            return []

    @key_points.setter
    def key_points(self, val):
        self.key_points_json = json.dumps(val or [])

    @property
    def decisions(self):
        try:
            return json.loads(self.decisions_json or "[]")
        except (json.JSONDecodeError, TypeError, ValueError):
            return []

    @decisions.setter
    def decisions(self, val):
        self.decisions_json = json.dumps(val or [])

    @property
    def open_questions(self):
        try:
            return json.loads(self.open_questions_json or "[]")
        except (json.JSONDecodeError, TypeError, ValueError):
            return []

    @open_questions.setter
    def open_questions(self, val):
        self.open_questions_json = json.dumps(val or [])


class ActionItemDB(Base):
    __tablename__ = "action_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(64), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    google_task_id = Column(String(255), nullable=True, index=True)  # Google Tasks ID
    task = Column(Text, nullable=False)
    assignee = Column(String(100), default="Unassigned")
    priority = Column(String(20), default="Medium")
    deadline = Column(String(100), nullable=True)
    due_date = Column(DateTime, nullable=True)
    completed = Column(Boolean, default=False)

    meeting = relationship("MeetingDB", back_populates="action_items")


class TranscriptSegmentDB(Base):
    __tablename__ = "transcript_segments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(String(64), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    start = Column(Float, nullable=False)
    end = Column(Float, nullable=False)
    speaker = Column(String(100), default="Speaker")
    text = Column(Text, nullable=False)

    meeting = relationship("MeetingDB", back_populates="transcript_segments")


class GoogleCredentialDB(Base):
    """Stores user's OAuth tokens securely."""
    __tablename__ = "google_credentials"

    user_id = Column(String(64), primary_key=True, default="default")
    email = Column(String(255), nullable=True)
    access_token = Column(Text, nullable=False)
    refresh_token = Column(Text, nullable=True)
    token_uri = Column(String(255), default="https://oauth2.googleapis.com/token")
    client_id = Column(String(255), nullable=True)
    client_secret = Column(String(255), nullable=True)
    scopes_json = Column(Text, default="[]")
    expiry = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    @property
    def scopes(self):
        try:
            return json.loads(self.scopes_json or "[]")
        except (json.JSONDecodeError, TypeError, ValueError):
            return []

    @scopes.setter
    def scopes(self, val):
        self.scopes_json = json.dumps(val or [])


class AgentCheckpointDB(Base):
    """
    Checkpointer table for agent workflows, LangGraph graph checkpoints,
    and conversational study state.
    """
    __tablename__ = "agent_checkpoints"

    id = Column(String(64), primary_key=True, index=True)
    thread_id = Column(String(128), index=True, nullable=False)
    checkpoint_id = Column(String(64), index=True, nullable=False)
    parent_checkpoint_id = Column(String(64), nullable=True, index=True)
    step = Column(Integer, default=0)
    agent_name = Column(String(100), default="grill_agent", index=True)
    state_json = Column(Text, nullable=False, default="{}")
    metadata_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=utc_now, index=True)

    @property
    def state(self):
        try:
            return json.loads(self.state_json or "{}")
        except (json.JSONDecodeError, TypeError, ValueError):
            return {}

    @state.setter
    def state(self, val):
        self.state_json = json.dumps(val or {})

    @property
    def metadata_dict(self):
        try:
            return json.loads(self.metadata_json or "{}")
        except (json.JSONDecodeError, TypeError, ValueError):
            return {}

    @metadata_dict.setter
    def metadata_dict(self, val):
        self.metadata_json = json.dumps(val or {})


# Re-export User and Jira Automation models so Alembic / init_db registers them
from app.models.user import UserDB, UserCredentialsDB
from app.models.jira_automation import (
    AutomationProjectDB,
    ProjectMemberDB,
    AutomationSprintDB,
    AutomationTaskDB,
    TaskStatusMoveDB,
)

