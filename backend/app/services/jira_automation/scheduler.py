import asyncio
import json
from datetime import UTC, datetime
from typing import Any
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret
from app.core.database import SessionLocal
from app.core.logger import get_logger
from app.models.jira_automation import (
    AutomationProjectDB,
    AutomationSprintDB,
    AutomationTaskDB,
    TaskStatusMoveDB,
    utc_now,
)
from app.models.user import UserDB, UserCredentialsDB
from app.services.jira_automation.jira_client import JiraClient
from app.services.jira_automation.telegram_service import TelegramNotifier

logger = get_logger("meeting_agent.scheduler")

_scheduler: AsyncIOScheduler | None = None
_lock = asyncio.Lock()


def _normalize_dt(dt: datetime | None) -> datetime | None:
    """Ensures datetime is UTC naive for safe comparison with database timestamps."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


def _to_utc(dt: datetime | None) -> datetime | None:
    """Ensures datetime is timezone-aware UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def get_jira_client_for_project(project: AutomationProjectDB) -> JiraClient | None:
    """Helper to instantiate JiraClient using decrypted token."""
    if not project.jira_domain or not project.jira_email or not project.jira_api_token_encrypted:
        return None
    raw_token = decrypt_secret(project.jira_api_token_encrypted)
    if not raw_token:
        return None
    return JiraClient(domain=project.jira_domain, email=project.jira_email, api_token=raw_token)


async def send_project_telegram(project: AutomationProjectDB, message: str) -> None:
    """Telegram integration removed."""
    return


async def execute_sprint_close(
    db: Session,
    project: AutomationProjectDB,
    jira: JiraClient,
    sprint: AutomationSprintDB,
) -> None:
    """Closes sprint in Jira and local DB. Incomplete issues move to backlog."""
    if not sprint.jira_sprint_id:
        sprint.closed = True
        db.commit()
        return

    try:
        logger.info(f"[Scheduler] Closing sprint: {sprint.name} (#{sprint.jira_sprint_id})")
        await jira.close_sprint(sprint.jira_sprint_id)
        sprint.closed = True
        sprint.end_date = utc_now()
        db.commit()

        total = sum(1 for t in sprint.tasks if t.created)
        done = sum(1 for t in sprint.tasks if t.created and t.current_status and t.current_status.lower() in ("done", "closed"))
        msg = (
            f"✅ <b>Sprint \"{sprint.name}\" closed</b>\n"
            f"{done}/{total} tasks completed — incomplete tasks moved to backlog"
        )
        logger.info(f"[Scheduler] {msg}")
        await send_project_telegram(project, msg)
    except Exception as e:
        logger.error(f"[Scheduler] Error closing sprint {sprint.name}: {e}")
        await send_project_telegram(project, f"❌ Failed to close sprint \"{sprint.name}\": {e}")


