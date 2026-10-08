import re
import urllib.parse
import urllib.request
from datetime import UTC, date, datetime, timedelta
from typing import Any

import icalendar
import recurring_ical_events
from sqlalchemy.orm import Session

from app.models.db import LectureDB, SubjectDB

# Google Calendar-style distinct colors for subjects
CALENDAR_PALETTE = [
    "#4f46e5",  # Indigo
    "#0ea5e9",  # Sky Blue
    "#10b981",  # Emerald Green
    "#f59e0b",  # Amber / Orange
    "#8b5cf6",  # Violet
    "#ec4899",  # Pink
    "#06b6d4",  # Cyan
    "#14b8a6",  # Teal
    "#f43f5e",  # Rose
    "#84cc16",  # Lime Green
    "#64748b",  # Slate
]

# Common meeting URL regex (Zoom, Teams, Moodle BBB, Google Meet, Webex)
MEETING_URL_PATTERN = re.compile(
    r'(https?://[^\s<>"]*(?:zoom\.us|teams\.microsoft\.com|moodle|bigbluebutton|meet\.google\.com|webex\.com)[^\s<>"]*)',
    re.IGNORECASE
)

# Common DHBW course cohort prefix regex (e.g. WWI22SEB, TIT21, TINF20A, T3INF2001, etc.)
COHORT_PREFIX_PATTERN = re.compile(
    r'^[A-Z0-9]{4,12}\s*[-–:]*\s*',
    re.IGNORECASE
)

# Lecturer pattern: Prof. Dr. Schmidt, Dr. Weber, etc.
LECTURER_PATTERN = re.compile(
    r'((?:(?:Prof\.|Professor|PD|Dr\.)\s*)+[A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)?)',
    re.IGNORECASE
)


