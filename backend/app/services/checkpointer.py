import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.db import AgentCheckpointDB


class AgentCheckpointer:
    """
    Checkpointer service for AI agent workflows and conversational memory.
    Compatible with PostgreSQL and SQLite, providing persistent state snapshots,
    thread management, and rollback capabilities.
    """

    @staticmethod
    def save_checkpoint(
        db: Session,
        thread_id: str,
        state: dict[str, Any],
        agent_name: str = "grill_agent",
        step: int | None = None,
        parent_checkpoint_id: str | None = None,
        metadata: dict[str, Any] | None = None
    ) -> AgentCheckpointDB:
        """Save a new state checkpoint for an agent thread."""
        if step is None:
            # Determine step number from previous checkpoint
            latest = AgentCheckpointer.get_latest_checkpoint(db, thread_id)
            step = (latest.step + 1) if latest else 1
            if not parent_checkpoint_id and latest:
                parent_checkpoint_id = latest.checkpoint_id

        checkpoint_id = f"chk_{uuid.uuid4().hex[:12]}"
        cp = AgentCheckpointDB(
            id=f"rec_{uuid.uuid4().hex[:12]}",
            thread_id=thread_id,
            checkpoint_id=checkpoint_id,
            parent_checkpoint_id=parent_checkpoint_id,
            step=step,
            agent_name=agent_name,
            created_at=datetime.now(UTC)
        )
        cp.state = state
        cp.metadata_dict = metadata or {}

        db.add(cp)
        db.commit()
        db.refresh(cp)
        return cp

    @staticmethod
    def get_latest_checkpoint(db: Session, thread_id: str) -> AgentCheckpointDB | None:
        """Fetch the most recent checkpoint for a given thread."""
        return (
            db.query(AgentCheckpointDB)
            .filter(AgentCheckpointDB.thread_id == thread_id)
            .order_by(desc(AgentCheckpointDB.step), desc(AgentCheckpointDB.created_at))
            .first()
        )

    @staticmethod
    def get_checkpoint(db: Session, thread_id: str, checkpoint_id: str) -> AgentCheckpointDB | None:
        """Fetch a specific checkpoint by ID."""
        return (
            db.query(AgentCheckpointDB)
            .filter(
                AgentCheckpointDB.thread_id == thread_id,
                AgentCheckpointDB.checkpoint_id == checkpoint_id
            )
            .first()
        )

    @staticmethod
    def list_checkpoints(db: Session, thread_id: str, limit: int = 50) -> list[AgentCheckpointDB]:
        """List checkpoint history for a thread ordered by step."""
        return (
            db.query(AgentCheckpointDB)
            .filter(AgentCheckpointDB.thread_id == thread_id)
            .order_by(desc(AgentCheckpointDB.step))
            .limit(limit)
            .all()
        )

    @staticmethod
    def delete_thread(db: Session, thread_id: str) -> int:
        """Delete all checkpoints for a thread."""
        count = db.query(AgentCheckpointDB).filter(AgentCheckpointDB.thread_id == thread_id).delete()
        db.commit()
        return count
