from datetime import datetime
from typing import Any
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import require_admin
from app.models.db import ActionItemDB, LectureDB, MeetingDB
from app.services.google.auth import (
    disconnect_google,
    exchange_code_and_store,
    generate_auth_url,
    is_google_connected,
)
from app.services.google.calendar_sync import (
    sync_all_lectures_to_google,
    sync_lecture_to_google,
)
from app.services.google.drive_sync import backup_meeting_to_google_drive
from app.services.google.tasks_sync import (
    list_google_tasks,
    pull_google_tasks_status,
    sync_action_items_to_google_tasks,
    sync_all_action_items_to_google_tasks,
    sync_jira_tasks_to_google_tasks,
    update_google_task_status,
)

router = APIRouter(prefix="/google", tags=["google"])


class CreateActionItemRequest(BaseModel):
    task: str = Field(..., min_length=2)
    meeting_id: str | None = None
    priority: str = "Medium"
    deadline: str | None = None
    due_date: str | None = None
    subject_name: str | None = None
    assignee: str = "Student"


@router.get("/status")
def get_google_status(db: Session = Depends(get_db)):
    connected, email = is_google_connected(db)
    settings = get_settings()
    return {
        "connected": connected,
        "email": email,
        "has_credentials": bool(settings.google_client_id and settings.google_client_secret),
        "auto_sync_calendar": settings.google_auto_sync_calendar,
        "auto_sync_tasks": settings.google_auto_sync_tasks,
        "auto_sync_drive": settings.google_auto_sync_drive,
    }


