import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
)
from sqlalchemy.orm import Session

from app.agents.meeting_orchestrator import MeetingOrchestrator
from app.agents.summarizer_agent import SummarizerAgent
from app.core.config import RECORDINGS_DIR, get_settings
from app.core.database import get_db
from app.core.logger import get_logger
from app.core.security import require_admin
from app.models.db import ActionItemDB, LectureDB, MeetingDB
from app.models.schemas import (
    ActionItemSchema,
    MeetingListItemSchema,
    MeetingResponseSchema,
    MeetingSummarySchema,
    TranscriptSegmentSchema,
)
from app.services.audio import convert_to_wav, format_timestamp
from app.services.storage import delete_recording_files, save_recording_file

logger = get_logger("meeting_agent.api.meetings")

router = APIRouter(prefix="/meetings", tags=["meetings"])

def build_meeting_response(meeting: MeetingDB) -> MeetingResponseSchema:
    action_items = [
        ActionItemSchema(
            id=ai.id,
            task=ai.task,
            assignee=ai.assignee,
            priority=ai.priority,
            deadline=ai.deadline,
            completed=ai.completed
        )
        for ai in meeting.action_items
    ]

    transcript = [
        TranscriptSegmentSchema(
            id=ts.id,
            start=ts.start,
            end=ts.end,
            speaker=ts.speaker,
            text=ts.text
        )
        for ts in meeting.transcript_segments
    ]

    summary = None
    if meeting.executive_summary or meeting.overview:
        summary = MeetingSummarySchema(
            title=meeting.title,
            overview=meeting.overview or "",
            executive_summary=meeting.executive_summary or "",
            key_points=meeting.key_points,
            decisions=meeting.decisions,
            action_items=action_items,
            open_questions=meeting.open_questions,
            markdown_content=meeting.markdown_content or ""
        )

    return MeetingResponseSchema(
        id=meeting.id,
        lecture_id=meeting.lecture_id,
        title=meeting.title,
        platform=meeting.platform,
        created_at=meeting.created_at,
        duration_seconds=meeting.duration_seconds,
        audio_filename=meeting.audio_filename,
        video_filename=meeting.video_filename,
        media_type=meeting.media_type or "audio",
        status=meeting.status,
        error_message=meeting.error_message,
        language=meeting.language,
        template_used=meeting.template_used,
        full_text=meeting.full_text or "",
        summary=summary,
        transcript=transcript
    )


@router.get("", response_model=list[MeetingListItemSchema])
def list_meetings(db: Session = Depends(get_db)):
    meetings = db.query(MeetingDB).order_by(MeetingDB.created_at.desc()).all()
    results = []
    for m in meetings:
        preview = (m.full_text[:120] + "...") if m.full_text and len(m.full_text) > 120 else (m.full_text or "")
        results.append(MeetingListItemSchema(
            id=m.id,
            lecture_id=m.lecture_id,
            title=m.title,
            platform=m.platform,
            created_at=m.created_at,
            duration_seconds=m.duration_seconds,
            media_type=m.media_type or "audio",
            status=m.status,
            action_items_count=len(m.action_items),
            has_summary=bool(m.executive_summary),
            transcript_preview=preview
        ))
    return results


