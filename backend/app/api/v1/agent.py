from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_pro_or_admin
from app.models.user import UserDB
from app.services.study_agent_service import StudyAgentService

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatRequest(BaseModel):
    message: str = Field(..., description="User message or query")
    scope: str = Field("lecture", description="'lecture' or 'subject'")
    lecture_id: str | None = Field(None, description="Current lecture ID (if scope is lecture)")
    subject_id: str | None = Field(None, description="Current subject ID (if scope is subject or lecture)")
    thread_id: str | None = Field(None, description="Optional custom thread ID for memory persistence")
    token_saver: bool = Field(False, description="Enable token saver mode for compact, low-token responses")


class ChatResponse(BaseModel):
    response: str
    thread_id: str
    actions_taken: list[str] = []
    suggested_followups: list[str] = []
    updated_summary: str | None = None


class HistoryResponse(BaseModel):
    thread_id: str
    messages: list[dict[str, Any]] = []


@router.post("/chat", response_model=ChatResponse)
def chat_with_agent(
    req: ChatRequest,
    current_user: UserDB = Depends(require_pro_or_admin),
    db: Session = Depends(get_db)
):
    """
    Interact with the LangGraph Study Agent.
    Available strictly for Pro Students and Administrators.
    """
    res = StudyAgentService.chat(
        db=db,
        message=req.message,
        scope=req.scope,
        lecture_id=req.lecture_id,
        subject_id=req.subject_id,
        thread_id=req.thread_id,
        token_saver=req.token_saver,
        user=current_user,
    )
    return ChatResponse(
        response=res["response"],
        thread_id=res["thread_id"],
        actions_taken=res.get("actions_taken", []),
        suggested_followups=res.get("suggested_followups", []),
        updated_summary=res.get("updated_summary"),
    )


def _scope_thread_id_for_user(raw_thread_id: str, user: UserDB) -> str:
    """Namespace thread_id by user ID to prevent cross-user chat history leakage (IDOR)."""
    prefix = f"u_{user.id}_"
    if raw_thread_id.startswith(prefix):
        return raw_thread_id
    return f"{prefix}{raw_thread_id}"


@router.get("/history", response_model=HistoryResponse)
def get_thread_history(
    thread_id: str = Query(...),
    current_user: UserDB = Depends(require_pro_or_admin),
    db: Session = Depends(get_db)
):
    """Retrieve message history for a specific conversation thread scoped to the current user."""
    scoped_id = _scope_thread_id_for_user(thread_id, current_user)
    messages = StudyAgentService.get_history(db, scoped_id)
    return HistoryResponse(thread_id=thread_id, messages=messages)


@router.delete("/history")
def clear_thread_history(
    thread_id: str = Query(...),
    current_user: UserDB = Depends(require_pro_or_admin),
    db: Session = Depends(get_db)
):
    """Clear conversation history for a specific thread scoped to the current user."""
    scoped_id = _scope_thread_id_for_user(thread_id, current_user)
    StudyAgentService.clear_history(db, scoped_id)
    return {"success": True, "message": f"History for thread '{thread_id}' cleared."}

