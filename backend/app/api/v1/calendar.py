import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import (
    APIRouter,
    Body,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import DATA_DIR, MATERIALS_DIR
from app.core.database import get_db
from app.core.logger import get_logger
from app.core.security import require_admin, require_auth
from app.models.db import ActionItemDB, CalendarSourceDB, LectureDB, MeetingDB, SubjectDB
from app.models.schemas import (
    CalendarSourceSchema,
    CalendarSyncRequestSchema,
    LectureChainItemSchema,
    LectureMaterialCreate,
    LectureNotesUpdate,
    LectureStatusUpdate,
    SubjectDetailSchema,
    SubjectSchema,
    SubjectUpdateSchema,
)
from app.services.calendar_parser import (
    fetch_ical_from_url,
    merge_adjacent_lectures,
    sync_calendar_events,
)
from app.services.rag_service import RagService

logger = get_logger("meeting_agent.api.calendar")

router = APIRouter(prefix="/calendar", tags=["calendar"])

@router.get("/sources", response_model=list[CalendarSourceSchema])
def list_calendar_sources(db: Session = Depends(get_db)):
    return db.query(CalendarSourceDB).all()


@router.delete("/sources/{source_id}", dependencies=[Depends(require_admin)])
def delete_calendar_source(source_id: int, db: Session = Depends(get_db)):
    source = db.query(CalendarSourceDB).filter(CalendarSourceDB.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Calendar source not found")

    # If it was an uploaded file, remove it from disk
    if source.file_path:
        p = Path(source.file_path)
        if p.exists():
            p.unlink()

    db.delete(source)
    db.commit()
    return {"message": "Calendar source removed"}


@router.delete("/clear-all", dependencies=[Depends(require_admin)])
def clear_all_calendar_data(db: Session = Depends(get_db)):
    """Clear all lectures, subjects and sources (keeps recordings as unattached)."""
    # Detach meetings from lectures
    meetings = db.query(MeetingDB).all()
    for m in meetings:
        m.lecture_id = None
    db.flush()

    db.query(LectureDB).delete()
    db.query(SubjectDB).delete()
    db.query(CalendarSourceDB).delete()
    db.commit()
    return {"message": "All timetable data cleared successfully."}


@router.post("/refresh-all", dependencies=[Depends(require_admin)])
def refresh_all_calendar_sources(db: Session = Depends(get_db)):
    """Fetch and sync fresh schedules from all configured calendar URLs."""
    sources = db.query(CalendarSourceDB).filter(CalendarSourceDB.url.isnot(None)).all()
    total_lectures = 0
    for s in sources:
        try:
            content = fetch_ical_from_url(s.url)
            res = sync_calendar_events(db, content)
            s.last_synced = datetime.now(UTC)
            total_lectures += res.get("lectures_synced", 0)
        except Exception as e:
            logger.error(f"Error refreshing calendar source {s.id}: {e}")
    db.commit()
    return {"message": f"Refreshed {len(sources)} calendar sources with {total_lectures} lectures."}


@router.post("/sync-url", dependencies=[Depends(require_admin)])
def sync_calendar_by_url(
    payload: CalendarSyncRequestSchema,
    db: Session = Depends(get_db)
):
    if not payload.url or not payload.url.strip():
        raise HTTPException(status_code=400, detail="Calendar URL is required.")

    clean_url = payload.url.strip()
    try:
        content = fetch_ical_from_url(clean_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch calendar from URL: {e}") from e

    result = sync_calendar_events(db, content)

    # Save or update calendar source in DB
    source = db.query(CalendarSourceDB).filter(CalendarSourceDB.url == clean_url).first()
    if not source:
        source = CalendarSourceDB(name=payload.name or "DHBW Timetable", url=clean_url)
        db.add(source)
    source.last_synced = datetime.now(UTC)
    db.commit()

    return {
        "message": f"Successfully synced {result['lectures_synced']} lectures across {result['total_subjects']} subjects.",
        **result
    }


@router.post("/upload-ics", dependencies=[Depends(require_admin)])
def upload_ics_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    try:
        content = file.file.read().decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read uploaded calendar file: {e}") from e

    # Save file to data directory for tracking
    file_id = uuid.uuid4().hex[:8]
    ics_filename = f"schedule_{file_id}.ics"
    ics_path = DATA_DIR / ics_filename
    with open(ics_path, "w", encoding="utf-8") as f:
        f.write(content)

    result = sync_calendar_events(db, content)

    source = CalendarSourceDB(
        name=file.filename or f"Uploaded Schedule ({ics_filename})",
        file_path=str(ics_path),
        last_synced=datetime.now(UTC)
    )
    db.add(source)
    db.commit()

    return {
        "message": f"Uploaded calendar processed: {result['lectures_synced']} lectures synced.",
        **result
    }


@router.get("/subjects", response_model=list[SubjectSchema])
def list_subjects(db: Session = Depends(get_db)):
    subjects = db.query(SubjectDB).order_by(SubjectDB.name).all()
    results = []
    for s in subjects:
        results.append(SubjectSchema(
            id=s.id,
            name=s.name,
            code=s.code,
            lecturer=s.lecturer,
            color=s.color or "#4f46e5",
            semester=s.semester,
            lectures_count=len(s.lectures)
        ))
    return results


@router.put("/subjects/{subject_id}", response_model=SubjectSchema, dependencies=[Depends(require_admin)])
def update_subject(
    subject_id: str,
    payload: SubjectUpdateSchema,
    db: Session = Depends(get_db)
):
    subject = db.query(SubjectDB).filter(SubjectDB.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    if payload.name is not None:
        subject.name = payload.name
    if payload.code is not None:
        subject.code = payload.code
    if payload.lecturer is not None:
        subject.lecturer = payload.lecturer
    if payload.color is not None:
        subject.color = payload.color

    db.commit()
    db.refresh(subject)
    return SubjectSchema(
        id=subject.id,
        name=subject.name,
        code=subject.code,
        lecturer=subject.lecturer,
        color=subject.color or "#4f46e5",
        semester=subject.semester,
        lectures_count=len(subject.lectures)
    )


@router.post("/cleanup-holidays", dependencies=[Depends(require_admin)])
@router.post("/subjects/cleanup-holidays", dependencies=[Depends(require_admin)])
def cleanup_holidays(db: Session = Depends(get_db)):
    """Automatically identify and remove public holidays and non-academic calendar entries."""
    holiday_keywords = [
        "weihnacht", "christmas", "feiertag", "deutsche einheit", "allerheiligen",
        "all saints", "neujahr", "new year", "silvester", "karfreitag", "ostern",
        "easter", "pfingsten", "himmelfahrt", "fronleichnam", "reformationstag",
        "buß- und bettag", "schließzeit", "vorlesungsfrei", "brückentag", "feiertag"
    ]

    all_subjects = db.query(SubjectDB).all()
    deleted_names = []

    for subj in all_subjects:
        name_lower = subj.name.lower()
        # Check if subject matches holiday keyword and has no lecturer
        is_holiday = any(kw in name_lower for kw in holiday_keywords) and not subj.lecturer
        if is_holiday:
            lectures = db.query(LectureDB).filter(LectureDB.subject_id == subj.id).all()
            for lec in lectures:
                for m in lec.meetings:
                    m.lecture_id = None
                db.delete(lec)
            db.flush()
            deleted_names.append(subj.name)
            db.delete(subj)

    db.commit()
    return {
        "message": f"Cleaned up {len(deleted_names)} holiday/non-academic entries.",
        "deleted_count": len(deleted_names),
        "deleted_subjects": deleted_names
    }


@router.post("/merge-split-lectures", dependencies=[Depends(require_admin)])
def merge_splits(max_gap_minutes: int = 35, db: Session = Depends(get_db)):
    """Manually trigger consolidation of split lecture slots occurring on the same day."""
    merged = merge_adjacent_lectures(db, max_gap_minutes=max_gap_minutes)
    return {"message": f"Successfully merged {merged} split lecture sessions.", "merged_count": merged}


@router.get("/subjects/{subject_id}", response_model=SubjectDetailSchema)
def get_subject_detail(subject_id: str, db: Session = Depends(get_db)):
    """Fetch subject details along with the full chronological lecture chain."""
    subj = db.query(SubjectDB).filter(SubjectDB.id == subject_id).first()
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Consolidate any split sessions (e.g. 15, 20, 30 min breaks on same day)
    merge_adjacent_lectures(db, max_gap_minutes=35)
    db.refresh(subj)

    now = datetime.now(UTC).astimezone().replace(tzinfo=None)
    now_date = now.date()

    # Sort lectures strictly chronologically
    sorted_lectures = sorted(subj.lectures, key=lambda lec_item: lec_item.start_time)

    chain_items = []
    completed_cnt = 0
    upcoming_cnt = 0
    postponed_cnt = 0
    canceled_cnt = 0

    for idx, lec in enumerate(sorted_lectures, start=1):
        m = lec.meetings[0] if lec.meetings else None

        # Adaptive status inference
        raw_status = (lec.status or "scheduled").lower()
        title_desc_lower = f"{lec.title} {lec.description or ''}".lower()
        is_canceled = "canceled" in raw_status or any(w in title_desc_lower for w in ["abgesagt", "entfällt", "cancelled", "ausfall"])
        is_postponed = "postponed" in raw_status or any(w in title_desc_lower for w in ["verschoben", "verlegt", "postponed"])

        is_past = lec.end_time < now
        is_happening_now = lec.start_time <= now <= lec.end_time
        is_upcoming = lec.start_time > now
        is_today = lec.start_time.date() == now_date

        mats = lec.materials or []
        has_recording = bool(m and (m.audio_filename or m.video_filename))
        has_summary_text = bool((m and m.executive_summary) or (lec.ai_summary_override and len(lec.ai_summary_override.strip()) > 10))
        has_notes = bool(lec.notes and len(lec.notes.strip()) > 50)

        has_presentation_file = any(
            (mat.get("type") == "presentation") or
            any((mat.get("filename") or mat.get("title", "")).lower().endswith(ext) for ext in [".pdf", ".pptx", ".ppt"])
            for mat in mats
        )
        has_summary_md_file = any(
            (mat.get("type") == "summary_md") or
            (mat.get("filename") or mat.get("title", "")).lower().endswith(".md")
            for mat in mats
        )
        has_other_materials = any(
            not ((mat.get("type") in ("presentation", "summary_md")) or
                 any((mat.get("filename") or mat.get("title", "")).lower().endswith(ext) for ext in [".pdf", ".pptx", ".ppt", ".md"]))
            for mat in mats
        )

        # AI Context qualification:
        # Either an AI-generated summary from recording, a user-uploaded .md summary, or student notes > 50 chars
        has_ai_context = bool(has_summary_text or has_summary_md_file or has_notes)

        # Status resolution
        if is_canceled:
            effective_status = "canceled"
            canceled_cnt += 1
        elif is_postponed:
            effective_status = "postponed"
            postponed_cnt += 1
        elif is_happening_now:
            effective_status = "happening_now"
            upcoming_cnt += 1
        elif is_past:
            effective_status = "completed" if has_ai_context else "needs_summary"
            completed_cnt += 1
        else:
            effective_status = "upcoming"
            upcoming_cnt += 1

        # Compute incoming tasks (from previous lecture) and assigned tasks
        incoming_cnt = 0
        if idx > 1:
            prev_lec_obj = sorted_lectures[idx - 2]
            prev_m = prev_lec_obj.meetings[0] if prev_lec_obj.meetings else None
            incoming_cnt = len(prev_m.action_items) if prev_m else 0

        assigned_cnt = len(m.action_items) if m else 0

        # Clean Chips list (NO EMOJIS as requested by user)
        chips = []
        if incoming_cnt > 0:
            chips.append(f"{incoming_cnt} Tasks Due")
        elif assigned_cnt > 0:
            chips.append(f"{assigned_cnt} Tasks Assigned")

        if has_recording:
            chips.append("Recording")
        if has_presentation_file:
            chips.append("Presentation")
        if has_summary_md_file:
            chips.append("AI Summary (MD)")
        elif has_summary_text:
            chips.append("AI Summary")
        if has_other_materials:
            chips.append("Materials")

        chain_items.append(LectureChainItemSchema(
            id=lec.id,
            sequence=idx,
            title=lec.title,
            start_time=lec.start_time.isoformat(),
            end_time=lec.end_time.isoformat(),
            room=lec.room,
            meeting_link=lec.meeting_link,
            description=lec.description,
            status=effective_status,
            has_recording=has_recording,
            has_summary=has_summary_text or has_summary_md_file,
            has_materials=bool(mats or lec.notes),
            has_ai_context=has_ai_context,
            is_past=is_past,
            is_today=is_today,
            is_upcoming=is_upcoming,
            is_happening_now=is_happening_now,
            recording_id=m.id if m else None,
            notes_preview=(lec.notes[:120] + "...") if lec.notes and len(lec.notes) > 120 else (lec.notes or None),
            materials=mats,
            chips=chips,
            incoming_tasks_count=incoming_cnt,
            assigned_tasks_count=assigned_cnt
        ))

    return SubjectDetailSchema(
        id=subj.id,
        name=subj.name,
        code=subj.code,
        lecturer=subj.lecturer,
        color=subj.color or "#4f46e5",
        semester=subj.semester,
        stats={
            "total": len(sorted_lectures),
            "completed": completed_cnt,
            "upcoming": upcoming_cnt,
            "postponed": postponed_cnt,
            "canceled": canceled_cnt
        },
        lectures=chain_items
    )


@router.delete("/subjects/{subject_id}", dependencies=[Depends(require_admin)])
def delete_subject(subject_id: str, db: Session = Depends(get_db)):
    """Delete a subject and all associated non-academic or unwanted lecture entries."""
    subject = db.query(SubjectDB).filter(SubjectDB.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Detach any meetings attached to these lectures so recordings are preserved
    lectures = db.query(LectureDB).filter(LectureDB.subject_id == subject_id).all()
    for lec in lectures:
        for m in lec.meetings:
            m.lecture_id = None
        db.delete(lec)
    db.flush()

    db.delete(subject)
    db.commit()
    return {"message": f"Subject '{subject.name}' and its lectures deleted successfully."}


@router.get("/lectures")
def get_lectures_for_calendar(
    start: str | None = None,
    end: str | None = None,
    subject_id: str | None = None,
    db: Session = Depends(get_db)
):
    query = db.query(LectureDB)

    if subject_id:
        query = query.filter(LectureDB.subject_id == subject_id)

    if start:
        try:
            dt_start = datetime.fromisoformat(start).replace(tzinfo=None)
            query = query.filter(LectureDB.end_time >= dt_start)
        except (ValueError, TypeError) as e:
            logger.debug(f"Invalid start datetime filter '{start}': {e}")

    if end:
        try:
            dt_end = datetime.fromisoformat(end).replace(tzinfo=None)
            query = query.filter(LectureDB.start_time <= dt_end)
        except (ValueError, TypeError) as e:
            logger.debug(f"Invalid end datetime filter '{end}': {e}")

    lectures = query.order_by(LectureDB.start_time).all()
    calendar_events = []

    # Map previous lecture in same subject to establish task continuity
    subject_ids = {lec.subject_id for lec in lectures if lec.subject_id}
    all_subject_lecs = (
        db.query(LectureDB)
        .filter(LectureDB.subject_id.in_(subject_ids))
        .order_by(LectureDB.start_time)
        .all()
    ) if subject_ids else []

    from collections import defaultdict
    lecs_by_subject = defaultdict(list)
    for sl in all_subject_lecs:
        lecs_by_subject[sl.subject_id].append(sl)

    prev_lecture_map = {}
    for sid, s_lecs in lecs_by_subject.items():
        for i, curr_l in enumerate(s_lecs):
            if i > 0:
                prev_lecture_map[curr_l.id] = s_lecs[i - 1]

    for lec in lectures:
        subj = lec.subject
        meeting = lec.meetings[0] if lec.meetings else None

        # Tasks assigned in this lecture (for next lecture)
        assigned_tasks = [
            {
                "id": ai.id,
                "task": ai.task,
                "assignee": ai.assignee,
                "priority": ai.priority,
                "deadline": ai.deadline,
                "completed": ai.completed,
                "meeting_id": meeting.id if meeting else None
            }
            for ai in (meeting.action_items if meeting else [])
        ]

        # Tasks from previous lecture in the same subject (due for this lecture)
        prev_lec = prev_lecture_map.get(lec.id)
        prev_meeting = prev_lec.meetings[0] if (prev_lec and prev_lec.meetings) else None
        incoming_tasks = [
            {
                "id": ai.id,
                "task": ai.task,
                "assignee": ai.assignee,
                "priority": ai.priority,
                "deadline": ai.deadline,
                "completed": ai.completed,
                "from_lecture_id": prev_lec.id,
                "from_lecture_title": prev_lec.title,
                "meeting_id": prev_meeting.id if prev_meeting else None
            }
            for ai in (prev_meeting.action_items if prev_meeting else [])
        ]

        calendar_events.append({
            "id": lec.id,
            "title": lec.title,
            "start": lec.start_time.isoformat(),
            "end": lec.end_time.isoformat(),
            "backgroundColor": subj.color if subj else "#4f46e5",
            "borderColor": subj.color if subj else "#4f46e5",
            "textColor": "#ffffff",
            "extendedProps": {
                "subject_id": lec.subject_id,
                "subject_name": subj.name if subj else "General",
                "lecturer": subj.lecturer if subj else None,
                "room": lec.room,
                "meeting_link": lec.meeting_link,
                "description": lec.description,
                "has_recording": bool(meeting),
                "recording_id": meeting.id if meeting else None,
                "recording_status": meeting.status if meeting else None,
                "media_type": meeting.media_type if meeting else None,
                "action_items_count": len(assigned_tasks),
                "assigned_tasks": assigned_tasks,
                "incoming_tasks_count": len(incoming_tasks),
                "incoming_tasks": incoming_tasks,
                "has_tasks": bool(assigned_tasks or incoming_tasks)
            }
        })

    return calendar_events


@router.get("/lectures/{lecture_id}")
def get_lecture_detail(lecture_id: str, db: Session = Depends(get_db)):
    lec = db.query(LectureDB).filter(LectureDB.id == lecture_id).first()
    if not lec:
        raise HTTPException(status_code=404, detail="Lecture not found")

    subj = lec.subject
    meeting = lec.meetings[0] if lec.meetings else None

    # Find previous and next lecture in the subject chain
    prev_lec = None
    next_lec = None
    if subj and subj.lectures:
        sorted_chain = sorted(subj.lectures, key=lambda l: l.start_time)
        try:
            curr_idx = next(i for i, l in enumerate(sorted_chain) if l.id == lec.id)
            if curr_idx > 0:
                prev_lec = sorted_chain[curr_idx - 1]
            if curr_idx + 1 < len(sorted_chain):
                next_lec = sorted_chain[curr_idx + 1]
        except StopIteration:
            pass

    # Extract incoming tasks (from previous lecture due today)
    prev_meeting = prev_lec.meetings[0] if (prev_lec and prev_lec.meetings) else None
    incoming_tasks = [
        {
            "id": ai.id,
            "task": ai.task,
            "assignee": ai.assignee,
            "priority": ai.priority,
            "deadline": ai.deadline,
            "completed": ai.completed,
            "from_lecture_id": prev_lec.id,
            "from_lecture_title": prev_lec.title,
            "meeting_id": prev_meeting.id if prev_meeting else None
        }
        for ai in (prev_meeting.action_items if prev_meeting else [])
    ]

    # Extract assigned tasks (from this lecture for next lecture)
    assigned_tasks = [
        {
            "id": ai.id,
            "task": ai.task,
            "assignee": ai.assignee,
            "priority": ai.priority,
            "deadline": ai.deadline,
            "completed": ai.completed,
            "meeting_id": meeting.id if meeting else None
        }
        for ai in (meeting.action_items if meeting else [])
    ]

    meeting_data = None
    if meeting:
        meeting_data = {
            "id": meeting.id,
            "title": meeting.title,
            "platform": meeting.platform,
            "status": meeting.status,
            "duration_seconds": meeting.duration_seconds,
            "audio_filename": meeting.audio_filename,
            "video_filename": meeting.video_filename,
            "media_type": meeting.media_type,
            "google_drive_file_id": meeting.google_drive_file_id,
            "overview": meeting.overview,
            "executive_summary": meeting.executive_summary,
            "key_points": meeting.key_points,
            "decisions": meeting.decisions,
            "open_questions": meeting.open_questions,
            "markdown_content": meeting.markdown_content,
            "action_items": assigned_tasks,
            "transcript": [
                {
                    "id": ts.id,
                    "start": ts.start,
                    "end": ts.end,
                    "speaker": ts.speaker,
                    "text": ts.text
                }
                for ts in meeting.transcript_segments
            ]
        }

    # Infer adaptive status
    effective_status = (lec.status or "scheduled").lower()
    td_lower = f"{lec.title} {lec.description or ''}".lower()
    if any(w in td_lower for w in ["abgesagt", "entfällt", "cancelled", "ausfall"]):
        effective_status = "canceled"
    elif any(w in td_lower for w in ["verschoben", "verlegt", "postponed"]):
        effective_status = "postponed"
    elif lec.end_time < datetime.now(UTC).astimezone().replace(tzinfo=None) and effective_status == "scheduled":
        effective_status = "completed"

    return {
        "id": lec.id,
        "title": lec.title,
        "start_time": lec.start_time.isoformat(),
        "end_time": lec.end_time.isoformat(),
        "room": lec.room,
        "meeting_link": lec.meeting_link,
        "description": lec.description,
        "status": effective_status,
        "notes": lec.notes or "",
        "materials": lec.materials,
        "ai_summary_override": lec.ai_summary_override,
        "google_event_id": lec.google_event_id,
        "subject": {
            "id": subj.id,
            "name": subj.name,
            "lecturer": subj.lecturer,
            "color": subj.color
        } if subj else None,
        "recording": meeting_data,
        "previous_lecture": {
            "id": prev_lec.id,
            "title": prev_lec.title,
            "start_time": prev_lec.start_time.isoformat()
        } if prev_lec else None,
        "next_lecture": {
            "id": next_lec.id,
            "title": next_lec.title,
            "start_time": next_lec.start_time.isoformat()
        } if next_lec else None,
        "incoming_tasks": incoming_tasks,
        "assigned_tasks": assigned_tasks,
    }


@router.post("/lectures/{lecture_id}/action_items/{item_id}/toggle")
def toggle_lecture_action_item(lecture_id: str, item_id: int, db: Session = Depends(get_db)):
    """Toggle completion status for an action item attached to a lecture or its predecessor."""
    item = db.query(ActionItemDB).filter(ActionItemDB.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Action item not found")

    item.completed = not item.completed
    db.commit()
    return {"id": item.id, "completed": item.completed}



@router.patch("/lectures/{lecture_id}/status", dependencies=[Depends(require_admin)])
def update_lecture_status(lecture_id: str, payload: LectureStatusUpdate, db: Session = Depends(get_db)):
    lec = db.query(LectureDB).filter(LectureDB.id == lecture_id).first()
    if not lec:
        raise HTTPException(status_code=404, detail="Lecture not found")
    lec.status = payload.status
    db.commit()
    return {"message": "Status updated", "status": lec.status}


@router.patch("/lectures/{lecture_id}/notes", dependencies=[Depends(require_admin)])
def update_lecture_notes(lecture_id: str, payload: LectureNotesUpdate, db: Session = Depends(get_db)):
    lec = db.query(LectureDB).filter(LectureDB.id == lecture_id).first()
    if not lec:
        raise HTTPException(status_code=404, detail="Lecture not found")
    lec.notes = payload.notes
    db.commit()
    # Re-index into RAG
    RagService.index_lecture(db, lecture_id)
    return {"message": "Notes saved", "notes": lec.notes}


@router.post("/lectures/{lecture_id}/materials", dependencies=[Depends(require_admin)])
def add_lecture_material(lecture_id: str, payload: LectureMaterialCreate, db: Session = Depends(get_db)):
    lec = db.query(LectureDB).filter(LectureDB.id == lecture_id).first()
    if not lec:
        raise HTTPException(status_code=404, detail="Lecture not found")

    current_materials = lec.materials
    new_item = {
        "id": uuid.uuid4().hex[:10],
        "title": payload.title,
        "type": payload.type or "link",
        "url": payload.url,
        "created_at": datetime.now(UTC).isoformat()
    }
    current_materials.append(new_item)
    lec.materials = current_materials
    db.commit()
    # Re-index into RAG
    RagService.index_lecture(db, lecture_id)
    return {"message": "Material added", "material": new_item, "materials": current_materials}


@router.delete("/lectures/{lecture_id}/materials/{material_id}", dependencies=[Depends(require_admin)])
def delete_lecture_material(lecture_id: str, material_id: str, db: Session = Depends(get_db)):
    lec = db.query(LectureDB).filter(LectureDB.id == lecture_id).first()
    if not lec:
        raise HTTPException(status_code=404, detail="Lecture not found")

    current_materials = [m for m in lec.materials if m.get("id") != material_id]
    lec.materials = current_materials
    db.commit()
    # Re-index into RAG
    RagService.index_lecture(db, lecture_id)
    return {"message": "Material deleted", "materials": current_materials}


@router.post("/lectures/{lecture_id}/materials/upload", dependencies=[Depends(require_admin)])
def upload_lecture_material(
    lecture_id: str,
    file: UploadFile = File(...),
    material_type: str | None = Form(None),
    db: Session = Depends(get_db)
):
    lec = db.query(LectureDB).filter(LectureDB.id == lecture_id).first()
    if not lec:
        raise HTTPException(status_code=404, detail="Lecture not found")

    from app.services.material_service import save_lecture_material_file
    new_item = save_lecture_material_file(lecture_id, file, explicit_type=material_type)

    current_materials = lec.materials
    current_materials.append(new_item)
    lec.materials = current_materials

    # If uploaded file is a markdown summary, set as ai_summary_override if not already set
    if (
        new_item.get("type") == "summary_md"
        and new_item.get("text_content")
        and (not lec.ai_summary_override or len(lec.ai_summary_override.strip()) < 10)
    ):
        lec.ai_summary_override = new_item.get("text_content")

    db.commit()
    # Re-index into RAG
    RagService.index_lecture(db, lecture_id)
    return {"message": "Material uploaded and indexed", "material": new_item, "materials": current_materials}


@router.get("/materials/file/{lecture_id}/{filename}", dependencies=[Depends(require_auth)])
def get_material_file(lecture_id: str, filename: str):
    """Serve lecture material file with path traversal defense and authentication."""
    if "/" in lecture_id or "\\" in lecture_id or ".." in lecture_id:
        raise HTTPException(status_code=400, detail="Invalid lecture identifier")
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid material filename")

    base_materials_dir = MATERIALS_DIR.resolve()
    file_path = (MATERIALS_DIR / lecture_id / filename).resolve()

    try:
        is_safe = file_path.is_relative_to(base_materials_dir)
    except AttributeError:
        is_safe = str(file_path).startswith(str(base_materials_dir))

    if not is_safe or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(file_path, filename=filename)


@router.post("/lectures/{lecture_id}/generate-summary", dependencies=[Depends(require_admin)])
def generate_lecture_summary(
    lecture_id: str,
    payload: dict | None = Body(None),
    db: Session = Depends(get_db)
):
    from app.services.material_service import generate_lecture_master_summary
    custom_instructions = payload.get("custom_instructions") if payload else None
    return generate_lecture_master_summary(db, lecture_id, custom_instructions=custom_instructions)


def _serialize_lecture_event(lec: LectureDB) -> dict:
    subj = lec.subject
    meeting = lec.meetings[0] if lec.meetings else None
    return {
        "id": lec.id,
        "title": lec.title,
        "start": lec.start_time.isoformat(),
        "end": lec.end_time.isoformat(),
        "start_time": lec.start_time.isoformat(),
        "end_time": lec.end_time.isoformat(),
        "subject_name": subj.name if subj else "Lecture",
        "room": lec.room,
        "meeting_link": lec.meeting_link,
        "backgroundColor": subj.color if subj else "#4f46e5",
        "borderColor": subj.color if subj else "#4f46e5",
        "textColor": "#ffffff",
        "extendedProps": {
            "subject_id": lec.subject_id,
            "subject_name": subj.name if subj else "Lecture",
            "lecturer": subj.lecturer if subj else None,
            "room": lec.room,
            "meeting_link": lec.meeting_link,
            "description": lec.description or "",
            "has_recording": bool(meeting),
            "recording_id": meeting.id if meeting else None,
            "recording_status": meeting.status if meeting else None,
            "media_type": meeting.media_type if meeting else None,
            "action_items_count": len(meeting.action_items) if meeting else 0
        }
    }


@router.get("/current-or-upcoming")
def get_current_or_upcoming_lecture(db: Session = Depends(get_db)):
    now = datetime.now()
    window_end = now + timedelta(hours=4)

    current = db.query(LectureDB).filter(
        LectureDB.start_time <= (now + timedelta(minutes=10)),
        LectureDB.end_time >= (now - timedelta(minutes=10))
    ).order_by(LectureDB.start_time).first()

    if current:
        return {
            "status": "in_progress",
            "lecture": _serialize_lecture_event(current)
        }

    upcoming = db.query(LectureDB).filter(
        LectureDB.start_time > now,
        LectureDB.start_time <= window_end
    ).order_by(LectureDB.start_time).first()

    if upcoming:
        return {
            "status": "upcoming",
            "lecture": _serialize_lecture_event(upcoming)
        }

    return {"status": "none", "lecture": None}