@router.get("/{meeting_id}", response_model=MeetingResponseSchema)
def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    m = db.query(MeetingDB).filter(MeetingDB.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return build_meeting_response(m)


@router.delete("/{meeting_id}", dependencies=[Depends(require_admin)])
def delete_meeting(meeting_id: str, db: Session = Depends(get_db)):
    m = db.query(MeetingDB).filter(MeetingDB.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if m.audio_filename:
        delete_recording_files(m.audio_filename)
    if m.video_filename:
        delete_recording_files(m.video_filename)

    db.delete(m)
    db.commit()
    return {"message": "Meeting deleted"}


@router.post("/upload", dependencies=[Depends(require_admin)])
def upload_meeting(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str | None = Form(None),
    platform: str | None = Form("upload"),
    template: str | None = Form(None),
    lecture_id: str | None = Form(None),
    db: Session = Depends(get_db)
):
    ext = Path(file.filename).suffix.lower() if file.filename else ".mp4"
    file_id = uuid.uuid4().hex[:8]
    is_video = ext in (".mp4", ".mov", ".m4v", ".webm", ".mkv")

    saved_filename = f"upload_{file_id}{ext}"
    saved_path = save_recording_file(file.file, saved_filename)

    audio_filename = saved_filename
    video_filename = saved_filename if is_video else None

    # If it's a video file, extract an audio wav/mp3 for Whisper & AI processing
    if is_video:
        try:
            audio_path = convert_to_wav(saved_path, RECORDINGS_DIR / f"upload_{file_id}.wav")
            audio_filename = audio_path.name
        except Exception as e:
            logger.warning(f"Audio extraction from video: {e}")

    # Auto-resolve title and template from lecture if linked
    final_title = title.strip() if title and title.strip() else None
    final_template = template or "standard"

    if lecture_id:
        lec = db.query(LectureDB).filter(LectureDB.id == lecture_id).first()
        if lec:
            if not final_title:
                final_title = f"{lec.subject.name}: {lec.title}" if lec.subject else lec.title
            if not template or template == "standard":
                final_template = "moodle_lecture"  # Default academic lecture template

    meeting = MeetingDB(
        id=f"mtg_{uuid.uuid4().hex[:10]}",
        lecture_id=lecture_id if lecture_id and lecture_id.strip() else None,
        title=final_title or (file.filename or "Uploaded Lecture"),
        platform=platform or "upload",
        audio_filename=audio_filename,
        video_filename=video_filename,
        media_type="video" if is_video else "audio",
        status="uploaded",
        template_used=final_template
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    orchestrator = MeetingOrchestrator(meeting.id)
    background_tasks.add_task(orchestrator.run, final_template)

    return {"meeting_id": meeting.id, "status": "processing"}


@router.post("/record", dependencies=[Depends(require_admin)])
@router.post("/record-blob", dependencies=[Depends(require_admin)])
def record_meeting(
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(None),
    audio: UploadFile | None = File(None),
    title: str | None = Form(None),
    platform: str | None = Form("recording"),
    template: str | None = Form(None),
    lecture_id: str | None = Form(None),
    db: Session = Depends(get_db)
):
    upload_target = file or audio
    if not upload_target:
        raise HTTPException(status_code=400, detail="No audio file or blob uploaded.")

    ext = Path(upload_target.filename).suffix.lower() if upload_target.filename else ".webm"
    if not ext or ext == ".":
        ext = ".webm"
    file_id = uuid.uuid4().hex[:8]
    saved_filename = f"rec_{file_id}{ext}"
    save_recording_file(upload_target.file, saved_filename)

    final_title = title.strip() if title and title.strip() else None
    final_template = template or "standard"

    if lecture_id:
        lec = db.query(LectureDB).filter(LectureDB.id == lecture_id).first()
        if lec:
            if not final_title:
                final_title = f"{lec.subject.name}: {lec.title}" if lec.subject else lec.title
            if not template or template == "standard":
                final_template = "moodle_lecture"

    meeting = MeetingDB(
        id=f"mtg_{uuid.uuid4().hex[:10]}",
        lecture_id=lecture_id if lecture_id and lecture_id.strip() else None,
        title=final_title or "Recorded Lecture",
        platform=platform or "recording",
        audio_filename=saved_filename,
        video_filename=None,
        media_type="audio",
        status="recorded",
        template_used=final_template
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    orchestrator = MeetingOrchestrator(meeting.id)
    background_tasks.add_task(orchestrator.run, final_template)

    return {"meeting_id": meeting.id, "status": "processing"}


@router.post("/{meeting_id}/process", dependencies=[Depends(require_admin)])
def process_meeting(
    meeting_id: str,
    background_tasks: BackgroundTasks,
    template: str | None = "standard",
    db: Session = Depends(get_db)
):
    m = db.query(MeetingDB).filter(MeetingDB.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")

    orchestrator = MeetingOrchestrator(meeting_id)
    background_tasks.add_task(orchestrator.run, template)
    return {"message": "Processing restarted", "status": "processing"}


@router.post("/{meeting_id}/summarize", dependencies=[Depends(require_admin)])
def resummarize_meeting(
    meeting_id: str,
    payload: dict,
    db: Session = Depends(get_db)
):
    m = db.query(MeetingDB).filter(MeetingDB.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not m.full_text:
        raise HTTPException(status_code=400, detail="Meeting has no transcript to summarize")

    settings = get_settings()
    template = payload.get("template", "standard")
    custom = payload.get("custom_instructions")

    key = settings.gemini_api_key if settings.summarization_engine == "gemini" else settings.openai_api_key
    model = settings.gemini_model if settings.summarization_engine == "gemini" else settings.openai_model

    agent = SummarizerAgent(engine=settings.summarization_engine, api_key=key, model=model)
    summary = agent.analyze(m.full_text, template=template, custom_instructions=custom)

    m.overview = summary.overview
    m.executive_summary = summary.executive_summary
    m.key_points = summary.key_points
    m.decisions = summary.decisions
    m.open_questions = summary.open_questions
    m.markdown_content = summary.markdown_content
    m.template_used = template

    # Update action items
    db.query(ActionItemDB).filter(ActionItemDB.meeting_id == m.id).delete()
    for ai in summary.action_items:
        db.add(ActionItemDB(
            meeting_id=m.id,
            task=ai.task,
            assignee=ai.assignee or "Unassigned",
            priority=ai.priority or "Medium",
            deadline=ai.deadline,
            completed=False
        ))
    db.commit()

    return summary


@router.post("/{meeting_id}/action_items/{item_id}/toggle")
def toggle_action_item(
    meeting_id: str,
    item_id: int,
    db: Session = Depends(get_db)
):
    item = db.query(ActionItemDB).filter(
        ActionItemDB.id == item_id,
        ActionItemDB.meeting_id == meeting_id
    ).first()

    # Fallback to index if item_id is passed as 0-indexed position
    if not item:
        items = db.query(ActionItemDB).filter(ActionItemDB.meeting_id == meeting_id).order_by(ActionItemDB.id).all()
        if 0 <= item_id < len(items):
            item = items[item_id]

    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")

    item.completed = not item.completed
    db.commit()
    return {"completed": item.completed}


@router.get("/{meeting_id}/export/{export_format}")
def export_meeting(
    meeting_id: str,
    export_format: str,
    db: Session = Depends(get_db)
):
    m = db.query(MeetingDB).filter(MeetingDB.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")

    clean_title = "".join(c for c in m.title if c.isalnum() or c in (" ", "_", "-")).strip()
    filename_base = f"{clean_title.replace(' ', '_')}_{m.id}"

    if export_format in ("markdown", "md"):
        md = f"# {m.title}\n"
        md += f"**Platform:** {m.platform.upper()} | **Date:** {str(m.created_at)[:10]} | **Duration:** {format_timestamp(m.duration_seconds)}\n\n"
        if m.overview:
            md += f"## Overview\n{m.overview}\n\n"
        if m.executive_summary:
            md += f"## Executive Summary\n{m.executive_summary}\n\n"
        if m.key_points:
            md += "## Key Discussion Points\n"
            for kp in m.key_points:
                md += f"- {kp}\n"
            md += "\n"
        if m.decisions:
            md += "## Decisions & Agreements\n"
            for dec in m.decisions:
                md += f"- {dec}\n"
            md += "\n"
        if m.action_items:
            md += "## Action Items\n"
            for ai in m.action_items:
                status = "[x]" if ai.completed else "[ ]"
                deadline_str = f" (Due: {ai.deadline})" if ai.deadline else ""
                assignee_str = f" @{ai.assignee}" if ai.assignee else ""
                md += f"- {status} **{ai.task}**{assignee_str} [{ai.priority}]{deadline_str}\n"
            md += "\n"
        if m.open_questions:
            md += "## Open Questions / Follow-ups\n"
            for q in m.open_questions:
                md += f"- {q}\n"
            md += "\n"
        md += "## Transcript\n\n"
        for seg in m.transcript_segments:
            md += f"**[{format_timestamp(seg.start)}] {seg.speaker}:** {seg.text}\n\n"

        return Response(
            content=md,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.md"'}
        )
    elif export_format == "txt":
        txt = f"{m.title}\nPlatform: {m.platform.upper()} | Date: {str(m.created_at)[:10]}\n\n"
        txt += "--- SUMMARY ---\n" + (m.executive_summary or "") + "\n\n"
        txt += "--- TRANSCRIPT ---\n" + (m.full_text or "")
        return Response(
            content=txt,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.txt"'}
        )
    else:
        raise HTTPException(status_code=400, detail="Supported export formats: md, txt")
