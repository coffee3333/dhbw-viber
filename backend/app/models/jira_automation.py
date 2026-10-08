import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.types import TypeDecorator

from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


def gen_uuid() -> str:
    return str(uuid.uuid4())


class JSONText(TypeDecorator):
    """Custom SQLAlchemy type decorator for JSON stored as Text in DB."""
    impl = Text

    def process_bind_param(self, value: Any, dialect: Any) -> str | None:
        if value is None:
            return None
        return json.dumps(value)

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        try:
            return json.loads(value)
        except Exception:
            return None


class AutomationProjectDB(Base):
    __tablename__ = "automation_projects"

    id = Column(String(64), primary_key=True, default=gen_uuid, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Jira settings
    jira_domain = Column(String(255), nullable=True)  # e.g. company.atlassian.net
    jira_email = Column(String(255), nullable=True)
    jira_api_token_encrypted = Column(Text, nullable=True)
    jira_project_key = Column(String(50), nullable=True)  # e.g. KAN, TES
    jira_board_id = Column(Integer, nullable=True)

    # Git repository settings
    source_repo_backend = Column(String(255), nullable=True)
    source_repo_frontend = Column(String(255), nullable=True)
    target_repo_backend = Column(String(255), nullable=True)
    target_repo_frontend = Column(String(255), nullable=True)

    # Custom fields mapping (JSON: { "story_points": "customfield_10016", ... })
    custom_fields_map = Column(JSONText, nullable=True)

    # Team Telegram channel/group
    telegram_bot_token_encrypted = Column(Text, nullable=True)
    telegram_channel_chat_id = Column(String(64), nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    # Relationships
    members = relationship(
        "ProjectMemberDB",
        back_populates="project",
        cascade="all, delete-orphan"
    )
    sprints = relationship(
        "AutomationSprintDB",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="AutomationSprintDB.start_date"
    )


class ProjectMemberDB(Base):
    __tablename__ = "project_members"

    id = Column(String(64), primary_key=True, default=gen_uuid, index=True)
    project_id = Column(String(64), ForeignKey("automation_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role_in_project = Column(String(50), default="developer")  # lead, developer, tester

    # Relationships
    project = relationship("AutomationProjectDB", back_populates="members")
    user = relationship("UserDB", back_populates="project_memberships")


class AutomationSprintDB(Base):
    __tablename__ = "automation_sprints"

    id = Column(String(64), primary_key=True, default=gen_uuid, index=True)
    project_id = Column(String(64), ForeignKey("automation_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    jira_sprint_id = Column(Integer, nullable=True)
    board_id = Column(Integer, nullable=True)
    started = Column(Boolean, default=False)
    closed = Column(Boolean, default=False)
    from_jira = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utc_now)

    # Relationships
    project = relationship("AutomationProjectDB", back_populates="sprints")
    tasks = relationship(
        "AutomationTaskDB",
        back_populates="sprint",
        cascade="all, delete-orphan"
    )


class AutomationTaskDB(Base):
    __tablename__ = "automation_tasks"

    id = Column(String(64), primary_key=True, default=gen_uuid, index=True)
    sprint_id = Column(String(64), ForeignKey("automation_sprints.id", ondelete="CASCADE"), nullable=False, index=True)
    assignee_id = Column(String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    title = Column(String(255), nullable=False)
    description = Column(Text, default="")
    priority = Column(String(50), default="Medium")
    issue_type = Column(String(50), default="Task")
    jira_issue_key = Column(String(50), nullable=True, index=True)
    created = Column(Boolean, default=False)
    current_status = Column(String(50), default="To Do")

    create_at = Column(DateTime, nullable=True)
    start_date = Column(DateTime, nullable=True)
    due_date = Column(DateTime, nullable=True)
    story_points = Column(Float, nullable=True)
    original_estimate = Column(String(50), nullable=True)
    time_spent = Column(String(50), nullable=True)

    # Git config: { "repo": "backend" | "frontend", "reference_commit": "abc1234" }
    git_config = Column(JSONText, nullable=True)
    custom_fields = Column(JSONText, nullable=True)
    google_task_id = Column(String(255), nullable=True, index=True)
    from_jira = Column(Boolean, default=False)

    # Relationships
    sprint = relationship("AutomationSprintDB", back_populates="tasks")
    assignee = relationship("UserDB")
    moves = relationship(
        "TaskStatusMoveDB",
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="TaskStatusMoveDB.move_at"
    )


class TaskStatusMoveDB(Base):
    __tablename__ = "task_status_moves"

    id = Column(String(64), primary_key=True, default=gen_uuid, index=True)
    task_id = Column(String(64), ForeignKey("automation_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), nullable=False)
    from_status = Column(String(50), nullable=True)
    move_at = Column(DateTime, nullable=False)
    done = Column(Boolean, default=False)
    executed_at = Column(DateTime, nullable=True)

    # Relationships
    task = relationship("AutomationTaskDB", back_populates="moves")