async def execute_sprint_start(
    db: Session,
    project: AutomationProjectDB,
    jira: JiraClient,
    sprint: AutomationSprintDB,
    now: datetime,
) -> int:
    """Creates/activates sprint in Jira Agile, creates initial tasks, carries over backlog."""
    start_utc = _to_utc(sprint.start_date)
    end_utc = _to_utc(sprint.end_date)
    start_iso = start_utc.isoformat() if start_utc else None
    end_iso = end_utc.isoformat() if end_utc else None

    # 1. Create or activate in Jira
    if sprint.jira_sprint_id:
        jira_sprint_id = sprint.jira_sprint_id
        try:
            await jira.update_sprint(
                sprint_id=jira_sprint_id,
                name=sprint.name,
                start_date=start_iso,
                end_date=end_iso,
                state="active",
            )
        except Exception as e:
            logger.warning(f"[Scheduler] Could not update sprint {jira_sprint_id} state to active: {e}")
    else:
        board_id = project.jira_board_id
        if not board_id and project.jira_project_key:
            try:
                boards = await jira.get_boards(project.jira_project_key)
                if boards:
                    board_id = boards[0].get("id")
                    project.jira_board_id = board_id
                    db.commit()
            except Exception as be:
                logger.warning(f"Could not discover board for {project.jira_project_key}: {be}")
        if not board_id:
            board_id = sprint.board_id

        jira_sprint_id = None
        if board_id:
            try:
                await jira.ensure_board_features(board_id)
            except Exception:
                pass
            try:
                jira_sprint_id = await jira.create_sprint(
                    name=sprint.name,
                    start_date=start_iso,
                    end_date=end_iso,
                    board_id=board_id,
                    activate=True,
                )
                sprint.jira_sprint_id = jira_sprint_id
                sprint.board_id = board_id
            except Exception as se:
                logger.warning(f"[Scheduler] Could not create sprint in Jira for board {board_id}: {se}")

    # 2. Create scheduled initial tasks
    now_dt = _normalize_dt(now)
    created_count = 0
    for task in sprint.tasks:
        create_at = _normalize_dt(task.create_at)
        if create_at and now_dt and create_at > now_dt:
            continue
        if task.created:
            continue

        try:
            assignee_id = None
            if task.assignee_id:
                creds = db.query(UserCredentialsDB).filter(UserCredentialsDB.user_id == task.assignee_id).first()
                if creds and creds.jira_account_id:
                    assignee_id = creds.jira_account_id
            if not assignee_id:
                fallback_cred = (
                    db.query(UserCredentialsDB)
                    .join(ProjectMemberDB, ProjectMemberDB.user_id == UserCredentialsDB.user_id)
                    .filter(ProjectMemberDB.project_id == project.id, UserCredentialsDB.jira_account_id.isnot(None))
                    .first()
                )
                if fallback_cred and fallback_cred.jira_account_id:
                    assignee_id = fallback_cred.jira_account_id

            key = await jira.create_issue(
                project_key=project.jira_project_key or "KAN",
                summary=task.title,
                description=task.description or "",
                issue_type=task.issue_type,
                priority=task.priority,
                start_date=task.start_date.isoformat() if task.start_date else start_iso,
                due_date=task.due_date.isoformat() if task.due_date else end_iso,
                story_points=task.story_points,
                original_estimate=task.original_estimate,
                time_spent=task.time_spent,
                assignee_account_id=assignee_id,
                custom_fields=task.custom_fields,
            )
            task.jira_issue_key = key
            task.created = True
            if jira_sprint_id:
                try:
                    await jira.add_to_sprint(jira_sprint_id, key)
                except Exception as se:
                    logger.warning(f"Could not add {key} to sprint {jira_sprint_id}: {se}")
            elif project.jira_board_id:
                try:
                    await jira.move_issues_to_board(project.jira_board_id, [key])
                except Exception as be:
                    logger.warning(f"Could not move {key} to board {project.jira_board_id}: {be}")
            created_count += 1
            logger.info(f"[Scheduler] Initial task created and added to sprint: {key} ({task.title})")
        except Exception as e:
            logger.error(f"[Scheduler] Failed to create initial task '{task.title}': {e}")

    # 3. Pull backlog issues carried over from prior closed sprint
    carry_count = 0
    if jira_sprint_id and project.jira_board_id and project.jira_project_key:
        try:
            backlog = await jira.get_backlog_issues(project.jira_board_id)
            prefix = f"{project.jira_project_key.upper()}-"
            just_keys = {t.jira_issue_key for t in sprint.tasks if t.jira_issue_key}
            carry_overs = [
                b for b in backlog
                if b.get("key")
                and b["key"] not in just_keys
                and b["key"].upper().startswith(prefix)
            ]
            if carry_overs:
                keys = [b["key"] for b in carry_overs]
                await jira.add_to_sprint(jira_sprint_id, keys)
                carry_count = len(keys)
                logger.info(f"[Scheduler] Carried over {carry_count} backlog issues into {sprint.name}: {keys}")

                for issue in carry_overs:
                    fields = issue.get("fields", {})
                    status_name = (fields.get("status") or {}).get("name") or "To Do"
                    summary = fields.get("summary") or issue.get("key", "")
                    issue_type = (fields.get("issuetype") or {}).get("name") or "Task"
                    priority = (fields.get("priority") or {}).get("name") or "Medium"

                    new_task = AutomationTaskDB(
                        sprint_id=sprint.id,
                        title=summary,
                        description="",
                        priority=priority,
                        issue_type=issue_type,
                        jira_issue_key=issue.get("key"),
                        created=True,
                        current_status=status_name,
                        from_jira=True,
                        start_date=sprint.start_date,
                        due_date=sprint.end_date,
                        create_at=sprint.start_date,
                    )
                    db.add(new_task)

                await send_project_telegram(
                    project,
                    f"♻️ <b>{carry_count} incomplete issues</b> carried into <b>{sprint.name}</b> in their current state\n{', '.join(keys)}"
                )
        except Exception as e:
            logger.warning(f"[Scheduler] Could not carry over backlog: {e}")

    sprint.started = True
    sprint.closed = False
    db.commit()

    total_created = sum(1 for t in sprint.tasks if t.created)
    msg = f"🚀 <b>Sprint \"{sprint.name}\" started</b>\n{total_created} tasks active in Jira"
    logger.info(f"[Scheduler] {msg}")
    await send_project_telegram(project, msg)
    return total_created


