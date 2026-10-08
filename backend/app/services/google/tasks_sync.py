"""Google Tasks synchronization service for Academic Action Items & Jira Automation Tasks."""
from datetime import UTC, datetime, timedelta
from typing import Any
import dateutil.parser
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.core.logger import get_logger
from app.models.db import ActionItemDB, MeetingDB
from app.models.jira_automation import AutomationTaskDB
from app.services.google.auth import get_valid_google_credentials

logger = get_logger("meeting_agent.google.tasks")


def parse_due_date_to_rfc3339(deadline_str: str | None, fallback_dt: datetime | None = None) -> str | None:
    """
    Parse informal or formatted deadline strings into RFC 3339 format required by Google Tasks.
    Google Tasks requires UTC date with time set to 00:00:00.000Z to render on Google Calendar.
    """
    if not deadline_str or not deadline_str.strip():
        if fallback_dt:
            return fallback_dt.strftime("%Y-%m-%dT00:00:00.000Z")
        return None

    raw = deadline_str.strip().lower()
    now = datetime.now(UTC)

    # Relative keyword matching
    if "tomorrow" in raw:
        target = now + timedelta(days=1)
        return target.strftime("%Y-%m-%dT00:00:00.000Z")
    if "today" in raw:
        return now.strftime("%Y-%m-%dT00:00:00.000Z")
    if "next week" in raw:
        target = now + timedelta(days=7)
        return target.strftime("%Y-%m-%dT00:00:00.000Z")
    if "in 2 days" in raw or "in two days" in raw:
        target = now + timedelta(days=2)
        return target.strftime("%Y-%m-%dT00:00:00.000Z")
    if "in 3 days" in raw or "in three days" in raw:
        target = now + timedelta(days=3)
        return target.strftime("%Y-%m-%dT00:00:00.000Z")

    try:
        dt = dateutil.parser.parse(raw, fuzzy=True)
        return dt.strftime("%Y-%m-%dT00:00:00.000Z")
    except Exception:
        if fallback_dt:
            return fallback_dt.strftime("%Y-%m-%dT00:00:00.000Z")
        return None


def get_or_create_task_list(service, list_title: str = "DHBW Homework & Tasks") -> str:
    """Find or create dedicated task list in user's Google Tasks."""
    try:
        lists = service.tasklists().list(maxResults=50).execute()
        for item in lists.get("items", []):
            if item.get("title", "").strip().lower() == list_title.strip().lower():
                return item.get("id")

        new_list = {"title": list_title}
        created = service.tasklists().insert(body=new_list).execute()
        return created.get("id")
    except Exception as e:
        logger.warning(f"Error managing Google Task list '{list_title}': {e}. Falling back to default list.")
        return "@default"


def sync_action_items_to_google_tasks(db: Session, meeting: MeetingDB) -> dict[str, Any]:
    """Sync action items from a single meeting/lecture into Google Tasks with calendar due dates."""
    creds = get_valid_google_credentials(db)
    if not creds:
        raise ValueError("Google account not connected. Please authenticate via Settings.")

    service = build("tasks", "v1", credentials=creds)
    task_list_id = get_or_create_task_list(service, "DHBW Homework & Tasks")

    lecture_title = meeting.title
    subject_name = ""
    fallback_due: datetime | None = None

    if meeting.lecture:
        lecture_title = meeting.lecture.title or meeting.title
        if meeting.lecture.subject:
            subject_name = f" [{meeting.lecture.subject.name}]"
        # If no explicit deadline, set fallback due date to 7 days from lecture
        if meeting.lecture.end_time:
            fallback_due = meeting.lecture.end_time + timedelta(days=7)

    synced_items = []
    created_count = 0
    updated_count = 0

    for ai in meeting.action_items:
        rfc3339_due = parse_due_date_to_rfc3339(ai.deadline, fallback_due)

        notes_lines = [
            f"Lecture: {lecture_title}{subject_name}",
            f"Priority: {ai.priority or 'Medium'}",
            f"Assigned to: {ai.assignee or 'Students'}",
        ]
        if ai.deadline:
            notes_lines.append(f"Announced Deadline: {ai.deadline}")

        task_body: dict[str, Any] = {
            "title": f"{ai.task}{subject_name}",
            "notes": "\n".join(notes_lines),
            "status": "completed" if ai.completed else "needsAction",
        }
        if rfc3339_due:
            task_body["due"] = rfc3339_due

        if ai.google_task_id:
            try:
                updated = service.tasks().update(
                    tasklist=task_list_id,
                    task=ai.google_task_id,
                    body={**task_body, "id": ai.google_task_id},
                ).execute()
                synced_items.append({"id": ai.id, "google_task_id": updated.get("id"), "status": "updated"})
                updated_count += 1
                continue
            except Exception as e:
                logger.info(f"Could not update Google task {ai.google_task_id}, creating new: {e}")

        created = service.tasks().insert(tasklist=task_list_id, body=task_body).execute()
        ai.google_task_id = created.get("id")
        synced_items.append({"id": ai.id, "google_task_id": created.get("id"), "status": "created"})
        created_count += 1

    db.commit()
    return {
        "synced_count": len(synced_items),
        "created_count": created_count,
        "updated_count": updated_count,
        "tasks": synced_items,
    }


