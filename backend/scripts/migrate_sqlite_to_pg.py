import sqlite3
import json
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.db import Base, SubjectDB, LectureDB, CalendarSourceDB
from app.core.config import get_settings

def migrate():
    settings = get_settings()
    # Connect to PostgreSQL (running on localhost:5432)
    pg_url = "postgresql://postgres:postgres@localhost:5432/meeting_agent"
    pg_engine = create_engine(pg_url)
    PgSession = sessionmaker(bind=pg_engine)
    pg_db = PgSession()

    sqlite_path = "backend/data/meetings.db"
    sq_conn = sqlite3.connect(sqlite_path)
    sq_conn.row_factory = sqlite3.Row
    sq_cur = sq_conn.cursor()

    print("[Migration] Starting data migration from SQLite to PostgreSQL...")

    # 1. Migrate Calendar Sources
    sq_cur.execute("SELECT * FROM calendar_sources")
    sources = sq_cur.fetchall()
    for s in sources:
        exists = pg_db.query(CalendarSourceDB).filter(CalendarSourceDB.id == s["id"]).first()
        if not exists:
            pg_db.add(CalendarSourceDB(
                id=s["id"],
                name=s["name"],
                url=s["url"],
                file_path=s["file_path"],
                last_synced=datetime.fromisoformat(s["last_synced"]) if s["last_synced"] else None,
                auto_sync=bool(s["auto_sync"]),
                sync_interval_hours=s["sync_interval_hours"] or 6,
                created_at=datetime.fromisoformat(s["created_at"]) if s["created_at"] else datetime.utcnow()
            ))
    pg_db.commit()
    print(f"[Migration] Migrated {len(sources)} calendar sources.")

    # 2. Migrate Subjects
    sq_cur.execute("SELECT * FROM subjects")
    subjects = sq_cur.fetchall()
    for s in subjects:
        exists = pg_db.query(SubjectDB).filter(SubjectDB.id == s["id"]).first()
        if not exists:
            pg_db.add(SubjectDB(
                id=s["id"],
                name=s["name"],
                code=s["code"],
                lecturer=s["lecturer"],
                color=s["color"] or "#4f46e5",
                semester=s["semester"],
                created_at=datetime.fromisoformat(s["created_at"]) if s["created_at"] else datetime.utcnow()
            ))
    pg_db.commit()
    print(f"[Migration] Migrated {len(subjects)} subjects.")

    # 3. Migrate Lectures
    sq_cur.execute("SELECT * FROM lectures")
    lectures = sq_cur.fetchall()
    for l in lectures:
        exists = pg_db.query(LectureDB).filter(LectureDB.id == l["id"]).first()
        if not exists:
            pg_db.add(LectureDB(
                id=l["id"],
                subject_id=l["subject_id"],
                external_uid=l["external_uid"],
                google_event_id=l["google_event_id"],
                title=l["title"],
                start_time=datetime.fromisoformat(l["start_time"]),
                end_time=datetime.fromisoformat(l["end_time"]),
                room=l["room"],
                meeting_link=l["meeting_link"],
                description=l["description"],
                status=l["status"] or "scheduled",
                notes=l["notes"] or "",
                materials_json=l["materials_json"] or "[]",
                ai_summary_override=l["ai_summary_override"],
                created_at=datetime.fromisoformat(l["created_at"]) if l["created_at"] else datetime.utcnow()
            ))
    pg_db.commit()
    print(f"[Migration] Migrated {len(lectures)} lectures.")

    sq_conn.close()
    pg_db.close()
    print("✅ [Migration] Complete! All academic records safely transferred to PostgreSQL.")

if __name__ == "__main__":
    migrate()
