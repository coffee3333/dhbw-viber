from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.agents.chat_agent import ChatAgent
from app.core.ai_credentials import get_system_ai_credentials, resolve_user_ai_config
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import require_pro_or_admin
from app.models.db import MeetingDB
from app.models.schemas import ChatRequestSchema, ChatResponseSchema
from app.models.user import UserDB

router = APIRouter(prefix="/meetings", tags=["chat"])

@router.post("/{meeting_id}/chat", response_model=ChatResponseSchema)
def chat_with_meeting(
    meeting_id: str,
    payload: ChatRequestSchema,
    current_user: UserDB = Depends(require_pro_or_admin),
    db: Session = Depends(get_db)
):
    m = db.query(MeetingDB).filter(MeetingDB.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not m.full_text:
        raise HTTPException(status_code=400, detail="Meeting transcript is empty")

    settings = get_settings()
    ai_config = resolve_user_ai_config(current_user, db=db)
    system_gemini_key, _ = get_system_ai_credentials(db=db)
    if getattr(current_user, "role", "student") == "pro_student":
        effective_key = system_gemini_key or settings.gemini_api_key or ai_config.summarization_api_key
    else:
        effective_key = ai_config.summarization_api_key or system_gemini_key or settings.gemini_api_key

    if not effective_key:
        raise HTTPException(
            status_code=400,
            detail="Gemini API key is not configured on this server. Please contact an administrator."
        )

    agent = ChatAgent(
        engine=ai_config.summarization_engine,
        api_key=effective_key,
        model=ai_config.summarization_model
    )
    answer = agent.ask(transcript=m.full_text, question=payload.question)
    return ChatResponseSchema(answer=answer)