def fetch_ical_from_url(url: str) -> str:
    """Fetch raw iCal string from URL (handles webcal:// and headers)."""
    clean_url = url.strip()
    if clean_url.startswith("webcal://"):
        clean_url = "https://" + clean_url[9:]
    elif clean_url.startswith("http://"):
        clean_url = "https://" + clean_url[7:]

    req = urllib.request.Request(
        clean_url,
        headers={"User-Agent": "MeetingAgent-StudentManager/1.0 (DHBW Schedule Sync)"}
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        content = response.read()
        return content.decode("utf-8", errors="replace")


def parse_dhbw_event_details(summary: str, location: str = "", description: str = "") -> tuple[str, str | None, str | None, str | None]:
    """
    Extract (clean_subject_title, lecturer, room, meeting_link)
    from DHBW Rapla/Vorlesungsplan entries.
    """
    combined_text = f"{summary}\n{location}\n{description}"

    # 1. Search for online meeting link (Zoom, Teams, BBB)
    link_match = MEETING_URL_PATTERN.search(combined_text)
    meeting_link = link_match.group(1).rstrip('.,;)') if link_match else None

    # 2. Extract Lecturer
    lecturer = None
    lecturer_match = LECTURER_PATTERN.search(summary) or LECTURER_PATTERN.search(description)
    if lecturer_match:
        lecturer = lecturer_match.group(1).strip()

    # 3. Clean Subject Name
    # Remove cohort code (e.g. WWI22SEB, T3INF2001)
    clean_title = COHORT_PREFIX_PATTERN.sub('', summary).strip()

    # Remove lecturer name from title if present
    if lecturer:
        clean_title = clean_title.replace(f"({lecturer})", "")
        clean_title = clean_title.replace(lecturer, "")

    # Clean leftover punctuation, brackets and separators
    clean_title = re.sub(r'[\(\[\{].*?[\)\]\}]', '', clean_title).strip()
    clean_title = re.sub(r'[-–:]\s*$', '', clean_title).strip()
    clean_title = re.sub(r'^[-–:]\s*', '', clean_title).strip()
    clean_title = re.sub(r'\s+', ' ', clean_title)

    if not clean_title or len(clean_title) < 2:
        clean_title = summary.strip() or "General Lecture"

    # 4. Extract Room / Location
    room = location.strip() if location else None
    if not room and "Raum" in summary:
        room_match = re.search(r'(Raum\s*[A-Za-z0-9\.\-]+)', summary, re.IGNORECASE)
        if room_match:
            room = room_match.group(1)

    return clean_title, lecturer, room, meeting_link


def sync_calendar_events(
    db: Session,
    ical_content: str,
    days_back: int = 14,
    days_forward: int = 90
) -> dict[str, Any]:
    """
    Parse iCal content, expanding recurring events between [now - days_back, now + days_forward],
    and upsert Subjects and Lectures into the database.
    """
    cal = icalendar.Calendar.from_ical(ical_content)
    now = datetime.now(UTC).astimezone().replace(tzinfo=None)
    start_range = now - timedelta(days=days_back)
    end_range = now + timedelta(days=days_forward)

    # Use recurring-ical-events to expand any repeating schedules
    events = recurring_ical_events.of(cal).between(start_range, end_range)

    # Map of existing subjects by lowercase name
    existing_subjects = {s.name.lower(): s for s in db.query(SubjectDB).all()}
    palette_index = len(existing_subjects) % len(CALENDAR_PALETTE)

    subjects_created = 0
    lectures_synced = 0

    for event in events:
        summary = str(event.get("SUMMARY", "")).strip()
        if not summary:
            continue

        raw_location = str(event.get("LOCATION", "")).strip()
        raw_description = str(event.get("DESCRIPTION", "")).strip()
        uid = str(event.get("UID", ""))

        dtstart = event.get("DTSTART").dt
        dtend = event.get("DTEND").dt if event.get("DTEND") else dtstart + timedelta(hours=1, minutes=30)

        # Normalize to naive datetime
        if isinstance(dtstart, datetime):
            start_time = dtstart.replace(tzinfo=None) if dtstart.tzinfo else dtstart
        elif isinstance(dtstart, date):
            start_time = datetime.combine(dtstart, datetime.min.time())
        else:
            continue

        if isinstance(dtend, datetime):
            end_time = dtend.replace(tzinfo=None) if dtend.tzinfo else dtend
        elif isinstance(dtend, date):
            end_time = datetime.combine(dtend, datetime.min.time())
        else:
            end_time = start_time + timedelta(hours=1, minutes=30)

        # Parse DHBW subject, lecturer, room, link
        subject_name, lecturer, room, meeting_link = parse_dhbw_event_details(
            summary=summary,
            location=raw_location,
            description=raw_description
        )

        # 1. Upsert Subject
        norm_subj_name = subject_name.lower()
        if norm_subj_name in existing_subjects:
            subject = existing_subjects[norm_subj_name]
            if lecturer and not subject.lecturer:
                subject.lecturer = lecturer
        else:
            subject_id = f"subj_{re.sub(r'[^a-zA-Z0-9]+', '_', norm_subj_name).strip('_')[:30]}_{len(existing_subjects)+1}"
            subject_color = CALENDAR_PALETTE[palette_index % len(CALENDAR_PALETTE)]
            palette_index += 1

            subject = SubjectDB(
                id=subject_id,
                name=subject_name,
                lecturer=lecturer,
                color=subject_color
            )
            db.add(subject)
            db.flush()
            existing_subjects[norm_subj_name] = subject
            subjects_created += 1

        # 2. Upsert Lecture
        # Deterministic lecture ID based on UID or timestamp + subject
        lecture_id = f"lec_{start_time.strftime('%Y%m%d%H%M')}_{subject.id[:12]}"
        existing_lecture = db.query(LectureDB).filter(
            (LectureDB.id == lecture_id) | (LectureDB.external_uid == uid if uid else False)
        ).first()

        if existing_lecture:
            existing_lecture.title = summary
            existing_lecture.start_time = start_time
            existing_lecture.end_time = end_time
            if room:
                existing_lecture.room = room
            if meeting_link:
                existing_lecture.meeting_link = meeting_link
            if raw_description:
                existing_lecture.description = raw_description
        else:
            lecture = LectureDB(
                id=lecture_id,
                subject_id=subject.id,
                external_uid=uid or lecture_id,
                title=summary,
                start_time=start_time,
                end_time=end_time,
                room=room,
                meeting_link=meeting_link,
                description=raw_description
            )
            db.add(lecture)

        lectures_synced += 1

    db.commit()

    # Automatically merge split lecture sessions on the same day (15, 20, 30 min breaks)
    merged_count = merge_adjacent_lectures(db, max_gap_minutes=35)

    return {
        "subjects_created": subjects_created,
        "total_subjects": len(existing_subjects),
        "lectures_synced": lectures_synced,
        "lectures_merged": merged_count
    }


def merge_adjacent_lectures(db: Session, max_gap_minutes: int = 35) -> int:
    """
    Merge split lecture periods occurring on the same day for the same subject
    where the break between periods is <= max_gap_minutes (e.g. 15, 20, 30 min recess).
    """
    from app.models.db import LectureKnowledgeChunkDB

    subjects = db.query(SubjectDB).all()
    total_merged = 0

    for subject in subjects:
        lectures = db.query(LectureDB).filter(LectureDB.subject_id == subject.id).order_by(LectureDB.start_time).all()
        if len(lectures) < 2:
            continue

        i = 0
        while i < len(lectures) - 1:
            current_lec = lectures[i]
            next_lec = lectures[i + 1]

            # Check if same date
            if current_lec.start_time.date() == next_lec.start_time.date():
                gap_seconds = (next_lec.start_time - current_lec.end_time).total_seconds()
                # If adjacent or overlapping or separated by short recess (0 to max_gap_minutes)
                if -60 <= gap_seconds <= (max_gap_minutes * 60):
                    # Extend current_lec end time to cover the complete block
                    current_lec.end_time = max(current_lec.end_time, next_lec.end_time)
                    if not current_lec.room and next_lec.room:
                        current_lec.room = next_lec.room
                    if next_lec.notes:
                        current_lec.notes = (current_lec.notes + "\n" + next_lec.notes).strip()
                    if next_lec.materials:
                        current_mats = current_lec.materials
                        for m in next_lec.materials:
                            if m not in current_mats:
                                current_mats.append(m)
                        current_lec.materials = current_mats

                    # Re-link any meetings from next_lec to current_lec
                    for m in next_lec.meetings:
                        m.lecture_id = current_lec.id

                    # Re-link knowledge chunks
                    chunks = db.query(LectureKnowledgeChunkDB).filter(LectureKnowledgeChunkDB.lecture_id == next_lec.id).all()
                    for c in chunks:
                        c.lecture_id = current_lec.id

                    # Delete the split entry
                    db.delete(next_lec)
                    db.flush()
                    total_merged += 1

                    # Remove next_lec from list and continue checking current_lec against subsequent
                    lectures.pop(i + 1)
                    continue

            i += 1

    db.commit()
    return total_merged
