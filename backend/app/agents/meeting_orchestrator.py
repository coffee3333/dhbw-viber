from sqlalchemy.orm import Session

from app.agents.summarizer_agent import SummarizerAgent
from app.core.config import RECORDINGS_DIR, get_settings
from app.core.database import SessionLocal
from app.core.logger import get_logger
from app.models.db import ActionItemDB, MeetingDB, TranscriptSegmentDB
from app.services.audio import get_audio_duration
from app.services.google.auth import is_google_connected
from app.services.google.drive_sync import backup_meeting_to_google_drive
from app.services.google.tasks_sync import sync_action_items_to_google_tasks
from app.services.transcription import transcribe_audio

logger = get_logger("meeting_agent.orchestrator")

class MeetingOrchestrator:
    """Master orchestrator agent coordinating the entire meeting lifecycle."""

    def __init__(self, meeting_id: str):
        self.meeting_id = meeting_id
        self.settings = get_settings()

    def run(self, template: str = "standard") -> None:
        """Execute full end-to-end pipeline with transactional DB updates and Google Auto-Sync."""
        db: Session = SessionLocal()
        try:
            meeting: MeetingDB = db.query(MeetingDB).filter(MeetingDB.id == self.meeting_id).first()
            if not meeting or not meeting.audio_filename:
                return

            audio_path = RECORDINGS_DIR / meeting.audio_filename
            if not audio_path.exists():
                meeting.status = "failed"
                meeting.error_message = f"Audio file {meeting.audio_filename} not found."
                db.commit()
                return

            # Step 1: Update status to transcribing and determine duration
            meeting.status = "transcribing"
            meeting.duration_seconds = get_audio_duration(audio_path)
            db.commit()

            # Step 2: Speech-to-Text Transcription
            transcription_key = (
                self.settings.gemini_api_key if self.settings.transcription_engine == "gemini"
                else self.settings.openai_api_key
            )
            segments, full_text, detected_lang = transcribe_audio(
                file_path=audio_path,
                engine=self.settings.transcription_engine,
                api_key=transcription_key,
                gemini_model=self.settings.gemini_model,
                whisper_local_model=self.settings.whisper_local_model,
                language=self.settings.audio_language
            )

            # Persist transcript segments to DB
            meeting.full_text = full_text
            meeting.language = detected_lang
            meeting.status = "summarizing"

            # Clear any existing segments if re-running
            db.query(TranscriptSegmentDB).filter(TranscriptSegmentDB.meeting_id == meeting.id).delete()
            for seg in segments:
                db_seg = TranscriptSegmentDB(
                    meeting_id=meeting.id,
                    start=seg.start,
                    end=seg.end,
                    speaker=seg.speaker or "Speaker",
                    text=seg.text
                )
                db.add(db_seg)
            db.commit()

            # Step 3: Summarization & Analysis Agent
            summarizer_key = (
                self.settings.gemini_api_key if self.settings.summarization_engine == "gemini"
                else self.settings.openai_api_key
            )
            summarizer_model = (
                self.settings.gemini_model if self.settings.summarization_engine == "gemini"
                else self.settings.openai_model
            )

            agent = SummarizerAgent(
                engine=self.settings.summarization_engine,
                api_key=summarizer_key,
                model=summarizer_model
            )
            summary_result = agent.analyze(transcript=full_text, template=template)

            # Persist summary fields
            meeting.overview = summary_result.overview
            meeting.executive_summary = summary_result.executive_summary
            meeting.key_points = summary_result.key_points
            meeting.decisions = summary_result.decisions
            meeting.open_questions = summary_result.open_questions
            meeting.markdown_content = summary_result.markdown_content
            meeting.template_used = template

            # If user didn't set a custom title, update to AI title
            if summary_result.title and meeting.title in ("Untitled Meeting", "Recorded Meeting", "Uploaded Recording", "Recorded Lecture", "Uploaded Lecture"):
                meeting.title = summary_result.title

            # Persist Action Items
            db.query(ActionItemDB).filter(ActionItemDB.meeting_id == meeting.id).delete()
            for ai in summary_result.action_items:
                db_ai = ActionItemDB(
                    meeting_id=meeting.id,
                    task=ai.task,
                    assignee=ai.assignee or "Unassigned",
                    priority=ai.priority or "Medium",
                    deadline=ai.deadline,
                    completed=False
                )
                db.add(db_ai)

            meeting.status = "completed"
            db.commit()
            logger.info(f"Meeting {self.meeting_id} processing pipeline completed successfully.")

            # Step 3.5: Auto-index into RAG Knowledge Base if linked to a lecture
            if meeting.lecture_id:
                try:
                    from app.services.rag_service import RagService
                    RagService.index_lecture(db, meeting.lecture_id)
                    logger.info(f"Automatically indexed lecture {meeting.lecture_id} into RAG vector knowledge base.")
                except Exception as e:
                    logger.warning(f"RAG Auto-index note: {e}")

            # Step 4: Optional Automated Google Workspace Sync
            connected, _ = is_google_connected(db)
            if connected:
                # Auto-sync action items to Google Tasks
                if self.settings.google_auto_sync_tasks and meeting.action_items:
                    try:
                        logger.info(f"Auto-syncing {len(meeting.action_items)} action items to Google Tasks...")
                        sync_action_items_to_google_tasks(db, meeting)
                    except Exception as e:
                        logger.error(f"Google Tasks auto-sync error: {e}")

                # Auto-backup study notes to Google Drive
                if self.settings.google_auto_sync_drive:
                    try:
                        logger.info("Auto-backing up study notes to Google Drive...")
                        backup_meeting_to_google_drive(db, meeting)
                    except Exception as e:
                        logger.error(f"Google Drive auto-backup error: {e}")

        except Exception as e:
            logger.exception(f"Error executing meeting orchestrator for {self.meeting_id}")
            db.rollback()
            meeting = db.query(MeetingDB).filter(MeetingDB.id == self.meeting_id).first()
            if meeting:
                meeting.status = "failed"
                meeting.error_message = str(e)
                db.commit()
        finally:
            db.close()
