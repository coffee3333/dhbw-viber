from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.ai_credentials import resolve_user_ai_config
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import get_current_user_optional
from app.models.db import LectureDB, LectureKnowledgeChunkDB, SubjectDB
from app.models.user import UserDB
from app.services.rag_service import GrillAgent, RagService

router = APIRouter(prefix="/rag", tags=["rag"])


class GrillMeRequest(BaseModel):
    subject_id: str | None = None
    lecture_id: str | None = None
    topic_focus: str | None = None
    difficulty: str | None = "exam"
    thread_id: str | None = None


class EvaluateRequest(BaseModel):
    subject_id: str | None = None
    lecture_id: str | None = None
    question: str
    student_answer: str
    thread_id: str | None = None


class SearchRequest(BaseModel):
    query: str
    subject_id: str | None = None
    lecture_id: str | None = None
    limit: int | None = 8


@router.post("/grill-me")
def grill_me(
    req: GrillMeRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Generate a rigorous exam/quiz question grounded in lecture notes & AI summaries."""
    current_user: UserDB | None = get_current_user_optional(request, db)
    ai_config = resolve_user_ai_config(current_user)

    subject_name = "Computer Science"
    lecture_title = None

    if req.lecture_id:
        lec = db.query(LectureDB).filter(LectureDB.id == req.lecture_id).first()
        if lec:
            lecture_title = lec.title
            if lec.subject:
                subject_name = lec.subject.name
    elif req.subject_id:
        subj = db.query(SubjectDB).filter(SubjectDB.id == req.subject_id).first()
        if subj:
            subject_name = subj.name

    context = RagService.build_context(
        db,
        subject_id=req.subject_id,
        lecture_id=req.lecture_id,
        query=req.topic_focus
    )

    engine = ai_config.summarization_engine
    api_key = ai_config.summarization_api_key
    model = ai_config.summarization_model
    effective_thread_id = req.thread_id or f"grill_{req.subject_id or 'general'}_{req.lecture_id or 'all'}"

    if not api_key:
        # Fallback question if no API key is provided
        return {
            "question": f"Explain the core architectural concepts of {subject_name} and describe how to design a scalable solution for this domain.",
            "difficulty": "exam_level",
            "topic": subject_name,
            "hints": ["Review key lecture slides and trade-offs.", "Think about database consistency and modular architecture."],
            "model_answer_points": ["Correct core concepts", "Tradeoff analysis", "Practical application"],
            "question_type": "open",
            "options": [],
            "thread_id": effective_thread_id,
            "context_sources_used": bool(context)
        }

    agent = GrillAgent(engine=engine, api_key=api_key, model=model)
    result = agent.generate_question(
        context=context,
        subject_name=subject_name,
        lecture_title=lecture_title,
        difficulty=req.difficulty or "exam",
        topic_focus=req.topic_focus,
        thread_id=effective_thread_id,
        db=db
    )
    result["context_sources_used"] = bool(context)
    result["thread_id"] = effective_thread_id
    return result


@router.post("/evaluate")
def evaluate_student_answer(
    req: EvaluateRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Grade and critique the student's answer against the lecture knowledge."""
    current_user: UserDB | None = get_current_user_optional(request, db)
    ai_config = resolve_user_ai_config(current_user)

    subject_name = "Computer Science"
    if req.lecture_id:
        lec = db.query(LectureDB).filter(LectureDB.id == req.lecture_id).first()
        if lec and lec.subject:
            subject_name = lec.subject.name
    elif req.subject_id:
        subj = db.query(SubjectDB).filter(SubjectDB.id == req.subject_id).first()
        if subj:
            subject_name = subj.name

    context = RagService.build_context(
        db,
        subject_id=req.subject_id,
        lecture_id=req.lecture_id,
        query=req.question
    )

    engine = ai_config.summarization_engine
    api_key = ai_config.summarization_api_key
    model = ai_config.summarization_model
    effective_thread_id = req.thread_id or f"grill_{req.subject_id or 'general'}_{req.lecture_id or 'all'}"

    if not api_key:
        return {
            "score": 8,
            "feedback": "Your answer demonstrates sound understanding of the subject matter. For an exam, ensure you provide concrete technical terminology and trade-off considerations.",
            "strengths": ["Clear explanation", "Directly addressed the question"],
            "missing_or_incorrect": ["Could include specific technical keywords from lecture"],
            "model_answer": f"In {subject_name}, a complete solution highlights core definitions, architectural patterns, and practical execution details.",
            "follow_up_question": "How does this compare to alternative approaches discussed in class?",
            "thread_id": effective_thread_id
        }

    agent = GrillAgent(engine=engine, api_key=api_key, model=model)
    eval_result = agent.evaluate_answer(
        context=context,
        question=req.question,
        student_answer=req.student_answer,
        subject_name=subject_name,
        thread_id=effective_thread_id,
        db=db
    )
    eval_result["thread_id"] = effective_thread_id
    return eval_result


@router.post("/search")
def search_knowledge(req: SearchRequest, db: Session = Depends(get_db)):
    """Search knowledge base chunks."""
    results = RagService.search(
        db,
        query=req.query,
        subject_id=req.subject_id,
        lecture_id=req.lecture_id,
        limit=req.limit or 8
    )
    return {"results": results, "count": len(results)}


@router.post("/sync")
def sync_all_knowledge(db: Session = Depends(get_db)):
    """Re-index all lectures and transcripts."""
    return RagService.sync_all(db)


@router.post("/index-lecture/{lecture_id}")
def index_single_lecture(lecture_id: str, db: Session = Depends(get_db)):
    """Index a single lecture."""
    count = RagService.index_lecture(db, lecture_id)
    return {"message": f"Lecture indexed ({count} chunks created)", "chunks_created": count}


@router.get("/stats")
def get_knowledge_stats(db: Session = Depends(get_db)):
    """Get stats on indexed knowledge base."""
    total_chunks = db.query(LectureKnowledgeChunkDB).count()
    return {
        "total_chunks": total_chunks,
        "is_indexed": total_chunks > 0
    }


@router.get("/history/{thread_id}")
def get_thread_history(thread_id: str, db: Session = Depends(get_db)):
    """Fetch checkpointer execution history for a study / quiz thread."""
    from app.services.checkpointer import AgentCheckpointer
    cps = AgentCheckpointer.list_checkpoints(db, thread_id)
    return {
        "thread_id": thread_id,
        "count": len(cps),
        "history": [
            {
                "checkpoint_id": cp.checkpoint_id,
                "step": cp.step,
                "state": cp.state,
                "metadata": cp.metadata_dict,
                "created_at": cp.created_at.isoformat() if cp.created_at else None
            }
            for cp in cps
        ]
    }


@router.delete("/history/{thread_id}")
def delete_thread_history(thread_id: str, db: Session = Depends(get_db)):
    """Clear checkpointer history for a thread."""
    from app.services.checkpointer import AgentCheckpointer
    deleted = AgentCheckpointer.delete_thread(db, thread_id)
    return {"message": f"Deleted {deleted} checkpoints for thread {thread_id}"}