async def process_sprint_closes(db: Session, project: AutomationProjectDB, jira: JiraClient, now: datetime) -> None:
    """Closes sprints whose endDate has passed."""
    now_dt = _normalize_dt(now)
    sprints = (
        db.query(AutomationSprintDB)
        .filter(
            AutomationSprintDB.project_id == project.id,
            AutomationSprintDB.started == True,
            AutomationSprintDB.closed == False,
            AutomationSprintDB.end_date <= now_dt,
        )
        .all()
    )

    for sprint in sprints:
        await execute_sprint_close(db, project, jira, sprint)


async def process_sprint_starts(db: Session, project: AutomationProjectDB, jira: JiraClient, now: datetime) -> None:
    """Starts scheduled sprints when start_date arrives."""
    now_dt = _normalize_dt(now)
    has_active = (
        db.query(AutomationSprintDB)
        .filter(
            AutomationSprintDB.project_id == project.id,
            AutomationSprintDB.started == True,
            AutomationSprintDB.closed == False,
        )
        .first()
    )
    if has_active:
        return

    sprint = (
        db.query(AutomationSprintDB)
        .filter(
            AutomationSprintDB.project_id == project.id,
            AutomationSprintDB.started == False,
            AutomationSprintDB.closed == False,
            AutomationSprintDB.start_date <= now_dt,
        )
        .order_by(AutomationSprintDB.start_date)
        .first()
    )

    if not sprint:
        return

    try:
        logger.info(f"[Scheduler] Starting sprint on schedule: {sprint.name}")
        await execute_sprint_start(db, project, jira, sprint, now)
    except Exception as e:
        logger.error(f"[Scheduler] Failed to start sprint {sprint.name}: {e}")
        await send_project_telegram(project, f"❌ Failed to start sprint \"{sprint.name}\": {e}")