@router.get("/login")
def google_login():
    try:
        auth_url = generate_auth_url()
        return {"auth_url": auth_url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/oauth2callback")
def google_oauth_callback(
    code: str = Query(...),
    state: str = Query(None),
    db: Session = Depends(get_db),
):
    try:
        exchange_code_and_store(db, code, state=state)
        return RedirectResponse(url="/?google_connected=true")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Authentication error: {e}") from e


@router.post("/disconnect", dependencies=[Depends(require_admin)])
def google_disconnect(db: Session = Depends(get_db)):
    success = disconnect_google(db)
    return {"message": "Google account disconnected", "disconnected": success}


# ==================== CALENDAR SYNC ====================


@router.post("/sync-calendar", dependencies=[Depends(require_admin)])
def sync_calendar_all(db: Session = Depends(get_db)):
    try:
        result = sync_all_lectures_to_google(db)
        return {"message": f"Synced {result['synced']} lectures to Google Calendar", **result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/sync-lecture/{lecture_id}", dependencies=[Depends(require_admin)])
def sync_single_lecture(lecture_id: str, db: Session = Depends(get_db)):
    lec = db.query(LectureDB).filter(LectureDB.id == lecture_id).first()
    if not lec:
        raise HTTPException(status_code=404, detail="Lecture not found")
    try:
        result = sync_lecture_to_google(db, lec)
        return {"message": "Lecture pushed to Google Calendar", **result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ==================== GOOGLE TASKS SYNC ====================


@router.post("/sync-tasks", dependencies=[Depends(require_admin)])
def sync_all_tasks(db: Session = Depends(get_db)):
    """Sync all academic action items / homework across all lectures into Google Tasks with RFC 3339 due dates."""
    try:
        result = sync_all_action_items_to_google_tasks(db)
        return {
            "message": f"Successfully synced {result['created_count'] + result['updated_count']} tasks to Google Tasks (created {result['created_count']}, updated {result['updated_count']}).",
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/sync-tasks/{meeting_id}", dependencies=[Depends(require_admin)])
def sync_tasks_for_meeting(meeting_id: str, db: Session = Depends(get_db)):
    """Sync action items for a single meeting to Google Tasks."""
    m = db.query(MeetingDB).filter(MeetingDB.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    try:
        result = sync_action_items_to_google_tasks(db, m)
        return {"message": f"Exported {result['synced_count']} action items to Google Tasks", **result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/sync-jira-tasks", dependencies=[Depends(require_admin)])
def sync_jira_tasks(project_id: str | None = None, db: Session = Depends(get_db)):
    """Sync scheduled Jira Automation tasks with due dates to Google Tasks."""
    try:
        result = sync_jira_tasks_to_google_tasks(db, project_id=project_id)
        return {
            "message": f"Synced {result['created_count'] + result['updated_count']} Jira tasks to Google Tasks.",
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/pull-tasks", dependencies=[Depends(require_admin)])
def pull_tasks_from_google(db: Session = Depends(get_db)):
    """Bi-directional sync: pull task completion states from Google Tasks back into database."""
    try:
        result = pull_google_tasks_status(db)
        return {
            "message": f"Updated {result['updated_count']} tasks from Google Tasks.",
            **result,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/tasks")
def get_remote_google_tasks(list_title: str = "DHBW Homework & Tasks", db: Session = Depends(get_db)):
    """Fetch tasks directly from Google Tasks list."""
    try:
        tasks = list_google_tasks(db, list_title=list_title)
        return tasks
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ==================== LOCAL ACTION ITEMS & HOMEWORK ====================


@router.get("/action-items")
def list_all_action_items(db: Session = Depends(get_db)):
    """List all action items / homework assignments with lecture and subject details."""
    items = db.query(ActionItemDB).order_by(ActionItemDB.id.desc()).all()
    results = []
    for ai in items:
        m = ai.meeting
        lec = m.lecture if m else None
        sub = lec.subject if lec else None
        results.append({
            "id": ai.id,
            "meeting_id": ai.meeting_id,
            "task": ai.task,
            "assignee": ai.assignee,
            "priority": ai.priority,
            "deadline": ai.deadline,
            "due_date": ai.due_date.isoformat() if ai.due_date else None,
            "completed": ai.completed,
            "google_task_id": ai.google_task_id,
            "lecture_title": lec.title if lec else (m.title if m else None),
            "subject_name": sub.name if sub else None,
            "subject_color": sub.color if sub else "#6366f1",
        })
    return results


@router.post("/action-items", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_custom_action_item(data: CreateActionItemRequest, db: Session = Depends(get_db)):
    """Create a new action item or homework assignment, and auto-sync to Google Tasks if connected."""
    parsed_due_date = None
    if data.due_date:
        try:
            parsed_due_date = datetime.fromisoformat(data.due_date.replace("Z", "+00:00"))
        except Exception:
            pass

    meeting_id = data.meeting_id
    if not meeting_id and data.subject_name:
        from app.models.db import SubjectDB, LectureDB
        sub = db.query(SubjectDB).filter(SubjectDB.name == data.subject_name).first()
        if sub:
            lec = db.query(LectureDB).filter(LectureDB.subject_id == sub.id).order_by(LectureDB.start_time.desc()).first()
            if lec:
                if lec.meetings and len(lec.meetings) > 0:
                    meeting_id = lec.meetings[0].id
                else:
                    new_m = MeetingDB(id=f"meet_{uuid4().hex[:16]}", title=lec.title, lecture_id=lec.id)
                    db.add(new_m)
                    db.commit()
                    db.refresh(new_m)
                    meeting_id = new_m.id

    if not meeting_id:
        # Link to most recent meeting or create a default meeting
        recent_m = db.query(MeetingDB).order_by(MeetingDB.created_at.desc()).first()
        if recent_m:
            meeting_id = recent_m.id
        else:
            new_m = MeetingDB(id=f"meet_{uuid4().hex[:16]}", title="General Study Tasks")
            db.add(new_m)
            db.commit()
            db.refresh(new_m)
            meeting_id = new_m.id

    ai = ActionItemDB(
        meeting_id=meeting_id,
        task=data.task.strip(),
        assignee=data.assignee.strip(),
        priority=data.priority,
        deadline=data.deadline.strip() if data.deadline else None,
        due_date=parsed_due_date,
        completed=False,
    )
    db.add(ai)
    db.commit()
    db.refresh(ai)

    # If Google connected, sync to Google Tasks immediately
    connected, _ = is_google_connected(db)
    if connected:
        try:
            m = ai.meeting
            if m:
                sync_action_items_to_google_tasks(db, m)
                db.refresh(ai)
        except Exception:
            pass

    m = ai.meeting
    lec = m.lecture if m else None
    sub = lec.subject if lec else None

    return {
        "id": ai.id,
        "meeting_id": ai.meeting_id,
        "task": ai.task,
        "assignee": ai.assignee,
        "priority": ai.priority,
        "deadline": ai.deadline,
        "due_date": ai.due_date.isoformat() if ai.due_date else None,
        "completed": ai.completed,
        "google_task_id": ai.google_task_id,
        "lecture_title": lec.title if lec else (m.title if m else None),
        "subject_name": sub.name if sub else data.subject_name,
        "subject_color": sub.color if sub else "#6366f1",
    }


@router.post("/action-items/{item_id}/toggle", dependencies=[Depends(require_admin)])
def toggle_action_item(item_id: int, db: Session = Depends(get_db)):
    """Toggle action item completion status and update Google Tasks in real-time."""
    ai = db.query(ActionItemDB).filter(ActionItemDB.id == item_id).first()
    if not ai:
        raise HTTPException(status_code=404, detail="Action item not found")

    ai.completed = not ai.completed
    db.commit()

    # Update Google Tasks in background if connected and has google_task_id
    if ai.google_task_id:
        try:
            update_google_task_status(db, ai.google_task_id, ai.completed)
        except Exception:
            pass

    return {"id": ai.id, "completed": ai.completed, "google_task_id": ai.google_task_id}


@router.delete("/action-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_action_item(item_id: int, db: Session = Depends(get_db)):
    """Delete an action item."""
    ai = db.query(ActionItemDB).filter(ActionItemDB.id == item_id).first()
    if ai:
        db.delete(ai)
        db.commit()
    return None


# ==================== GOOGLE DRIVE BACKUP ====================


@router.post("/backup-drive/{meeting_id}", dependencies=[Depends(require_admin)])
def backup_drive(meeting_id: str, db: Session = Depends(get_db)):
    m = db.query(MeetingDB).filter(MeetingDB.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    try:
        result = backup_meeting_to_google_drive(db, m)
        return {"message": "Backed up study notes and media to Google Drive", **result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