def sync_all_action_items_to_google_tasks(db: Session) -> dict[str, Any]:
    """Sync all action items across all meetings in the platform to Google Tasks."""
    creds = get_valid_google_credentials(db)
    if not creds:
        raise ValueError("Google account not connected. Please authenticate via Settings.")

    service = build("tasks", "v1", credentials=creds)
    task_list_id = get_or_create_task_list(service, "DHBW Homework & Tasks")

    items = db.query(ActionItemDB).all()
    created_count = 0
    updated_count = 0
    errors_count = 0

    for ai in items:
        meeting = ai.meeting
        fallback_due: datetime | None = None
        subject_name = ""
        lecture_title = meeting.title if meeting else "Study Task"

        if meeting and meeting.lecture:
            lecture_title = meeting.lecture.title or meeting.title
            if meeting.lecture.subject:
                subject_name = f" [{meeting.lecture.subject.name}]"
            if meeting.lecture.end_time:
                fallback_due = meeting.lecture.end_time + timedelta(days=7)

        rfc3339_due = parse_due_date_to_rfc3339(ai.deadline, fallback_due)

        notes_lines = [
            f"Lecture: {lecture_title}{subject_name}",
            f"Priority: {ai.priority or 'Medium'}",
            f"Assigned to: {ai.assignee or 'Students'}",
        ]
        if ai.deadline:
            notes_lines.append(f"Announced Deadline: {ai.deadline}")

        task_body: dict[str, Any] = {
            "title": f"{ai.task}{subject_name}",
            "notes": "\n".join(notes_lines),
            "status": "completed" if ai.completed else "needsAction",
        }
        if rfc3339_due:
            task_body["due"] = rfc3339_due

        try:
            if ai.google_task_id:
                try:
                    service.tasks().update(
                        tasklist=task_list_id,
                        task=ai.google_task_id,
                        body={**task_body, "id": ai.google_task_id},
                    ).execute()
                    updated_count += 1
                    continue
                except Exception:
                    pass

            created = service.tasks().insert(tasklist=task_list_id, body=task_body).execute()
            ai.google_task_id = created.get("id")
            created_count += 1
        except Exception as e:
            logger.warning(f"Error syncing action item {ai.id} to Google Tasks: {e}")
            errors_count += 1

    db.commit()
    return {
        "status": "success",
        "total_items": len(items),
        "created_count": created_count,
        "updated_count": updated_count,
        "errors_count": errors_count,
        "task_list_id": task_list_id,
    }


