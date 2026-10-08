from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.agents.chat_agent import ChatAgent
from app.core.ai_credentials import resolve_user_ai_config
from app.core.database import get_db
from app.core.security import get_current_user_optional
from app.models.db import MeetingDB
from app.models.schemas import ChatRequestSchema, ChatResponseSchema
from app.models.user import UserDB

router = APIRouter(prefix="/meetings", tags=["chat"])

@router.post("/{meeting_id}/chat", response_model=ChatResponseSchema)
def chat_with_meeting(
    meeting_id: str,
    payload: ChatRequestSchema,
    request: Request,
    db: Session = Depends(get_db)
):
    m = db.query(MeetingDB).filter(MeetingDB.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not m.full_text:
        raise HTTPException(status_code=400, detail="Meeting transcript is empty")

    current_user: UserDB | None = get_current_user_optional(request, db)
    if not current_user and getattr(m, "user_id", None):
        current_user = db.query(UserDB).filter(UserDB.id == m.user_id).first()

    ai_config = resolve_user_ai_config(current_user)

    agent = ChatAgent(
        engine=ai_config.summarization_engine,
        api_key=ai_config.summarization_api_key,
        model=ai_config.summarization_model
    )
    answer = agent.ask(transcript=m.full_text, question=payload.question)
    return ChatResponseSchema(answer=answer)
