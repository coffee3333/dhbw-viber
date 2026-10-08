import uuid
from datetime import UTC, datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship
from app.core.database import Base
import app.models.jira_automation  # noqa: F401 - ensure ProjectMemberDB is registered


def utc_now() -> datetime:
    return datetime.now(UTC)


def gen_uuid() -> str:
    return str(uuid.uuid4())


class UserDB(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, default=gen_uuid, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    display_name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="member")  # "admin" or "member"
    telegram_chat_id = Column(String(50), nullable=True, index=True)
    telegram_username = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)

    # Relationships
    credentials = relationship(
        "UserCredentialsDB",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan"
    )
    project_memberships = relationship(
        "ProjectMemberDB",
        back_populates="user",
        cascade="all, delete-orphan"
    )


class UserCredentialsDB(Base):
    __tablename__ = "user_credentials"

    id = Column(String(64), primary_key=True, default=gen_uuid, index=True)
    user_id = Column(String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    github_token_encrypted = Column(Text, nullable=True)
    git_author_name = Column(String(100), nullable=True)
    git_author_email = Column(String(255), nullable=True)
    jira_account_id = Column(String(128), nullable=True, index=True)
    gemini_api_key_encrypted = Column(Text, nullable=True)
    gemini_model = Column(String(50), nullable=True, default="gemini-2.5-flash")
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    user = relationship("UserDB", back_populates="credentials")