async def process_moves(db: Session, project: AutomationProjectDB, jira: JiraClient, now: datetime) -> None:
    """Processes delayed task creations and scheduled status transitions in Jira."""
    now_dt = _normalize_dt(now)
    sprints = (
        db.query(AutomationSprintDB)
        .filter(
            AutomationSprintDB.project_id == project.id,
            AutomationSprintDB.started == True,
            AutomationSprintDB.closed == False,
        )
        .all()
    )

    for sprint in sprints:
        for task in sprint.tasks:
            # 1. Delayed task creation in Jira
            create_at = _normalize_dt(task.create_at)
            if not task.created and create_at and now_dt and create_at <= now_dt:
                try:
                    assignee_id = None
                    if task.assignee_id:
                        creds = db.query(UserCredentialsDB).filter(UserCredentialsDB.user_id == task.assignee_id).first()
                        if creds and creds.jira_account_id:
                            assignee_id = creds.jira_account_id
                    if not assignee_id:
                        fallback_cred = (
                            db.query(UserCredentialsDB)
                            .join(ProjectMemberDB, ProjectMemberDB.user_id == UserCredentialsDB.user_id)
                            .filter(ProjectMemberDB.project_id == project.id, UserCredentialsDB.jira_account_id.isnot(None))
                            .first()
                        )
                        if fallback_cred and fallback_cred.jira_account_id:
                            assignee_id = fallback_cred.jira_account_id

                    key = await jira.create_issue(
                        project_key=project.jira_project_key or "KAN",
                        summary=task.title,
                        description=task.description or "",
                        issue_type=task.issue_type,
                        priority=task.priority,
                        start_date=task.start_date.isoformat() if task.start_date else None,
                        due_date=task.due_date.isoformat() if task.due_date else None,
                        story_points=task.story_points,
                        original_estimate=task.original_estimate,
                        time_spent=task.time_spent,
                        assignee_account_id=assignee_id,
                        custom_fields=task.custom_fields,
                    )
                    task.jira_issue_key = key
                    task.created = True
                    if sprint.jira_sprint_id:
                        await jira.add_to_sprint(sprint.jira_sprint_id, key)
                    elif project.jira_board_id:
                        try:
                            await jira.move_issues_to_board(project.jira_board_id, [key])
                        except Exception as be:
                            logger.warning(f"Could not move {key} to board {project.jira_board_id}: {be}")

                    db.commit()
                    logger.info(f"[Scheduler] Task '{task.title}' created in Jira as {key}")
                    await send_project_telegram(
                        project,
                        f"📝 <b>{key}</b> \"{task.title}\" appeared in Jira (To Do)"
                    )
                except Exception as e:
                    logger.error(f"[Scheduler] Failed to delayed-create task '{task.title}': {e}")

            if not task.created or not task.jira_issue_key:
                continue

            # 2. Process status moves in Jira
            for move in task.moves:
                move_at = _normalize_dt(move.move_at)
                if move.done or (move_at and now_dt and move_at > now_dt):
                    continue

                try:
                    await jira.transition_issue(task.jira_issue_key, move.status)
                    move.done = True
                    move.executed_at = now
                    task.current_status = move.status
                    db.commit()
                    logger.info(f"[Scheduler] Issue {task.jira_issue_key} transitioned to {move.status}")
                    await send_project_telegram(
                        project,
                        f"📋 <b>{task.jira_issue_key}</b> \"{task.title}\"\n➔ <b>{move.status}</b>"
                    )
                except Exception as e:
                    logger.error(f"[Scheduler] Move failed for {task.jira_issue_key} ➔ {move.status}: {e}")
                    await send_project_telegram(
                        project,
                        f"❌ Failed to move <b>{task.jira_issue_key}</b> to {move.status}: {e}"
                    )


async def scheduler_tick() -> None:
    """Atomic 1-minute execution tick with lock-guard."""
    if _lock.locked():
        logger.debug("[Scheduler] Tick skipped — previous cycle still active")
        return

    async with _lock:
        now = datetime.now(UTC).replace(tzinfo=None)
        with SessionLocal() as db:
            active_projects = db.query(AutomationProjectDB).filter(AutomationProjectDB.is_active == True).all()
            for project in active_projects:
                jira = get_jira_client_for_project(project)
                if not jira:
                    continue
                await process_sprint_closes(db, project, jira, now)
                await process_sprint_starts(db, project, jira, now)
                await process_moves(db, project, jira, now)


def start_automation_scheduler() -> AsyncIOScheduler:
    """Initialize and start the background scheduler."""
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler

    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        scheduler_tick,
        "interval",
        minutes=1,
        max_instances=1,
        coalesce=True,
        id="jira_git_automation_tick",
    )
    _scheduler.start()
    logger.info("[Scheduler] Jira & Git Automation background scheduler started (1 min tick)")
    return _scheduler


def stop_automation_scheduler() -> None:
    """Shutdown background scheduler."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Jira & Git Automation scheduler stopped")
