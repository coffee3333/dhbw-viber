import io
from typing import Any

from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseUpload
from sqlalchemy.orm import Session

from app.core.config import RECORDINGS_DIR
from app.core.logger import get_logger
from app.models.db import MeetingDB
from app.services.audio import convert_to_mp3
from app.services.google.auth import get_valid_google_credentials

logger = get_logger("meeting_agent.google.drive")

def get_or_create_drive_folder(service, folder_name: str, parent_id: str | None = None) -> str:
    """Find or create a folder in Google Drive."""
    query = f"mimeType = 'application/vnd.google-apps.folder' and name = '{folder_name}' and trashed = false"
    if parent_id:
        query += f" and '{parent_id}' in parents"
    else:
        query += " and 'root' in parents"

    results = service.files().list(q=query, spaces="drive", fields="files(id, name)").execute()
    files = results.get("files", [])
    if files:
        return files[0]["id"]

    file_metadata = {
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder"
    }
    if parent_id:
        file_metadata["parents"] = [parent_id]

    folder = service.files().create(body=file_metadata, fields="id").execute()
    return folder.get("id")


def backup_meeting_to_google_drive(db: Session, meeting: MeetingDB) -> dict[str, Any]:
    """Upload study notes and media files to Google Drive."""
    creds = get_valid_google_credentials(db)
    if not creds:
        raise ValueError("Google account not connected. Please authenticate in Settings.")

    service = build("drive", "v3", credentials=creds)

    # 1. Establish Folder Hierarchy: Root -> DHBW -> Subject Name -> Lecture Folder
    root_dhbw_id = get_or_create_drive_folder(service, "DHBW")
    subj_name = meeting.lecture.subject.name if (meeting.lecture and meeting.lecture.subject) else "General Courses"
    subj_folder_id = get_or_create_drive_folder(service, subj_name, parent_id=root_dhbw_id)

    date_str = str(meeting.created_at)[:10]
    safe_title = "".join(c for c in meeting.title if c.isalnum() or c in (" ", "_", "-")).strip()[:40]
    lecture_folder_name = f"{date_str}_{safe_title}"
    target_folder_id = get_or_create_drive_folder(service, lecture_folder_name, parent_id=subj_folder_id)

    uploaded_files = []

    # 2. Upload Study Notes as Markdown
    notes_content = f"# {meeting.title}\n"
    notes_content += f"**Platform:** {meeting.platform.upper()} | **Date:** {date_str} | **Duration:** {int(meeting.duration_seconds)}s\n\n"
    if meeting.executive_summary:
        notes_content += f"## Executive Summary\n{meeting.executive_summary}\n\n"
    if meeting.key_points:
        notes_content += "## Core Concepts & Discussions\n"
        for kp in meeting.key_points:
            notes_content += f"- {kp}\n"
        notes_content += "\n"
    if meeting.decisions:
        notes_content += "## Exam Pointers & Decisions\n"
        for d in meeting.decisions:
            notes_content += f"- {d}\n"
        notes_content += "\n"
    if meeting.action_items:
        notes_content += "## Assignments & Homework\n"
        for ai in meeting.action_items:
            status = "[x]" if ai.completed else "[ ]"
            deadline_str = f" (Due: {ai.deadline})" if ai.deadline else ""
            notes_content += f"- {status} **{ai.task}**{deadline_str}\n"
        notes_content += "\n"
    notes_content += f"## Transcript\n\n{meeting.full_text or ''}\n"

    media_bytes = io.BytesIO(notes_content.encode("utf-8"))
    notes_upload = MediaIoBaseUpload(media_bytes, mimetype="text/markdown", resumable=False)
    notes_file = service.files().create(
        body={"name": f"{safe_title}_Study_Notes.md", "parents": [target_folder_id]},
        media_body=notes_upload,
        fields="id, name, webViewLink"
    ).execute()
    uploaded_files.append({"type": "notes", "name": notes_file.get("name"), "link": notes_file.get("webViewLink")})

    # 3. Upload Media Recording (Audio as compact MP3, or Video) if exists
    media_file_to_upload = meeting.video_filename or meeting.audio_filename
    if media_file_to_upload:
        local_path = RECORDINGS_DIR / media_file_to_upload
        if local_path.exists() and local_path.stat().st_size > 0:
            if local_path.suffix.lower() in (".mp4", ".mov", ".webm", ".mkv") and meeting.video_filename:
                # Video file upload
                mime = "video/mp4"
                upload_name = f"{safe_title}_Video{local_path.suffix.lower()}"
                media_upload = MediaFileUpload(str(local_path), mimetype=mime, resumable=True)
            else:
                # Audio file: convert raw WAV / webm / ogg to compact, streamable MP3 (64k-96k)
                if local_path.suffix.lower() == ".mp3":
                    mp3_path = local_path
                else:
                    mp3_path = RECORDINGS_DIR / f"{local_path.stem}.mp3"
                    if not mp3_path.exists():
                        try:
                            convert_to_mp3(local_path, mp3_path, bitrate="96k")
                        except Exception as e:
                            logger.warning(f"MP3 conversion warning: {e}, falling back to original file")
                            mp3_path = local_path

                mime = "audio/mpeg" if mp3_path.suffix.lower() == ".mp3" else "audio/wav"
                upload_name = f"{safe_title}_Recording.mp3" if mp3_path.suffix.lower() == ".mp3" else local_path.name
                media_upload = MediaFileUpload(str(mp3_path), mimetype=mime, resumable=True)

            rec_file = service.files().create(
                body={"name": upload_name, "parents": [target_folder_id]},
                media_body=media_upload,
                fields="id, name, webViewLink"
            ).execute()
            uploaded_files.append({"type": "recording", "name": rec_file.get("name"), "link": rec_file.get("webViewLink")})

    meeting.google_drive_folder_id = target_folder_id
    meeting.google_drive_file_id = notes_file.get("id")

    # 4. If linked to a lecture, automatically attach Google Drive links to lecture.materials
    if meeting.lecture:
        cur_materials = list(meeting.lecture.materials or [])
        # Link Study Notes
        if notes_file.get("webViewLink") and not any(m.get("url") == notes_file.get("webViewLink") for m in cur_materials):
            cur_materials.append({
                "id": f"drive_notes_{notes_file.get('id', safe_title)}",
                "title": f"Google Drive: AI Study Notes ({safe_title})",
                "url": notes_file.get("webViewLink"),
                "type": "drive_notes"
            })
        # Link Recording File
        for uf in uploaded_files:
            if (
                uf.get("type") == "recording"
                and uf.get("link")
                and not any(m.get("url") == uf.get("link") for m in cur_materials)
            ):
                cur_materials.append({
                    "id": f"drive_rec_{safe_title}",
                    "title": f"Google Drive: Audio Recording ({uf.get('name')})",
                    "url": uf.get("link"),
                    "type": "recording"
                })
        meeting.lecture.materials = cur_materials

    db.commit()

    return {
        "folder_id": target_folder_id,
        "folder_name": lecture_folder_name,
        "uploaded_files": uploaded_files
    }
