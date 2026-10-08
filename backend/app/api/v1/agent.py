from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user_optional
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
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Interact with the LangGraph Study Agent.
    Supports asking questions, editing lecture summaries live, and taking exam drills (/grill me).
    """
    current_user: UserDB | None = get_current_user_optional(request, db)
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


@router.get("/history", response_model=HistoryResponse)
def get_thread_history(thread_id: str = Query(...), db: Session = Depends(get_db)):
    """Retrieve message history for a specific conversation thread."""
    messages = StudyAgentService.get_history(db, thread_id)
    return HistoryResponse(thread_id=thread_id, messages=messages)


@router.delete("/history")
def clear_thread_history(thread_id: str = Query(...), db: Session = Depends(get_db)):
    """Clear conversation history for a specific thread."""
    StudyAgentService.clear_history(db, thread_id)
    return {"success": True, "message": f"History for thread '{thread_id}' cleared."}