def sync_jira_tasks_to_google_tasks(db: Session, project_id: str | None = None) -> dict[str, Any]:
    """Sync Jira & Git Automation tasks to Google Tasks so they appear on Google Calendar."""
    creds = get_valid_google_credentials(db)
    if not creds:
        raise ValueError("Google account not connected. Please authenticate via Settings.")

    service = build("tasks", "v1", credentials=creds)
    task_list_id = get_or_create_task_list(service, "Jira Automation Tasks")

    query = db.query(AutomationTaskDB)
    if project_id:
        query = query.join(AutomationTaskDB.sprint).filter(AutomationTaskDB.sprint.has(project_id=project_id))

    tasks = query.all()
    created_count = 0
    updated_count = 0

    for t in tasks:
        # Determine due date
        due_dt = t.due_date
        if not due_dt and t.sprint and t.sprint.end_date:
            due_dt = t.sprint.end_date

        rfc3339_due = due_dt.strftime("%Y-%m-%dT00:00:00.000Z") if due_dt else None

        assignee_name = t.assignee.display_name if t.assignee else "Unassigned"
        sprint_name = t.sprint.name if t.sprint else "Sprint"
        project_name = t.sprint.project.name if t.sprint and t.sprint.project else "Project"

        key_prefix = f"[{t.jira_issue_key}] " if t.jira_issue_key else ""
        title = f"{key_prefix}{t.title}"

        notes = (
            f"Project: {project_name}\n"
            f"Sprint: {sprint_name}\n"
            f"Status: {t.current_status}\n"
            f"Priority: {t.priority}\n"
            f"Assignee: {assignee_name}\n"
            f"Points: {t.story_points or '-'}"
        )

        is_done = t.current_status.lower() in ("done", "closed")
        task_body: dict[str, Any] = {
            "title": title,
            "notes": notes,
            "status": "completed" if is_done else "needsAction",
        }
        if rfc3339_due:
            task_body["due"] = rfc3339_due

        try:
            if t.google_task_id:
                try:
                    service.tasks().update(
                        tasklist=task_list_id,
                        task=t.google_task_id,
                        body={**task_body, "id": t.google_task_id},
                    ).execute()
                    updated_count += 1
                    continue
                except Exception:
                    pass

            created = service.tasks().insert(tasklist=task_list_id, body=task_body).execute()
            t.google_task_id = created.get("id")
            created_count += 1
        except Exception as e:
            logger.warning(f"Error syncing Jira task {t.id} to Google Tasks: {e}")

    db.commit()
    return {
        "status": "success",
        "total_tasks": len(tasks),
        "created_count": created_count,
        "updated_count": updated_count,
        "task_list_id": task_list_id,
    }


def update_google_task_status(
    db: Session,
    google_task_id: str,
    completed: bool,
    list_title: str = "DHBW Homework & Tasks",
) -> bool:
    """Instantly update the status of a single Google Task when toggled in the UI."""
    try:
        creds = get_valid_google_credentials(db)
        if not creds:
            return False

        service = build("tasks", "v1", credentials=creds)
        task_list_id = get_or_create_task_list(service, list_title)

        status_str = "completed" if completed else "needsAction"
        service.tasks().patch(
            tasklist=task_list_id,
            task=google_task_id,
            body={"status": status_str},
        ).execute()
        return True
    except Exception as e:
        logger.warning(f"Failed to update Google Task status for {google_task_id}: {e}")
        return False


def pull_google_tasks_status(db: Session, list_title: str = "DHBW Homework & Tasks") -> dict[str, Any]:
    """Bi-directional sync: pull completion status from Google Tasks back into database."""
    creds = get_valid_google_credentials(db)
    if not creds:
        raise ValueError("Google account not connected.")

    service = build("tasks", "v1", credentials=creds)
    task_list_id = get_or_create_task_list(service, list_title)

    try:
        res = service.tasks().list(tasklist=task_list_id, showCompleted=True, maxResults=100).execute()
        remote_tasks = res.get("items", [])
    except Exception as e:
        logger.error(f"Error fetching Google Tasks: {e}")
        return {"updated_count": 0, "error": str(e)}

    updated_count = 0
    for rt in remote_tasks:
        gt_id = rt.get("id")
        gt_status = rt.get("status")  # "completed" or "needsAction"
        is_completed = gt_status == "completed"

        # Check action items
        ai = db.query(ActionItemDB).filter(ActionItemDB.google_task_id == gt_id).first()
        if ai and ai.completed != is_completed:
            ai.completed = is_completed
            updated_count += 1

        # Check automation tasks
        at = db.query(AutomationTaskDB).filter(AutomationTaskDB.google_task_id == gt_id).first()
        if at and is_completed and at.current_status.lower() != "done":
            at.current_status = "Done"
            updated_count += 1

    db.commit()
    return {"status": "success", "updated_count": updated_count, "total_remote": len(remote_tasks)}


def list_google_tasks(db: Session, list_title: str = "DHBW Homework & Tasks") -> list[dict[str, Any]]:
    """List all tasks directly from user's Google Tasks."""
    creds = get_valid_google_credentials(db)
    if not creds:
        return []

    service = build("tasks", "v1", credentials=creds)
    task_list_id = get_or_create_task_list(service, list_title)

    try:
        res = service.tasks().list(tasklist=task_list_id, showCompleted=True, maxResults=100).execute()
        items = res.get("items", [])
        return [
            {
                "id": t.get("id"),
                "title": t.get("title"),
                "notes": t.get("notes"),
                "due": t.get("due"),
                "status": t.get("status"),
                "updated": t.get("updated"),
            }
            for t in items
        ]
    except Exception as e:
        logger.error(f"Failed to list Google Tasks: {e}")
        return []
