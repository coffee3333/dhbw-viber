from datetime import datetime
from typing import Any

from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.core.logger import get_logger
from app.models.db import LectureDB
from app.services.google.auth import get_valid_google_credentials

logger = get_logger("meeting_agent.google.calendar")

def get_or_create_dhbw_google_calendar(service) -> str:
    """Find or create dedicated 'DHBW Timetable' secondary calendar."""
    try:
        calendar_list = service.calendarList().list().execute()
        for item in calendar_list.get("items", []):
            if item.get("summary") == "DHBW Timetable":
                return item.get("id")

        # Create new secondary calendar
        new_cal = {
            "summary": "DHBW Timetable",
            "description": "Synced university schedule, lectures, and study sessions from MeetingAgent",
            "timeZone": "Europe/Berlin"
        }
        created = service.calendars().insert(body=new_cal).execute()
        return created.get("id")
    except Exception as e:
        logger.warning(f"Error accessing Google calendar list: {e}. Falling back to primary calendar.")
        return "primary"


def sync_lecture_to_google(db: Session, lecture: LectureDB) -> dict[str, Any]:
    """Sync a single lecture to Google Calendar."""
    creds = get_valid_google_credentials(db)
    if not creds:
        raise ValueError("Google account not connected. Please authenticate via Google Workspace settings.")

    service = build("calendar", "v3", credentials=creds)
    calendar_id = get_or_create_dhbw_google_calendar(service)

    description = f"Subject: {lecture.subject.name if lecture.subject else 'Lecture'}\n"
    if lecture.subject and lecture.subject.lecturer:
        description += f"Lecturer: {lecture.subject.lecturer}\n"
    if lecture.room:
        description += f"Room: {lecture.room}\n"
    if lecture.meeting_link:
        description += f"Online Meeting: {lecture.meeting_link}\n"
    if lecture.description:
        description += f"\nNotes:\n{lecture.description}\n"

    event_body = {
        "summary": lecture.title,
        "location": lecture.room or (lecture.meeting_link or ""),
        "description": description,
        "start": {
            "dateTime": lecture.start_time.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": "Europe/Berlin"
        },
        "end": {
            "dateTime": lecture.end_time.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": "Europe/Berlin"
        },
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "popup", "minutes": 15},
                {"method": "popup", "minutes": 60}
            ]
        }
    }

    if lecture.google_event_id:
        try:
            event = service.events().update(
                calendarId=calendar_id,
                eventId=lecture.google_event_id,
                body=event_body
            ).execute()
            return {"status": "updated", "google_event_id": event.get("id"), "link": event.get("htmlLink")}
        except Exception as e:
            # If update fails (e.g. event deleted on Google), create fresh
            logger.info(f"Could not update Google event {lecture.google_event_id}, recreating: {e}")

    event = service.events().insert(
        calendarId=calendar_id,
        body=event_body
    ).execute()

    lecture.google_event_id = event.get("id")
    db.commit()

    return {"status": "created", "google_event_id": event.get("id"), "link": event.get("htmlLink")}


def sync_all_lectures_to_google(db: Session, max_events: int = 50) -> dict[str, Any]:
    """Sync all upcoming lectures to Google Calendar."""
    creds = get_valid_google_credentials(db)
    if not creds:
        raise ValueError("Google account not connected.")

    now = datetime.now().astimezone().replace(tzinfo=None)
    lectures = db.query(LectureDB).filter(LectureDB.end_time >= now).order_by(LectureDB.start_time).limit(max_events).all()

    synced_count = 0
    errors = 0
    for lec in lectures:
        try:
            sync_lecture_to_google(db, lec)
            synced_count += 1
        except Exception as e:
            logger.error(f"Error syncing lecture {lec.id} to Google: {e}")
            errors += 1

    return {"synced": synced_count, "errors": errors, "total": len(lectures)}
