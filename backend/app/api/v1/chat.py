from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.chat_agent import ChatAgent
from app.core.config import get_settings
from app.core.database import get_db
from app.models.db import MeetingDB
from app.models.schemas import ChatRequestSchema, ChatResponseSchema

router = APIRouter(prefix="/meetings", tags=["chat"])

@router.post("/{meeting_id}/chat", response_model=ChatResponseSchema)
def chat_with_meeting(
    meeting_id: str,
    payload: ChatRequestSchema,
    db: Session = Depends(get_db)
):
    m = db.query(MeetingDB).filter(MeetingDB.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not m.full_text:
        raise HTTPException(status_code=400, detail="Meeting transcript is empty")

    settings = get_settings()
    key = settings.gemini_api_key if settings.summarization_engine == "gemini" else settings.openai_api_key
    model = settings.gemini_model if settings.summarization_engine == "gemini" else settings.openai_model

    agent = ChatAgent(engine=settings.summarization_engine, api_key=key, model=model)
    answer = agent.ask(transcript=m.full_text, question=payload.question)
    return ChatResponseSchema(answer=answer)
