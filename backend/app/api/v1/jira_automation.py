"""Jira & Git Automation API router."""
from datetime import UTC, datetime, timedelta
import re
from typing import Any
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.crypto import decrypt_secret, encrypt_secret, mask_secret
from app.core.database import get_db
from app.core.logger import get_logger
from app.core.security import get_current_user, get_current_user_optional, require_admin, require_auth
from app.models.jira_automation import (
    AutomationProjectDB,
    AutomationSprintDB,
    AutomationTaskDB,
    ProjectMemberDB,
    TaskStatusMoveDB,
)
from app.models.user import UserDB, UserCredentialsDB
from app.services.jira_automation.jira_client import JiraClient
from app.services.jira_automation.scheduler import (
    _normalize_dt,
    execute_sprint_close,
    execute_sprint_start,
    get_jira_client_for_project,
    process_moves,
    process_sprint_closes,
    process_sprint_starts,
)
from app.agents.jira_planner_agent import JiraPlannerAgent
from app.services.jira_automation.agent_guide import generate_agents_guide, generate_claude_guide

logger = get_logger("meeting_agent.jira_api")

router = APIRouter(
    prefix="/jira-automation",
    tags=["jira-automation"],
    dependencies=[Depends(require_admin)],
)


# ==================== SCHEMAS ====================


class TestCredentialsRequest(BaseModel):
    jira_domain: str
    jira_email: str
    jira_api_token: str


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    jira_domain: str | None = None
    jira_email: str | None = None
    jira_api_token: str | None = None
    jira_project_key: str | None = None
    jira_board_id: int | None = None
    source_repo_backend: str | None = None
    source_repo_frontend: str | None = None
    target_repo_backend: str | None = None
    target_repo_frontend: str | None = None
    custom_fields_map: dict[str, Any] | None = None
    telegram_bot_token: str | None = None
    telegram_channel_chat_id: str | None = None
    is_active: bool = True


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    jira_domain: str | None = None
    jira_email: str | None = None
    jira_api_token: str | None = None
    jira_project_key: str | None = None
    jira_board_id: int | None = None
    source_repo_backend: str | None = None
    source_repo_frontend: str | None = None
    target_repo_backend: str | None = None
    target_repo_frontend: str | None = None
    custom_fields_map: dict[str, Any] | None = None
    telegram_bot_token: str | None = None
    telegram_channel_chat_id: str | None = None
    is_active: bool | None = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    jira_domain: str | None = None
    jira_email: str | None = None
    jira_api_token_masked: str | None = None
    has_jira_token: bool = False
    jira_project_key: str | None = None
    jira_board_id: int | None = None
    source_repo_backend: str | None = None
    source_repo_frontend: str | None = None
    target_repo_backend: str | None = None
    target_repo_frontend: str | None = None
    custom_fields_map: dict[str, Any] | None = None
    has_telegram_token: bool = False
    telegram_channel_chat_id: str | None = None
    is_active: bool = True
    created_at: datetime | None = None
    member_count: int = 0
    sprint_count: int = 0


class MemberAdd(BaseModel):
    user_id: str
    role_in_project: str = "developer"


class MemberResponse(BaseModel):
    id: str
    user_id: str
    username: str | None = None
    email: str | None = None
    display_name: str
    role: str
    role_in_project: str
    jira_account_id: str | None = None
    git_author_name: str | None = None
    git_author_email: str | None = None
    has_github_token: bool = False
    telegram_chat_id: str | None = None


class SprintCreate(BaseModel):
    name: str
    start_date: datetime
    end_date: datetime
    board_id: int | None = None
    start_now: bool = False


class SprintUpdate(BaseModel):
    name: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    started: bool | None = None
    closed: bool | None = None


class MoveCreate(BaseModel):
    id: str | None = None
    status: str
    move_at: datetime
    done: bool = False


class MoveResponse(BaseModel):
    id: str
    task_id: str
    status: str
    from_status: str | None = None
    move_at: datetime
    done: bool = False
    executed_at: datetime | None = None


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: str = "Medium"
    issue_type: str = "Task"
    assignee_id: str | None = None
    create_at: datetime | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    story_points: float | None = None
    original_estimate: str | None = None
    time_spent: str | None = None
    git_config: dict[str, Any] | None = None
    custom_fields: dict[str, Any] | None = None
    moves: list[MoveCreate] = []


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    issue_type: str | None = None
    assignee_id: str | None = None
    current_status: str | None = None
    sprint_id: str | None = None
    create_at: datetime | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    story_points: float | None = None
    original_estimate: str | None = None
    time_spent: str | None = None
    git_config: dict[str, Any] | None = None
    custom_fields: dict[str, Any] | None = None
    moves: list[MoveCreate] | None = None


class MoveTaskToSprintRequest(BaseModel):
    sprint_id: str


class TaskResponse(BaseModel):
    id: str
    sprint_id: str
    assignee_id: str | None = None
    assignee_name: str | None = None
    title: str
    description: str = ""
    priority: str = "Medium"
    issue_type: str = "Task"
    jira_issue_key: str | None = None
    created: bool = False
    current_status: str = "To Do"
    create_at: datetime | None = None
    start_date: datetime | None = None
    due_date: datetime | None = None
    story_points: float | None = None
    original_estimate: str | None = None
    time_spent: str | None = None
    git_config: dict[str, Any] | None = None
    custom_fields: dict[str, Any] | None = None
    from_jira: bool = False
    moves: list[MoveResponse] = []


class SprintResponse(BaseModel):
    id: str
    project_id: str
    name: str
    start_date: datetime
    end_date: datetime
    jira_sprint_id: int | None = None
    board_id: int | None = None
    started: bool = False
    closed: bool = False
    from_jira: bool = False
    created_at: datetime | None = None
    tasks_count: int = 0
    completed_tasks_count: int = 0
    tasks: list[TaskResponse] = []


class IssueTypeResponse(BaseModel):
    name: str
    id: str | None = None
    subtask: bool = False
    description: str | None = None
    icon_url: str | None = None


class AgentGuideResponse(BaseModel):
    project_id: str | None = None
    project_name: str | None = None
    jira_project_key: str | None = None
    jira_board_id: int | None = None
    base_url: str
    agents_md: str
    claude_md: str


# ==================== HELPERS ====================


def _to_utc(dt: datetime | None) -> datetime | None:
    """Ensure datetime has UTC tzinfo so Pydantic serializes with 'Z'."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _project_to_response(proj: AutomationProjectDB) -> ProjectResponse:
    has_jira = bool(proj.jira_api_token_encrypted)
    has_tg = bool(proj.telegram_bot_token_encrypted)
    raw_jira = decrypt_secret(proj.jira_api_token_encrypted) if has_jira else None
    masked_jira = mask_secret(raw_jira) if raw_jira else None

    return ProjectResponse(
        id=proj.id,
        name=proj.name,
        description=proj.description,
        jira_domain=proj.jira_domain,
        jira_email=proj.jira_email,
        jira_api_token_masked=masked_jira,
        has_jira_token=has_jira,
        jira_project_key=proj.jira_project_key,
        jira_board_id=proj.jira_board_id,
        source_repo_backend=proj.source_repo_backend,
        source_repo_frontend=proj.source_repo_frontend,
        target_repo_backend=proj.target_repo_backend,
        target_repo_frontend=proj.target_repo_frontend,
        custom_fields_map=proj.custom_fields_map,
        has_telegram_token=has_tg,
        telegram_channel_chat_id=proj.telegram_channel_chat_id,
        is_active=proj.is_active,
        created_at=_to_utc(proj.created_at),
        member_count=len(proj.members),
        sprint_count=len(proj.sprints),
    )


def _task_to_response(task: AutomationTaskDB) -> TaskResponse:
    assignee_name = None
    if task.assignee:
        assignee_name = task.assignee.display_name or task.assignee.email

    moves_resp = [
        MoveResponse(
            id=m.id,
            task_id=m.task_id,
            status=m.status,
            from_status=m.from_status,
            move_at=_to_utc(m.move_at),
            done=m.done,
            executed_at=_to_utc(m.executed_at),
        )
        for m in (task.moves or [])
    ]

    return TaskResponse(
        id=task.id,
        sprint_id=task.sprint_id,
        assignee_id=task.assignee_id,
        assignee_name=assignee_name,
        title=task.title,
        description=task.description or "",
        priority=task.priority or "Medium",
        issue_type=task.issue_type or "Task",
        jira_issue_key=task.jira_issue_key,
        created=task.created,
        current_status=task.current_status or "To Do",
        create_at=_to_utc(task.create_at),
        start_date=_to_utc(task.start_date),
        due_date=_to_utc(task.due_date),
        story_points=task.story_points,
        original_estimate=task.original_estimate,
        time_spent=task.time_spent,
        git_config=task.git_config,
        custom_fields=task.custom_fields,
        from_jira=task.from_jira,
        moves=moves_resp,
    )


def _sprint_to_response(sprint: AutomationSprintDB) -> SprintResponse:
    tasks = sprint.tasks
    if sprint.project and sprint.project.jira_project_key:
        prefix = f"{sprint.project.jira_project_key.upper()}-"
        tasks = [t for t in tasks if not t.jira_issue_key or t.jira_issue_key.upper().startswith(prefix)]
    completed = sum(1 for t in tasks if t.current_status and t.current_status.lower() in ("done", "closed"))
    return SprintResponse(
        id=sprint.id,
        project_id=sprint.project_id,
        name=sprint.name,
        start_date=_to_utc(sprint.start_date),
        end_date=_to_utc(sprint.end_date),
        jira_sprint_id=sprint.jira_sprint_id,
        board_id=sprint.board_id,
        started=sprint.started,
        closed=sprint.closed,
        from_jira=sprint.from_jira,
        created_at=_to_utc(sprint.created_at),
        tasks_count=len(tasks),
        completed_tasks_count=completed,
        tasks=[_task_to_response(t) for t in tasks],
    )


# ==================== PROJECT ROUTES ====================


@router.post("/test-credentials")
async def test_credentials(
    data: TestCredentialsRequest,
    current_user: UserDB = Depends(require_admin),
):
    """Test connection and discover projects & boards with raw credentials before saving."""
    if not data.jira_domain or not data.jira_email or not data.jira_api_token:
        raise HTTPException(status_code=400, detail="Domain, email, and API token are required")

    jira = JiraClient(domain=data.jira_domain, email=data.jira_email, api_token=data.jira_api_token)
    try:
        myself = await jira.test_connection()
        user_name = myself.get("displayName") or myself.get("emailAddress", "Jira User")

        projects = []
        try:
            raw_projects = await jira.get_projects()
            projects = [
                {"id": p.get("id"), "key": p.get("key"), "name": p.get("name")}
                for p in raw_projects
            ]
        except Exception as pe:
            logger.warning(f"Could not discover projects: {pe}")

        boards = []
        try:
            raw_boards = await jira.get_boards()
            boards = [
                {
                    "id": b.get("id"),
                    "name": b.get("name"),
                    "type": b.get("type"),
                    "project_key": b.get("location", {}).get("projectKey") if b.get("location") else None,
                }
                for b in raw_boards
            ]
        except Exception as be:
            logger.warning(f"Could not discover boards: {be}")

        return {
            "status": "ok",
            "displayName": user_name,
            "projects": projects,
            "boards": boards,
        }
    except httpx.HTTPStatusError as he:
        logger.error(f"Credentials test HTTP error: {he}")
        if he.response.status_code == 401:
            detail = (
                "401 Unauthorized: Invalid Jira email or API token. "
                "Note: The API Token is NOT your Account ID (712020:...) and NOT your password. "
                "Generate an API token at id.atlassian.com/manage-profile/security/api-tokens"
            )
        elif he.response.status_code == 404:
            detail = f"404 Not Found: Could not reach Jira domain '{data.jira_domain}'. Please verify the domain."
        else:
            detail = f"Jira error {he.response.status_code}: {he.response.text or str(he)}"
        raise HTTPException(status_code=400, detail=detail)
    except Exception as e:
        logger.error(f"Credentials test failed: {e}")
        raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")


@router.get("/projects", response_model=list[ProjectResponse])
async def list_projects(
    db: Session = Depends(get_db),
    current_user: UserDB | None = Depends(get_current_user_optional),
):
    """List all projects accessible to the current user."""
    query = db.query(AutomationProjectDB)
    if current_user and current_user.role != "admin":
        # Member only sees projects they belong to
        project_ids = [m.project_id for m in current_user.project_memberships]
        query = query.filter(AutomationProjectDB.id.in_(project_ids))

    projects = query.order_by(AutomationProjectDB.created_at.desc()).all()
    return [_project_to_response(p) for p in projects]


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_admin),
):
    """Admin-only: Create a new Jira & Git automation project."""
    proj = AutomationProjectDB(
        name=data.name,
        description=data.description,
        jira_domain=data.jira_domain,
        jira_email=data.jira_email,
        jira_api_token_encrypted=encrypt_secret(data.jira_api_token) if data.jira_api_token else None,
        jira_project_key=data.jira_project_key,
        jira_board_id=data.jira_board_id,
        source_repo_backend=data.source_repo_backend,
        source_repo_frontend=data.source_repo_frontend,
        target_repo_backend=data.target_repo_backend,
        target_repo_frontend=data.target_repo_frontend,
        custom_fields_map=data.custom_fields_map,
        telegram_bot_token_encrypted=encrypt_secret(data.telegram_bot_token) if data.telegram_bot_token else None,
        telegram_channel_chat_id=data.telegram_channel_chat_id,
        is_active=data.is_active,
    )
    db.add(proj)
    db.commit()
    db.refresh(proj)

    if proj.jira_board_id:
        jira = get_jira_client_for_project(proj)
        if jira:
            try:
                await jira.ensure_board_features(proj.jira_board_id)
            except Exception as fe:
                logger.warning(f"Could not auto-enable board features for board #{proj.jira_board_id}: {fe}")

    return _project_to_response(proj)


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: UserDB | None = Depends(get_current_user_optional),
):
    """Get project details."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return _project_to_response(proj)


def _resolve_base_url(request: Request, client_origin: str | None = None) -> str:
    """Resolve the public-facing API base URL for autonomous agents."""
    if client_origin and client_origin.strip():
        origin = client_origin.strip().rstrip("/")
        if not origin.endswith("/api/v1"):
            return f"{origin}/api/v1"
        return origin

    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "http"
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}/api/v1"


@router.get("/projects/{project_id}/agent-guide", response_model=AgentGuideResponse)
async def get_project_agent_guide(
    project_id: str,
    request: Request,
    origin: str | None = Query(None, description="Optional client origin to override base URL"),
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_admin),
):
    """Retrieve dynamically generated AGENTS.md and CLAUDE.md integration guides for a specific project."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    base_url = _resolve_base_url(request, origin)
    agents_md = generate_agents_guide(
        base_url=base_url,
        project_id=proj.id,
        project_name=proj.name,
        jira_key=proj.jira_project_key,
        jira_board_id=proj.jira_board_id,
    )
    claude_md = generate_claude_guide(
        base_url=base_url,
        project_id=proj.id,
        project_name=proj.name,
        jira_key=proj.jira_project_key,
        jira_board_id=proj.jira_board_id,
    )

    return AgentGuideResponse(
        project_id=proj.id,
        project_name=proj.name,
        jira_project_key=proj.jira_project_key,
        jira_board_id=proj.jira_board_id,
        base_url=base_url,
        agents_md=agents_md,
        claude_md=claude_md,
    )


@router.get("/agent-guide", response_model=AgentGuideResponse)
async def get_general_agent_guide(
    request: Request,
    project_id: str | None = Query(None, description="Optional project ID"),
    origin: str | None = Query(None, description="Optional client origin to override base URL"),
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_admin),
):
    """Retrieve dynamically generated AGENTS.md and CLAUDE.md integration guides."""
    proj = None
    if project_id:
        proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()

    base_url = _resolve_base_url(request, origin)
    agents_md = generate_agents_guide(
        base_url=base_url,
        project_id=proj.id if proj else None,
        project_name=proj.name if proj else None,
        jira_key=proj.jira_project_key if proj else None,
        jira_board_id=proj.jira_board_id if proj else None,
    )
    claude_md = generate_claude_guide(
        base_url=base_url,
        project_id=proj.id if proj else None,
        project_name=proj.name if proj else None,
        jira_key=proj.jira_project_key if proj else None,
        jira_board_id=proj.jira_board_id if proj else None,
    )

    return AgentGuideResponse(
        project_id=proj.id if proj else None,
        project_name=proj.name if proj else None,
        jira_project_key=proj.jira_project_key if proj else None,
        jira_board_id=proj.jira_board_id if proj else None,
        base_url=base_url,
        agents_md=agents_md,
        claude_md=claude_md,
    )


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_admin),
):
    """Admin-only: Update project configurations."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    if data.name is not None:
        proj.name = data.name
    if data.description is not None:
        proj.description = data.description
    if data.jira_domain is not None:
        proj.jira_domain = data.jira_domain
    if data.jira_email is not None:
        proj.jira_email = data.jira_email
    if data.jira_api_token is not None:
        proj.jira_api_token_encrypted = encrypt_secret(data.jira_api_token) if data.jira_api_token else None
    if data.jira_project_key is not None:
        proj.jira_project_key = data.jira_project_key
    if data.jira_board_id is not None:
        proj.jira_board_id = data.jira_board_id
    if data.source_repo_backend is not None:
        proj.source_repo_backend = data.source_repo_backend
    if data.source_repo_frontend is not None:
        proj.source_repo_frontend = data.source_repo_frontend
    if data.target_repo_backend is not None:
        target_repo_backend = data.target_repo_backend
        proj.target_repo_backend = target_repo_backend
    if data.target_repo_frontend is not None:
        proj.target_repo_frontend = data.target_repo_frontend
    if data.custom_fields_map is not None:
        proj.custom_fields_map = data.custom_fields_map
    if data.telegram_bot_token is not None:
        proj.telegram_bot_token_encrypted = encrypt_secret(data.telegram_bot_token) if data.telegram_bot_token else None
    if data.telegram_channel_chat_id is not None:
        proj.telegram_channel_chat_id = data.telegram_channel_chat_id
    if data.is_active is not None:
        proj.is_active = data.is_active

    db.commit()
    db.refresh(proj)

    if proj.jira_board_id:
        jira = get_jira_client_for_project(proj)
        if jira:
            try:
                await jira.ensure_board_features(proj.jira_board_id)
            except Exception as fe:
                logger.warning(f"Could not auto-enable board features for board #{proj.jira_board_id}: {fe}")

    return _project_to_response(proj)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: UserDB = Depends(require_admin),
):
    """Admin-only: Delete an automation project and its cascading resources."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(proj)
    db.commit()
    return None


# ==================== PROJECT MEMBERS ====================


@router.get("/projects/{project_id}/members", response_model=list[MemberResponse])
async def list_project_members(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: UserDB | None = Depends(get_current_user_optional),
):
    """List all members assigned to this project, auto-syncing from Jira API if available."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if proj and proj.jira_project_key:
        jira = get_jira_client_for_project(proj)
        if jira:
            try:
                discovered = await jira.discover_members(proj.jira_project_key)
                for d in discovered:
                    acct_id = d.get("account_id")
                    disp_name = (d.get("display_name") or "Jira User").strip()
                    email = (d.get("email") or "").strip()
                    if not acct_id:
                        continue

                    user = (
                        db.query(UserDB)
                        .join(UserCredentialsDB, UserDB.id == UserCredentialsDB.user_id, isouter=True)
                        .filter(
                            (UserCredentialsDB.jira_account_id == acct_id)
                            | ((UserDB.email == email) if email else False)
                            | (UserDB.display_name.ilike(disp_name))
                        )
                        .first()
                    )

                    clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", disp_name.lower())[:30].strip("_")
                    if not clean_name:
                        clean_name = "jira_user"
                    user_email = email if email else f"{clean_name}_{acct_id[-6:]}@jira.local"

                    if not user:
                        username = f"{clean_name}_{acct_id[-6:]}"
                        suffix = 1
                        while db.query(UserDB).filter(UserDB.username == username).first():
                            username = f"{clean_name}_{acct_id[-4:]}_{suffix}"
                            suffix += 1

                        user = UserDB(
                            id=str(uuid.uuid4()),
                            username=username,
                            display_name=disp_name,
                            email=user_email,
                            role="member",
                            password_hash="jira_synced_user",
                            is_active=True,
                        )
                        db.add(user)
                        db.flush()

                    creds = db.query(UserCredentialsDB).filter(UserCredentialsDB.user_id == user.id).first()
                    if not creds:
                        creds = UserCredentialsDB(
                            id=str(uuid.uuid4()),
                            user_id=user.id,
                            jira_account_id=acct_id,
                        )
                        db.add(creds)
                    elif not creds.jira_account_id:
                        creds.jira_account_id = acct_id

                    pm = (
                        db.query(ProjectMemberDB)
                        .filter(ProjectMemberDB.project_id == project_id, ProjectMemberDB.user_id == user.id)
                        .first()
                    )
                    if not pm:
                        role_proj = "lead" if "atai" in disp_name.lower() else "developer"
                        pm = ProjectMemberDB(
                            id=str(uuid.uuid4()),
                            project_id=project_id,
                            user_id=user.id,
                            role_in_project=role_proj,
                        )
                        db.add(pm)

                db.commit()
            except Exception as e:
                logger.warning(f"Auto-sync members from Jira failed: {e}")
                db.rollback()

    members = db.query(ProjectMemberDB).filter(ProjectMemberDB.project_id == project_id).all()
    # Sort with Atai first, then alphabetical by display name
    members.sort(
        key=lambda m: (
            0 if m.user and "atai" in (m.user.display_name or "").lower() else 1,
            (m.user.display_name or "").lower() if m.user else "",
        )
    )

    results = []
    for m in members:
        user = m.user
        if not user:
            continue
        creds = user.credentials if user else None
        results.append(
            MemberResponse(
                id=m.id,
                user_id=user.id,
                username=user.username,
                email=user.email,
                display_name=user.display_name or user.username or "Member",
                role=user.role,
                role_in_project=m.role_in_project or "developer",
                jira_account_id=creds.jira_account_id if creds else None,
                git_author_name=creds.git_author_name if creds else None,
                git_author_email=creds.git_author_email if creds else None,
                has_github_token=bool(creds and creds.github_token_encrypted),
                telegram_chat_id=(
                    user.telegram_chat_id
                    if (current_user and (current_user.role == "admin" or current_user.id == user.id))
                    else None
                ),
            )
        )
    return results


@router.get("/projects/{project_id}/issue-types", response_model=list[IssueTypeResponse])
async def get_project_issue_types(
    project_id: str,
    db: Session = Depends(get_db),
    _: UserDB | None = Depends(get_current_user_optional),
):
    """Fetch available issue types for the project directly from Jira."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    default_types = [
        IssueTypeResponse(name="Task", subtask=False),
        IssueTypeResponse(name="Meeting", subtask=False),
        IssueTypeResponse(name="Research", subtask=False),
    ]

    has_jira = bool(proj.jira_domain and proj.jira_email and proj.jira_api_token_encrypted and proj.jira_project_key)
    if not has_jira:
        return default_types

    try:
        raw_token = decrypt_secret(proj.jira_api_token_encrypted)
        jira = JiraClient(proj.jira_domain, proj.jira_email, raw_token)
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"{jira.base_url}/api/3/project/{proj.jira_project_key}",
                headers=jira.headers,
            )
            if res.status_code == 200:
                pdata = res.json()
                types = []
                for it in pdata.get("issueTypes", []):
                    # Exclude subtasks and Epics (Epics are level 1 containers that do not appear as cards on Jira boards)
                    if it.get("subtask") or it.get("hierarchyLevel", 0) > 0 or it.get("name", "").lower() == "epic":
                        continue
                    types.append(
                        IssueTypeResponse(
                            name=it.get("name"),
                            id=str(it.get("id")),
                            subtask=False,
                            description=it.get("description"),
                            icon_url=it.get("iconUrl"),
                        )
                    )
                if types:
                    types.sort(key=lambda t: (0 if t.name.lower() == "task" else 1, t.name))
                    return types
    except Exception as e:
        logger.warning(f"Failed to fetch issue types from Jira for {proj.name}: {e}")

    return default_types


@router.post("/projects/{project_id}/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def add_project_member(
    project_id: str,
    data: MemberAdd,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_admin),
):
    """Add a registered user to the automation project."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    user = db.query(UserDB).filter(UserDB.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (
        db.query(ProjectMemberDB)
        .filter(ProjectMemberDB.project_id == project_id, ProjectMemberDB.user_id == data.user_id)
        .first()
    )
    if existing:
        existing.role_in_project = data.role_in_project
        db.commit()
        db.refresh(existing)
        m = existing
    else:
        m = ProjectMemberDB(project_id=project_id, user_id=data.user_id, role_in_project=data.role_in_project)
        db.add(m)
        db.commit()
        db.refresh(m)

    creds = user.credentials
    return MemberResponse(
        id=m.id,
        user_id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name or user.username or "Member",
        role=user.role,
        role_in_project=m.role_in_project,
        jira_account_id=creds.jira_account_id if creds else None,
        git_author_name=creds.git_author_name if creds else None,
        git_author_email=creds.git_author_email if creds else None,
        has_github_token=bool(creds and creds.github_token_encrypted),
        telegram_chat_id=user.telegram_chat_id,
    )


@router.delete("/projects/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_member(
    project_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_admin),
):
    """Remove a member from the project."""
    m = (
        db.query(ProjectMemberDB)
        .filter(ProjectMemberDB.project_id == project_id, ProjectMemberDB.user_id == user_id)
        .first()
    )
    if m:
        db.delete(m)
        db.commit()
    return None


# ==================== JIRA DISCOVERY & CONNECTIVITY ====================


@router.post("/projects/{project_id}/test-connection")
async def test_project_jira_connection(
    project_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Test Jira credentials and return authenticated user details."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials are not configured for this project")

    try:
        user_info = await jira.test_connection()
        return {
            "status": "connected",
            "displayName": user_info.get("displayName"),
            "emailAddress": user_info.get("emailAddress"),
            "accountId": user_info.get("accountId"),
        }
    except Exception as e:
        logger.error(f"Jira test connection failed: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to connect to Jira: {str(e)}")


@router.get("/projects/{project_id}/discover/members")
async def discover_jira_members(
    project_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Fetch assignable Jira users for the project to easily map account IDs."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials are not configured")

    if not proj.jira_project_key:
        raise HTTPException(status_code=400, detail="Jira project key is required for user search")

    try:
        members = await jira.discover_members(proj.jira_project_key)
        return members
    except Exception as e:
        logger.error(f"Discover members failed: {e}")
        raise HTTPException(status_code=400, detail=f"Could not discover Jira users: {str(e)}")


@router.get("/projects/{project_id}/discover/fields")
async def discover_jira_fields(
    project_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Fetch Jira custom fields to help configure story points and custom attributes."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials are not configured")

    try:
        fields = await jira.discover_custom_fields()
        return fields
    except Exception as e:
        logger.error(f"Discover fields failed: {e}")
        raise HTTPException(status_code=400, detail=f"Could not discover Jira fields: {str(e)}")


@router.get("/projects/{project_id}/discover/boards")
async def discover_jira_boards(
    project_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """List all accessible Agile boards in Jira."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials are not configured")

    try:
        boards = await jira.get_boards()
        return boards
    except Exception as e:
        logger.error(f"Discover boards failed: {e}")
        raise HTTPException(status_code=400, detail=f"Could not discover Jira boards: {str(e)}")


@router.post("/projects/{project_id}/sync-sprints")
async def sync_jira_sprints(
    project_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Sync sprints and their issues from Jira board into the local database."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    if not proj.jira_board_id:
        raise HTTPException(status_code=400, detail="jira_board_id is required to sync sprints")

    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials are not configured")

    try:
        if proj.jira_board_id:
            try:
                await jira.ensure_board_features(proj.jira_board_id)
            except Exception as fe:
                logger.debug(f"Could not auto-enable board features for board #{proj.jira_board_id}: {fe}")

        try:
            jira_sprints = await jira.get_sprints(proj.jira_board_id)
        except Exception as se_err:
            logger.info(f"Board #{proj.jira_board_id} sprints query error (likely Kanban): {se_err}")
            jira_sprints = []

        synced_sprints_count = 0
        synced_tasks_count = 0
        sprints_to_process = []

        for js in jira_sprints:
            js_id = js.get("id")
            name = js.get("name")
            state = js.get("state")  # active, closed, future
            start_date_str = js.get("startDate")
            end_date_str = js.get("endDate")
            complete_date_str = js.get("completeDate")

            now_utc = datetime.now(UTC)
            if start_date_str:
                try:
                    start_dt = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
                except Exception:
                    start_dt = now_utc
            elif js.get("createdDate"):
                try:
                    start_dt = datetime.fromisoformat(js["createdDate"].replace("Z", "+00:00"))
                except Exception:
                    start_dt = now_utc
            else:
                start_dt = now_utc

            if end_date_str:
                try:
                    effective_end_str = complete_date_str if (state == "closed" and complete_date_str) else end_date_str
                    end_dt = datetime.fromisoformat(effective_end_str.replace("Z", "+00:00"))
                except Exception:
                    end_dt = start_dt + timedelta(days=14)
            else:
                end_dt = start_dt + timedelta(days=14)

            existing = (
                db.query(AutomationSprintDB)
                .filter(
                    AutomationSprintDB.project_id == project_id,
                    AutomationSprintDB.jira_sprint_id == js_id,
                )
                .first()
            )

            if not existing:
                new_sprint = AutomationSprintDB(
                    project_id=project_id,
                    name=name,
                    start_date=start_dt,
                    end_date=end_dt,
                    jira_sprint_id=js_id,
                    board_id=proj.jira_board_id,
                    started=(state == "active" or state == "closed"),
                    closed=(state == "closed"),
                    from_jira=True,
                )
                db.add(new_sprint)
                db.flush()
                sprints_to_process.append((new_sprint, js_id))
                synced_sprints_count += 1
            else:
                existing.name = name
                existing.start_date = start_dt
                existing.end_date = end_dt
                existing.started = state == "active" or state == "closed"
                existing.closed = state == "closed"
                existing.board_id = proj.jira_board_id
                sprints_to_process.append((existing, js_id))

        # Now fetch issues for each sprint
        for sprint_db, js_id in sprints_to_process:
            try:
                # Remove any existing tasks in this sprint that belong to another project
                if proj.jira_project_key:
                    prefix = f"{proj.jira_project_key.upper()}-"
                    foreign_tasks = (
                        db.query(AutomationTaskDB)
                        .filter(
                            AutomationTaskDB.sprint_id == sprint_db.id,
                            AutomationTaskDB.jira_issue_key.isnot(None),
                            ~AutomationTaskDB.jira_issue_key.startswith(prefix),
                        )
                        .all()
                    )
                    for ft in foreign_tasks:
                        logger.info(f"Removing foreign task {ft.jira_issue_key} from sprint {sprint_db.name}")
                        db.delete(ft)
                    if foreign_tasks:
                        db.flush()

                issues = await jira.get_sprint_issues(js_id)
                for iss in issues:
                    key = iss.get("key")
                    if not key:
                        continue
                    if proj.jira_project_key and not key.upper().startswith(f"{proj.jira_project_key.upper()}-"):
                        continue
                    fields = iss.get("fields", {})
                    summary = fields.get("summary") or key
                    status_name = fields.get("status", {}).get("name", "To Do")
                    priority_name = fields.get("priority", {}).get("name", "Medium")
                    issue_type_name = fields.get("issuetype", {}).get("name", "Task")
                    assignee_acc = fields.get("assignee", {}).get("accountId") if fields.get("assignee") else None
                    points = fields.get("customfield_10016")

                    local_assignee_id = None
                    if assignee_acc:
                        creds = db.query(UserCredentialsDB).filter(UserCredentialsDB.jira_account_id == assignee_acc).first()
                        if creds:
                            local_assignee_id = creds.user_id

                    existing_t = (
                        db.query(AutomationTaskDB)
                        .filter(
                            AutomationTaskDB.sprint_id == sprint_db.id,
                            AutomationTaskDB.jira_issue_key == key,
                        )
                        .first()
                    )
                    if not existing_t:
                        new_t = AutomationTaskDB(
                            sprint_id=sprint_db.id,
                            title=summary,
                            jira_issue_key=key,
                            created=True,
                            current_status=status_name,
                            priority=priority_name,
                            issue_type=issue_type_name,
                            story_points=float(points) if points is not None else None,
                            assignee_id=local_assignee_id,
                            from_jira=True,
                            start_date=sprint_db.start_date,
                            due_date=sprint_db.end_date,
                            create_at=sprint_db.start_date,
                        )
                        db.add(new_t)
                        synced_tasks_count += 1
                    else:
                        existing_t.title = summary
                        existing_t.current_status = status_name
                        if local_assignee_id:
                            existing_t.assignee_id = local_assignee_id
            except Exception as se:
                logger.warning(f"Could not fetch sprint issues for #{js_id}: {se}")

        # If board has issues and sprints weren't returned by Jira, attach to active sprint if one exists
        if len(jira_sprints) == 0:
            target_sprint = (
                db.query(AutomationSprintDB)
                .filter(AutomationSprintDB.project_id == project_id, AutomationSprintDB.closed == False)
                .order_by(AutomationSprintDB.start_date.desc())
                .first()
            )
            if target_sprint:
                try:
                    board_issues = await jira.get_board_issues(proj.jira_board_id)
                    if not board_issues and proj.jira_project_key:
                        try:
                            board_issues = await jira.get_project_issues(proj.jira_project_key)
                        except Exception as pe_err:
                            logger.warning(f"Could not fetch issues via project JQL: {pe_err}")

                    for iss in (board_issues or []):
                        key = iss.get("key")
                        if not key:
                            continue
                        if proj.jira_project_key and not key.upper().startswith(f"{proj.jira_project_key.upper()}-"):
                            continue
                        fields = iss.get("fields", {})
                        summary = fields.get("summary") or key
                        status_name = fields.get("status", {}).get("name", "To Do")
                        priority_name = fields.get("priority", {}).get("name", "Medium")
                        issue_type_name = fields.get("issuetype", {}).get("name", "Task")
                        assignee_acc = fields.get("assignee", {}).get("accountId") if fields.get("assignee") else None
                        points = fields.get("customfield_10016")
                        local_assignee_id = None
                        if assignee_acc:
                            creds = db.query(UserCredentialsDB).filter(UserCredentialsDB.jira_account_id == assignee_acc).first()
                            if creds:
                                local_assignee_id = creds.user_id

                        existing_t = (
                            db.query(AutomationTaskDB)
                            .filter(
                                AutomationTaskDB.sprint_id == target_sprint.id,
                                AutomationTaskDB.jira_issue_key == key,
                            )
                            .first()
                        )
                        if not existing_t:
                            new_t = AutomationTaskDB(
                                sprint_id=target_sprint.id,
                                title=summary,
                                jira_issue_key=key,
                                created=True,
                                current_status=status_name,
                                priority=priority_name,
                                issue_type=issue_type_name,
                                story_points=float(points) if points is not None else None,
                                assignee_id=local_assignee_id,
                                from_jira=True,
                                start_date=target_sprint.start_date,
                                due_date=target_sprint.end_date,
                                create_at=target_sprint.start_date,
                            )
                            db.add(new_t)
                            synced_tasks_count += 1
                        else:
                            existing_t.title = summary
                            existing_t.current_status = status_name
                            if local_assignee_id:
                                existing_t.assignee_id = local_assignee_id
                except Exception as be:
                    logger.warning(f"Could not fetch board issues: {be}")

        db.commit()
        return {
            "status": "ok",
            "synced": synced_sprints_count,
            "synced_sprints": synced_sprints_count,
            "synced_tasks": synced_tasks_count,
            "total_board_sprints": len(jira_sprints),
        }
    except Exception as e:
        logger.error(f"Sync sprints failed: {e}")
        raise HTTPException(status_code=400, detail=f"Could not sync from Jira: {str(e)}")


# ==================== SPRINTS CRUD ====================


@router.get("/projects/{project_id}/sprints", response_model=list[SprintResponse])
async def list_sprints(
    project_id: str,
    board_id: int | None = None,
    db: Session = Depends(get_db),
    _: UserDB | None = Depends(get_current_user_optional),
):
    """List all sprints for a project ordered by start date, filtered by active board."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    active_board = board_id if board_id is not None else (proj.jira_board_id if proj else None)

    query = db.query(AutomationSprintDB).filter(AutomationSprintDB.project_id == project_id)
    if active_board:
        query = query.filter(
            (AutomationSprintDB.board_id == active_board) | (AutomationSprintDB.board_id.is_(None))
        )
    sprints = query.order_by(AutomationSprintDB.start_date.asc()).all()

    return [_sprint_to_response(s) for s in sprints]


@router.post("/projects/{project_id}/sprints", response_model=SprintResponse, status_code=status.HTTP_201_CREATED)
async def create_sprint(
    project_id: str,
    data: SprintCreate,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Create and schedule a new automation sprint. If start_now=True, immediately starts in Jira."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    jira = get_jira_client_for_project(proj)
    target_board_id = data.board_id or proj.jira_board_id
    if not target_board_id and proj.jira_project_key and jira:
        try:
            boards = await jira.get_boards(proj.jira_project_key)
            if boards:
                target_board_id = boards[0].get("id")
        except Exception:
            pass

    sprint = AutomationSprintDB(
        project_id=project_id,
        name=data.name,
        start_date=data.start_date,
        end_date=data.end_date,
        jira_sprint_id=None,
        board_id=target_board_id,
        started=False,
        closed=False,
    )
    db.add(sprint)
    db.commit()
    db.refresh(sprint)

    if data.start_now and jira:
        try:
            await execute_sprint_start(db, proj, jira, sprint, datetime.now(UTC))
            db.refresh(sprint)
        except Exception as e:
            logger.error(f"Error starting sprint immediately: {e}")
    elif target_board_id and jira:
        try:
            start_iso = _to_utc(data.start_date).isoformat()
            end_iso = _to_utc(data.end_date).isoformat()
            jira_sprint_id = await jira.create_sprint(
                name=data.name,
                start_date=start_iso,
                end_date=end_iso,
                board_id=target_board_id,
                activate=False,
            )
            sprint.jira_sprint_id = jira_sprint_id
            db.commit()
            db.refresh(sprint)
        except Exception as je:
            logger.warning(f"Could not pre-create sprint in Jira Cloud: {je}")

    return _sprint_to_response(sprint)


@router.get("/sprints/{sprint_id}", response_model=SprintResponse)
async def get_sprint(
    sprint_id: str,
    db: Session = Depends(get_db),
    _: UserDB | None = Depends(get_current_user_optional),
):
    """Get single sprint with full task schedule."""
    sprint = db.query(AutomationSprintDB).filter(AutomationSprintDB.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    return _sprint_to_response(sprint)


@router.patch("/sprints/{sprint_id}", response_model=SprintResponse)
async def update_sprint(
    sprint_id: str,
    data: SprintUpdate,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Update and reschedule sprint dates, name, or status."""
    sprint = db.query(AutomationSprintDB).filter(AutomationSprintDB.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    if data.name is not None:
        sprint.name = data.name
    if data.start_date is not None:
        sprint.start_date = data.start_date
    if data.end_date is not None:
        sprint.end_date = data.end_date

    proj = sprint.project
    jira = get_jira_client_for_project(proj) if proj else None

    # Handle explicit start transition
    if data.started is not None:
        if data.started and not sprint.started:
            if jira and proj:
                try:
                    await execute_sprint_start(db, proj, jira, sprint, datetime.now(UTC))
                except Exception as e:
                    logger.warning(f"Failed to start sprint in Jira: {e}")
            sprint.started = True
        elif not data.started:
            sprint.started = False

    # Handle explicit close transition
    if data.closed is not None:
        if data.closed and not sprint.closed:
            if jira and proj:
                try:
                    await execute_sprint_close(db, proj, jira, sprint)
                except Exception as e:
                    logger.warning(f"Failed to close sprint in Jira: {e}")
            sprint.closed = True
        elif not data.closed:
            sprint.closed = False

    # Sync dates/name update to Jira if already created in Jira
    if sprint.jira_sprint_id and jira:
        try:
            jira_state = "active" if sprint.started else "closed" if sprint.closed else "future"
            start_utc = _to_utc(sprint.start_date)
            end_utc = _to_utc(sprint.end_date)
            await jira.update_sprint(
                sprint_id=sprint.jira_sprint_id,
                name=sprint.name,
                start_date=start_utc.isoformat() if start_utc else None,
                end_date=end_utc.isoformat() if end_utc else None,
                state=jira_state,
            )
        except Exception as je:
            logger.warning(f"Could not sync sprint update to Jira: {je}")

    db.commit()
    db.refresh(sprint)

    return _sprint_to_response(sprint)


@router.post("/sprints/{sprint_id}/push-to-jira", response_model=SprintResponse)
async def push_sprint_to_jira(
    sprint_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Explicitly create and sync a local sprint in Jira Cloud."""
    sprint = db.query(AutomationSprintDB).filter(AutomationSprintDB.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    proj = sprint.project
    if not proj:
        raise HTTPException(status_code=400, detail="Sprint has no associated project")
    if not proj.jira_board_id:
        raise HTTPException(status_code=400, detail="Project does not have a Jira Board ID configured")

    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials not configured for project")

    try:
        start_utc = _to_utc(sprint.start_date)
        end_utc = _to_utc(sprint.end_date)
        jira_sprint_id = await jira.create_sprint(
            name=sprint.name,
            start_date=start_utc.isoformat() if start_utc else "",
            end_date=end_utc.isoformat() if end_utc else "",
            board_id=proj.jira_board_id,
            activate=sprint.started,
        )
        sprint.jira_sprint_id = jira_sprint_id
        db.commit()
        db.refresh(sprint)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create sprint in Jira: {e}")

    return _sprint_to_response(sprint)


@router.delete("/sprints/{sprint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sprint(
    sprint_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Delete sprint and cascade tasks."""
    sprint = db.query(AutomationSprintDB).filter(AutomationSprintDB.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    if sprint.jira_sprint_id:
        proj = sprint.project
        jira = get_jira_client_for_project(proj) if proj else None
        if jira:
            try:
                await jira.delete_sprint(sprint.jira_sprint_id)
            except Exception as e:
                logger.warning(f"Could not delete sprint {sprint.jira_sprint_id} from Jira: {e}")

    db.delete(sprint)
    db.commit()
    return None


@router.post("/sprints/{sprint_id}/start", response_model=SprintResponse)
async def start_sprint(
    sprint_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Explicitly start sprint immediately in Jira Agile and create initial tasks."""
    sprint = db.query(AutomationSprintDB).filter(AutomationSprintDB.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    proj = sprint.project
    if not proj:
        raise HTTPException(status_code=400, detail="Sprint has no associated project")
    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials not configured")
    try:
        await execute_sprint_start(db, proj, jira, sprint, datetime.now(UTC))
        db.refresh(sprint)
    except Exception as e:
        logger.error(f"Failed to start sprint: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start sprint in Jira: {e}")

    return _sprint_to_response(sprint)


@router.post("/sprints/{sprint_id}/close", response_model=SprintResponse)
async def close_sprint(
    sprint_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Explicitly close sprint in Jira Agile. Incomplete tasks move to backlog."""
    sprint = db.query(AutomationSprintDB).filter(AutomationSprintDB.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    proj = sprint.project
    if not proj:
        raise HTTPException(status_code=400, detail="Sprint has no associated project")
    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials not configured")
    try:
        await execute_sprint_close(db, proj, jira, sprint)
        db.refresh(sprint)
    except Exception as e:
        logger.error(f"Failed to close sprint: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to close sprint in Jira: {e}")

    return _sprint_to_response(sprint)


@router.post("/projects/{project_id}/trigger/sprint-start")
async def trigger_sprint_start(
    project_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Manually trigger sprint start evaluation for a project."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials not configured")
    await process_sprint_starts(db, proj, jira, datetime.now(UTC))
    return {"status": "ok", "message": "Evaluated sprint start schedule"}


@router.post("/projects/{project_id}/trigger/moves")
async def trigger_moves(
    project_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Manually trigger move processing for a project."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials not configured")
    await process_moves(db, proj, jira, datetime.now(UTC))
    return {"status": "ok", "message": "Processed due moves and creations"}


@router.post("/projects/{project_id}/trigger/sprint-close")
async def trigger_sprint_close(
    project_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Manually trigger sprint close evaluation for a project."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials not configured")
    await process_sprint_closes(db, proj, jira, datetime.now(UTC))
    return {"status": "ok", "message": "Evaluated sprint close schedule"}


# ==================== TASKS & STATUS MOVES ====================


@router.post("/sprints/{sprint_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    sprint_id: str,
    data: TaskCreate,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Create a new automation task with scheduled status transitions."""
    sprint = db.query(AutomationSprintDB).filter(AutomationSprintDB.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    assignee_id = data.assignee_id
    if not assignee_id:
        if current_user:
            assignee_id = current_user.id
        else:
            first_m = db.query(ProjectMemberDB).filter(ProjectMemberDB.project_id == sprint.project_id).first()
            if first_m:
                assignee_id = first_m.user_id

    task = AutomationTaskDB(
        sprint_id=sprint_id,
        assignee_id=assignee_id,
        title=data.title,
        description=data.description,
        priority=data.priority,
        issue_type=data.issue_type,
        current_status="To Do",
        create_at=data.create_at,
        start_date=data.start_date,
        due_date=data.due_date,
        story_points=data.story_points,
        original_estimate=data.original_estimate,
        time_spent=data.time_spent,
        git_config=data.git_config,
        custom_fields=data.custom_fields,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # Insert status moves
    for m in data.moves:
        move = TaskStatusMoveDB(
            task_id=task.id,
            status=m.status,
            move_at=m.move_at,
            done=False,
        )
        db.add(move)

    if data.moves:
        db.commit()
        db.refresh(task)

    # If create_at is None or <= now, create immediately in Jira
    now_utc = datetime.now(UTC).replace(tzinfo=None)
    create_at_norm = _normalize_dt(task.create_at)
    if not task.created and (create_at_norm is None or create_at_norm <= now_utc):
        proj = sprint.project
        jira = get_jira_client_for_project(proj) if proj else None
        if jira:
            try:
                jira_assignee_id = None
                if task.assignee and task.assignee.credentials:
                    jira_assignee_id = task.assignee.credentials.jira_account_id
                if not jira_assignee_id and task.assignee_id:
                    creds = db.query(UserCredentialsDB).filter(UserCredentialsDB.user_id == task.assignee_id).first()
                    if creds and creds.jira_account_id:
                        jira_assignee_id = creds.jira_account_id
                if not jira_assignee_id:
                    member_cred = (
                        db.query(UserCredentialsDB)
                        .join(ProjectMemberDB, ProjectMemberDB.user_id == UserCredentialsDB.user_id)
                        .filter(ProjectMemberDB.project_id == sprint.project_id, UserCredentialsDB.jira_account_id.isnot(None))
                        .first()
                    )
                    if member_cred and member_cred.jira_account_id:
                        jira_assignee_id = member_cred.jira_account_id

                key = await jira.create_issue(
                    project_key=proj.jira_project_key or "KAN",
                    summary=task.title,
                    description=task.description or "",
                    issue_type=task.issue_type or "Task",
                    priority=task.priority or "Medium",
                    start_date=_to_utc(task.start_date).isoformat() if task.start_date else None,
                    due_date=_to_utc(task.due_date).isoformat() if task.due_date else None,
                    story_points=task.story_points,
                    original_estimate=task.original_estimate,
                    time_spent=task.time_spent,
                    assignee_account_id=jira_assignee_id,
                    custom_fields=task.custom_fields,
                )
                task.jira_issue_key = key
                task.created = True
                if sprint.jira_sprint_id:
                    try:
                        await jira.add_to_sprint(sprint.jira_sprint_id, key)
                    except Exception as se:
                        logger.warning(f"Could not add {key} to sprint {sprint.jira_sprint_id}: {se}")
                elif proj.jira_board_id:
                    try:
                        await jira.move_issues_to_board(proj.jira_board_id, [key])
                    except Exception as be:
                        logger.warning(f"Could not move {key} to board {proj.jira_board_id}: {be}")

                db.commit()
                db.refresh(task)
                logger.info(f"Task '{task.title}' created immediately in Jira as {key} on board {proj.jira_board_id}")
            except Exception as e:
                logger.warning(f"Immediate Jira issue creation failed (scheduler will retry): {e}")

    return _task_to_response(task)


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    _: UserDB | None = Depends(get_current_user_optional),
):
    """Get task details and its scheduled moves."""
    task = db.query(AutomationTaskDB).filter(AutomationTaskDB.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_to_response(task)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: str,
    data: TaskUpdate,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Update task details."""
    task = db.query(AutomationTaskDB).filter(AutomationTaskDB.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if data.title is not None:
        task.title = data.title
    if data.description is not None:
        task.description = data.description
    if data.priority is not None:
        task.priority = data.priority
    if data.issue_type is not None:
        task.issue_type = data.issue_type
    if data.assignee_id is not None:
        task.assignee_id = data.assignee_id
    if data.current_status is not None:
        task.current_status = data.current_status
    if data.create_at is not None:
        task.create_at = data.create_at
    if data.start_date is not None:
        task.start_date = data.start_date
    if data.due_date is not None:
        task.due_date = data.due_date
    if data.story_points is not None:
        task.story_points = data.story_points
    if data.original_estimate is not None:
        task.original_estimate = data.original_estimate
    if data.time_spent is not None:
        task.time_spent = data.time_spent
    if data.git_config is not None:
        task.git_config = data.git_config
    if data.custom_fields is not None:
        task.custom_fields = data.custom_fields

    if data.moves is not None:
        existing_by_id = {m.id: m for m in task.moves}
        existing_done_statuses = {m.status for m in task.moves if m.done}
        incoming_ids = {m.id for m in data.moves if m.id}

        # Remove pending moves that were deleted by user in UI
        for m in list(task.moves):
            if not m.done and m.id not in incoming_ids:
                db.delete(m)

        # Process incoming moves
        for m in data.moves:
            if m.id and m.id in existing_by_id:
                existing_m = existing_by_id[m.id]
                if not existing_m.done:
                    existing_m.status = m.status
                    existing_m.move_at = m.move_at
            else:
                # Do NOT create duplicate move for a status that was already completed!
                if m.status not in existing_done_statuses:
                    new_m = TaskStatusMoveDB(
                        task_id=task.id,
                        status=m.status,
                        move_at=m.move_at,
                        done=False,
                    )
                    db.add(new_m)

    if data.sprint_id is not None and data.sprint_id != task.sprint_id:
        target_sprint = db.query(AutomationSprintDB).filter(AutomationSprintDB.id == data.sprint_id).first()
        if not target_sprint:
            raise HTTPException(status_code=404, detail="Target sprint not found")
        task.sprint_id = data.sprint_id
        if task.jira_issue_key and target_sprint.jira_sprint_id:
            proj = target_sprint.project
            if proj:
                jira = get_jira_client_for_project(proj)
                if jira:
                    try:
                        await jira.move_issues_to_sprint(target_sprint.jira_sprint_id, [task.jira_issue_key])
                    except Exception as je:
                        logger.warning(f"Could not move issue {task.jira_issue_key} to sprint in Jira: {je}")

    if task.jira_issue_key:
        proj = task.sprint.project if task.sprint else None
        if proj:
            jira = get_jira_client_for_project(proj)
            if jira:
                try:
                    await jira.update_issue(
                        issue_key=task.jira_issue_key,
                        summary=task.title,
                        description=task.description,
                        priority=task.priority,
                        start_date=task.start_date.isoformat() if task.start_date else None,
                        due_date=task.due_date.isoformat() if task.due_date else None,
                        story_points=task.story_points,
                    )
                except Exception as je:
                    logger.warning(f"Could not sync issue update to Jira: {je}")

    db.commit()
    db.refresh(task)
    return _task_to_response(task)


@router.post("/tasks/{task_id}/move-to-sprint", response_model=TaskResponse)
async def move_task_to_sprint(
    task_id: str,
    data: MoveTaskToSprintRequest,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Move a task to a different sprint and sync with Jira if applicable."""
    task = db.query(AutomationTaskDB).filter(AutomationTaskDB.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    target_sprint = db.query(AutomationSprintDB).filter(AutomationSprintDB.id == data.sprint_id).first()
    if not target_sprint:
        raise HTTPException(status_code=404, detail="Target sprint not found")

    task.sprint_id = data.sprint_id

    if task.jira_issue_key and target_sprint.jira_sprint_id:
        proj = target_sprint.project
        if proj:
            jira = get_jira_client_for_project(proj)
            if jira:
                try:
                    await jira.move_issues_to_sprint(target_sprint.jira_sprint_id, [task.jira_issue_key])
                except Exception as je:
                    logger.warning(f"Could not move issue {task.jira_issue_key} to sprint in Jira: {je}")

    db.commit()
    db.refresh(task)
    return _task_to_response(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Delete task and scheduled transitions."""
    task = db.query(AutomationTaskDB).filter(AutomationTaskDB.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.jira_issue_key:
        proj = task.sprint.project if task.sprint else None
        jira = get_jira_client_for_project(proj) if proj else None
        if jira:
            try:
                await jira.delete_issue(task.jira_issue_key)
            except Exception as e:
                logger.warning(f"Could not delete {task.jira_issue_key} from Jira: {e}")

    db.delete(task)
    db.commit()
    return None


@router.post("/tasks/{task_id}/moves", response_model=MoveResponse, status_code=status.HTTP_201_CREATED)
async def add_task_move(
    task_id: str,
    data: MoveCreate,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Add a scheduled status move for an existing task."""
    task = db.query(AutomationTaskDB).filter(AutomationTaskDB.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    move = TaskStatusMoveDB(
        task_id=task_id,
        status=data.status,
        move_at=data.move_at,
        done=False,
    )
    db.add(move)
    db.commit()
    db.refresh(move)

    return MoveResponse(
        id=move.id,
        task_id=move.task_id,
        status=move.status,
        from_status=move.from_status,
        move_at=move.move_at,
        done=move.done,
        executed_at=move.executed_at,
    )


@router.delete("/moves/{move_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_move(
    move_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Delete a scheduled move."""
    move = db.query(TaskStatusMoveDB).filter(TaskStatusMoveDB.id == move_id).first()
    if move:
        db.delete(move)
        db.commit()
    return None


# ==================== MANUAL TEST TRIGGERS ====================


@router.post("/projects/{project_id}/trigger/sprint-start")
async def trigger_sprint_start_manual(
    project_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Manually invoke sprint start checks for testing."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials are not configured")

    now = datetime.now(UTC)
    await process_sprint_starts(db, proj, jira, now)
    return {"status": "ok", "message": "Sprint start check completed"}


@router.post("/projects/{project_id}/trigger/sprint-close")
async def trigger_sprint_close_manual(
    project_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Manually invoke sprint close checks for testing."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials are not configured")

    now = datetime.now(UTC)
    await process_sprint_closes(db, proj, jira, now)
    return {"status": "ok", "message": "Sprint close check completed"}


@router.post("/projects/{project_id}/trigger/moves")
async def trigger_moves_manual(
    project_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Manually process task creations and status transitions for testing."""
    proj = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials are not configured")

    now = datetime.now(UTC)
    await process_moves(db, proj, jira, now)
    return {"status": "ok", "message": "Status moves processed"}


@router.post("/tasks/{task_id}/trigger-create")
async def trigger_task_create_manual(
    task_id: str,
    db: Session = Depends(get_db),
    _: UserDB = Depends(require_auth),
):
    """Immediately create this task in Jira and add to sprint."""
    task = db.query(AutomationTaskDB).filter(AutomationTaskDB.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    sprint = task.sprint
    proj = sprint.project if sprint else None
    if not proj:
        raise HTTPException(status_code=400, detail="Project not linked")

    jira = get_jira_client_for_project(proj)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials not configured")

    assignee_id = None
    if task.assignee and task.assignee.credentials:
        assignee_id = task.assignee.credentials.jira_account_id
    if not assignee_id and sprint:
        member_cred = (
            db.query(UserCredentialsDB)
            .join(ProjectMemberDB, ProjectMemberDB.user_id == UserCredentialsDB.user_id)
            .filter(ProjectMemberDB.project_id == sprint.project_id, UserCredentialsDB.jira_account_id.isnot(None))
            .first()
        )
        if member_cred and member_cred.jira_account_id:
            assignee_id = member_cred.jira_account_id

    try:
        key = await jira.create_issue(
            project_key=proj.jira_project_key or "KAN",
            summary=task.title,
            description=task.description or "",
            issue_type=task.issue_type or "Task",
            priority=task.priority or "Medium",
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
        elif proj.jira_board_id:
            try:
                await jira.move_issues_to_board(proj.jira_board_id, [key])
            except Exception as be:
                logger.warning(f"Could not move {key} to board {proj.jira_board_id}: {be}")

        db.commit()
        db.refresh(task)
        return _task_to_response(task)
    except Exception as e:
        logger.error(f"Manual task create failed: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to create task in Jira: {str(e)}")


class AgentChatRequest(BaseModel):
    project_id: str
    message: str
    history: list[dict[str, str]] | None = None


class AgentChatResponse(BaseModel):
    message: str
    plan: dict[str, Any] | None = None


class AgentExecutePlanRequest(BaseModel):
    project_id: str
    plan: dict[str, Any]


class AgentExecutePlanResponse(BaseModel):
    success: bool
    message: str
    created_sprints: int = 0
    updated_sprints: int = 0
    created_tasks: int = 0
    updated_tasks: int = 0
    created_moves: int = 0


@router.post("/agent/chat", response_model=AgentChatResponse)
async def agent_chat(
    payload: AgentChatRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Planner Agent: Analyzes user prompt and generates a structured draft plan."""
    creds = current_user.credentials if hasattr(current_user, "credentials") else None
    user_gemini_key = decrypt_secret(creds.gemini_api_key_encrypted) if (creds and creds.gemini_api_key_encrypted) else None
    
    if not user_gemini_key:
        settings = get_settings()
        if settings.gemini_api_key:
            user_gemini_key = settings.gemini_api_key

    if not user_gemini_key:
        raise HTTPException(
            status_code=400,
            detail="Gemini API Key is not configured. Please add your personal Gemini token in your User Profile first."
        )

    from app.core.ai_credentials import normalize_gemini_model
    model_name = normalize_gemini_model(creds.gemini_model if creds else None)

    project = None
    if payload.project_id:
        project = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == payload.project_id).first()
    if not project:
        project = db.query(AutomationProjectDB).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="No Jira Project connected yet. Please connect your Jira Cloud workspace first before planning sprints."
        )

    jira = get_jira_client_for_project(project)
    
    active_sprints = []
    board_sprints = db.query(AutomationSprintDB).filter(AutomationSprintDB.project_id == project.id).all()
    for s in board_sprints:
        active_sprints.append({
            "id": s.id,
            "jira_sprint_id": s.jira_sprint_id,
            "name": s.name,
            "start_date": s.start_date.isoformat(),
            "end_date": s.end_date.isoformat(),
            "started": s.started,
            "closed": s.closed,
        })

    existing_tasks = []
    for s in board_sprints:
        for t in s.tasks:
            existing_tasks.append({
                "id": t.id,
                "sprint_id": s.id,
                "sprint_name": s.name,
                "jira_issue_key": t.jira_issue_key,
                "title": t.title,
                "priority": t.priority,
                "status": t.current_status,
                "start_date": t.start_date.isoformat() if t.start_date else None,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "moves": [
                    {
                        "id": m.id,
                        "status": m.status,
                        "move_at": m.move_at.isoformat() if m.move_at else None,
                        "done": m.done,
                    }
                    for m in t.moves
                ],
            })

    backlog_issues = []
    if jira and project.jira_board_id:
        try:
            raw_backlog = await jira.get_backlog_issues(project.jira_board_id)
            for b in raw_backlog:
                f = b.get("fields", {})
                backlog_issues.append({
                    "key": b.get("key"),
                    "summary": f.get("summary", ""),
                    "priority": (f.get("priority") or {}).get("name", "Medium"),
                })
        except Exception as be:
            logger.warning(f"Could not load backlog issues for agent: {be}")

    project_members = []
    for m in project.members:
        u = m.user
        if u:
            project_members.append({
                "id": u.id,
                "display_name": u.display_name,
                "username": u.username,
                "role": m.role_in_project,
            })

    agent = JiraPlannerAgent(api_key=user_gemini_key, model=model_name)
    now_iso = datetime.now(UTC).isoformat()

    try:
        result = agent.plan(
            user_message=payload.message,
            project_info={
                "id": project.id,
                "name": project.name,
                "jira_project_key": project.jira_project_key,
                "jira_board_id": project.jira_board_id,
            },
            current_time_iso=now_iso,
            active_sprints=active_sprints,
            backlog_issues=backlog_issues,
            project_members=project_members,
            chat_history=payload.history,
            existing_tasks=existing_tasks,
        )
        return AgentChatResponse(
            message=result.get("message", "Plan ready."),
            plan=result.get("plan"),
        )
    except Exception as e:
        err_msg = str(e)
        logger.error(f"Planner agent error: {err_msg}")
        if "API_KEY_INVALID" in err_msg or "API key not valid" in err_msg:
            raise HTTPException(
                status_code=400,
                detail="Your Google Gemini API Key is invalid or expired (Google returned API_KEY_INVALID). Please generate a new key at aistudio.google.com and update it in your User Profile."
            )
        raise HTTPException(status_code=500, detail=f"Planning agent failed: {err_msg}")


@router.post("/agent/execute-plan", response_model=AgentExecutePlanResponse)
async def agent_execute_plan(
    payload: AgentExecutePlanRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Execute and persist an approved AI-generated sprint, task, and status moves plan."""
    project = None
    if payload.project_id:
        project = db.query(AutomationProjectDB).filter(AutomationProjectDB.id == payload.project_id).first()
    if not project:
        project = db.query(AutomationProjectDB).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    jira = get_jira_client_for_project(project)
    if not jira:
        raise HTTPException(status_code=400, detail="Jira credentials not configured for project")

    plan = payload.plan or {}
    sprint_mapping: dict[str, str] = {}
    task_mapping: dict[str, str] = {}

    created_sprints_count = 0
    updated_sprints_count = 0
    created_tasks_count = 0
    updated_tasks_count = 0
    created_moves_count = 0

    target_board_id = project.jira_board_id
    if target_board_id:
        try:
            await jira.ensure_board_features(target_board_id)
        except Exception as e:
            logger.warning(f"Could not auto-enable board features on {target_board_id}: {e}")

    # Process Sprints (Create / Update / Delete)
    for sp_data in plan.get("sprints", []):
        action = str(sp_data.get("action", "create")).lower()
        temp_id = sp_data.get("temp_id") or sp_data.get("id") or str(uuid.uuid4())
        existing_sp_id = sp_data.get("existing_sprint_id") or sp_data.get("id")
        name = sp_data.get("name", "Sprint")
        start_str = sp_data.get("start_date")
        end_str = sp_data.get("end_date")

        # Match existing sprint if ID given or action is update or name matches
        matched_sprint = None
        if existing_sp_id:
            matched_sprint = db.query(AutomationSprintDB).filter(
                AutomationSprintDB.project_id == project.id,
                AutomationSprintDB.id == existing_sp_id
            ).first()
        if not matched_sprint and (action == "update" or not existing_sp_id) and name:
            matched_sprint = db.query(AutomationSprintDB).filter(
                AutomationSprintDB.project_id == project.id,
                AutomationSprintDB.name == name
            ).first()
        if not matched_sprint and action == "update":
            matched_sprint = db.query(AutomationSprintDB).filter(
                AutomationSprintDB.project_id == project.id
            ).first()

        # Handle DELETE
        if action == "delete" or sp_data.get("deleted"):
            if matched_sprint:
                if matched_sprint.jira_sprint_id and jira:
                    try:
                        await jira.delete_sprint(matched_sprint.jira_sprint_id)
                    except Exception as de:
                        logger.warning(f"Could not delete sprint {matched_sprint.jira_sprint_id} from Jira: {de}")
                db.delete(matched_sprint)
                updated_sprints_count += 1
            continue

        # Handle UPDATE
        if matched_sprint or action == "update":
            db_sprint = matched_sprint
            if db_sprint:
                sprint_mapping[temp_id] = db_sprint.id
                sprint_mapping[db_sprint.id] = db_sprint.id

                if sp_data.get("name"):
                    db_sprint.name = sp_data["name"]
                if start_str:
                    try:
                        st_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                        db_sprint.start_date = st_dt.astimezone(UTC).replace(tzinfo=None)
                    except Exception:
                        pass
                if end_str:
                    try:
                        en_dt = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                        db_sprint.end_date = en_dt.astimezone(UTC).replace(tzinfo=None)
                    except Exception:
                        pass

                if db_sprint.jira_sprint_id and jira:
                    try:
                        s_iso = db_sprint.start_date.replace(tzinfo=UTC).isoformat() if db_sprint.start_date else None
                        e_iso = db_sprint.end_date.replace(tzinfo=UTC).isoformat() if db_sprint.end_date else None
                        await jira.update_sprint(
                            sprint_id=db_sprint.jira_sprint_id,
                            name=db_sprint.name,
                            start_date=s_iso,
                            end_date=e_iso,
                        )
                        logger.info(f"Updated sprint {db_sprint.jira_sprint_id} in Jira: end_date={e_iso}")
                    except Exception as ue:
                        logger.warning(f"Could not update sprint {db_sprint.jira_sprint_id} in Jira: {ue}")

                db.flush()
                updated_sprints_count += 1
                continue

        # Handle CREATE
        try:
            start_dt = datetime.fromisoformat(start_str.replace("Z", "+00:00")) if start_str else datetime.now(UTC)
            end_dt = datetime.fromisoformat(end_str.replace("Z", "+00:00")) if end_str else start_dt + timedelta(days=14)
        except Exception:
            start_dt = datetime.now(UTC)
            end_dt = start_dt + timedelta(days=14)

        if start_dt.tzinfo is not None:
            start_dt = start_dt.astimezone(UTC).replace(tzinfo=None)
        if end_dt.tzinfo is not None:
            end_dt = end_dt.astimezone(UTC).replace(tzinfo=None)

        jira_sprint_id = None
        if target_board_id:
            try:
                start_iso = start_dt.replace(tzinfo=UTC).isoformat()
                end_iso = end_dt.replace(tzinfo=UTC).isoformat()
                jira_sprint_id = await jira.create_sprint(
                    name=name,
                    start_date=start_iso,
                    end_date=end_iso,
                    board_id=target_board_id,
                    activate=False,
                )
            except Exception as se:
                logger.warning(f"Could not create sprint in Jira: {se}")

        db_sprint = AutomationSprintDB(
            project_id=project.id,
            name=name,
            start_date=start_dt,
            end_date=end_dt,
            jira_sprint_id=jira_sprint_id,
            board_id=target_board_id,
            started=False,
            closed=False,
            from_jira=False,
        )
        db.add(db_sprint)
        db.flush()
        sprint_mapping[temp_id] = db_sprint.id
        created_sprints_count += 1

    # Process Tasks (Create / Update / Delete)
    for t_data in plan.get("tasks", []):
        action = str(t_data.get("action", "create")).lower()
        temp_id = t_data.get("temp_id") or t_data.get("id") or str(uuid.uuid4())
        existing_t_id = t_data.get("existing_task_id") or t_data.get("id")
        jira_key = t_data.get("jira_issue_key")

        matched_task = None
        if existing_t_id:
            matched_task = db.query(AutomationTaskDB).filter(AutomationTaskDB.id == existing_t_id).first()
        if not matched_task and jira_key:
            matched_task = db.query(AutomationTaskDB).filter(AutomationTaskDB.jira_issue_key == jira_key).first()
        if not matched_task and action == "update" and t_data.get("title"):
            matched_task = (
                db.query(AutomationTaskDB)
                .join(AutomationSprintDB, AutomationTaskDB.sprint_id == AutomationSprintDB.id)
                .filter(AutomationSprintDB.project_id == project.id, AutomationTaskDB.title == t_data.get("title"))
                .first()
            )

        # Handle DELETE
        if action == "delete" or t_data.get("deleted"):
            if matched_task:
                if matched_task.jira_issue_key and jira:
                    try:
                        await jira.delete_issue(matched_task.jira_issue_key)
                    except Exception as de:
                        logger.warning(f"Could not delete issue {matched_task.jira_issue_key} from Jira: {de}")
                db.delete(matched_task)
                updated_tasks_count += 1
            continue

        # Handle UPDATE
        if matched_task or action == "update":
            db_task = matched_task
            if db_task:
                task_mapping[temp_id] = db_task.id
                task_mapping[db_task.id] = db_task.id

                if t_data.get("title"):
                    db_task.title = t_data["title"]
                if t_data.get("description") is not None:
                    db_task.description = t_data["description"]
                if t_data.get("priority"):
                    db_task.priority = t_data["priority"]
                if t_data.get("story_points") is not None:
                    db_task.story_points = float(t_data["story_points"])
                if t_data.get("start_date"):
                    try:
                        st_dt = datetime.fromisoformat(t_data["start_date"].replace("Z", "+00:00"))
                        db_task.start_date = st_dt.astimezone(UTC).replace(tzinfo=None)
                    except Exception:
                        pass
                if t_data.get("due_date"):
                    try:
                        du_dt = datetime.fromisoformat(t_data["due_date"].replace("Z", "+00:00"))
                        db_task.due_date = du_dt.astimezone(UTC).replace(tzinfo=None)
                    except Exception:
                        pass

                sp_temp_id = t_data.get("sprint_temp_id")
                new_sp_id = sprint_mapping.get(sp_temp_id) if sp_temp_id else (t_data.get("existing_sprint_id") or t_data.get("sprint_id"))
                if new_sp_id and new_sp_id != db_task.sprint_id:
                    new_sp = db.query(AutomationSprintDB).filter(AutomationSprintDB.id == new_sp_id).first()
                    if new_sp:
                        db_task.sprint_id = new_sp.id
                        if db_task.jira_issue_key and new_sp.jira_sprint_id and jira:
                            try:
                                await jira.move_issues_to_sprint(new_sp.jira_sprint_id, [db_task.jira_issue_key])
                            except Exception as me:
                                logger.warning(f"Could not move issue {db_task.jira_issue_key} to sprint {new_sp.jira_sprint_id}: {me}")

                orig_est = t_data.get("original_estimate") or t_data.get("estimate_time")
                if orig_est is not None:
                    db_task.original_estimate = str(orig_est).strip()
                act_time = t_data.get("time_spent") or t_data.get("actual_time")
                if act_time is not None:
                    db_task.time_spent = str(act_time).strip()

                if db_task.jira_issue_key and jira:
                    try:
                        await jira.update_issue(
                            issue_key=db_task.jira_issue_key,
                            summary=db_task.title,
                            description=db_task.description,
                            priority=db_task.priority,
                            start_date=db_task.start_date.isoformat() if db_task.start_date else None,
                            due_date=db_task.due_date.isoformat() if db_task.due_date else None,
                            story_points=db_task.story_points,
                            original_estimate=db_task.original_estimate,
                            time_spent=db_task.time_spent,
                        )
                    except Exception as ie:
                        logger.warning(f"Could not update issue {db_task.jira_issue_key} in Jira: {ie}")

                db.flush()
                updated_tasks_count += 1
                continue

        # Handle CREATE
        sp_temp_id = t_data.get("sprint_temp_id")
        existing_sp_id = t_data.get("existing_sprint_id") or t_data.get("sprint_id")

        target_sp_id = sprint_mapping.get(sp_temp_id) if sp_temp_id else existing_sp_id
        if not target_sp_id:
            first_sp = db.query(AutomationSprintDB).filter(AutomationSprintDB.project_id == project.id).first()
            target_sp_id = first_sp.id if first_sp else None

        # Fallback auto-sprint
        if not target_sp_id:
            default_sp_name = f"{project.jira_project_key or 'Sprint'} 1"
            now_dt = datetime.now(UTC)
            sp_start = now_dt.replace(tzinfo=None)
            sp_end = (now_dt + timedelta(days=14)).replace(tzinfo=None)

            jira_sp_id = None
            if target_board_id:
                try:
                    await jira.ensure_board_features(target_board_id)
                    jira_sp_id = await jira.create_sprint(
                        name=default_sp_name,
                        start_date=now_dt.isoformat(),
                        end_date=(now_dt + timedelta(days=14)).isoformat(),
                        board_id=target_board_id,
                        activate=False,
                    )
                except Exception as cse:
                    logger.warning(f"Could not auto-create fallback sprint in Jira: {cse}")

            auto_sprint = AutomationSprintDB(
                project_id=project.id,
                name=default_sp_name,
                start_date=sp_start,
                end_date=sp_end,
                jira_sprint_id=jira_sp_id,
                board_id=target_board_id,
                started=False,
                closed=False,
                from_jira=False,
            )
            db.add(auto_sprint)
            db.flush()
            target_sp_id = auto_sprint.id
            created_sprints_count += 1
            if sp_temp_id:
                sprint_mapping[sp_temp_id] = target_sp_id

        sp_obj = db.query(AutomationSprintDB).filter(AutomationSprintDB.id == target_sp_id).first()
        start_date = sp_obj.start_date if sp_obj else datetime.now(UTC).replace(tzinfo=None)
        due_date = sp_obj.end_date if sp_obj else (datetime.now(UTC) + timedelta(days=14)).replace(tzinfo=None)

        assignee_id = t_data.get("assignee_id")
        if assignee_id and not db.query(UserDB).filter(UserDB.id == assignee_id).first():
            assignee_id = None

        jira_assignee_id = None
        if assignee_id:
            assignee_user = db.query(UserDB).filter(UserDB.id == assignee_id).first()
            if assignee_user and assignee_user.credentials:
                jira_assignee_id = assignee_user.credentials.jira_account_id

        if not jira_assignee_id and current_user.credentials:
            jira_assignee_id = current_user.credentials.jira_account_id

        if not jira_assignee_id:
            member_cred = (
                db.query(UserCredentialsDB)
                .join(ProjectMemberDB, ProjectMemberDB.user_id == UserCredentialsDB.user_id)
                .filter(ProjectMemberDB.project_id == project.id, UserCredentialsDB.jira_account_id.isnot(None))
                .first()
            )
            if member_cred:
                jira_assignee_id = member_cred.jira_account_id

        orig_est = str(t_data.get("original_estimate") or t_data.get("estimate_time") or "").strip() or None
        act_time = str(t_data.get("time_spent") or t_data.get("actual_time") or "").strip() or None

        jira_issue_key = None
        if jira and project.jira_project_key:
            try:
                jira_issue_key = await jira.create_issue(
                    project_key=project.jira_project_key,
                    summary=t_data.get("title", "Task"),
                    description=t_data.get("description", ""),
                    issue_type=t_data.get("issue_type", "Task"),
                    priority=t_data.get("priority", "Medium"),
                    start_date=start_date.isoformat() if start_date else None,
                    due_date=due_date.isoformat() if due_date else None,
                    story_points=float(t_data.get("story_points")) if t_data.get("story_points") is not None else None,
                    original_estimate=orig_est,
                    time_spent=act_time,
                    assignee_account_id=jira_assignee_id,
                )
                if sp_obj and sp_obj.jira_sprint_id and jira_issue_key:
                    await jira.add_to_sprint(sp_obj.jira_sprint_id, jira_issue_key)
                elif target_board_id and jira_issue_key:
                    try:
                        await jira.move_issues_to_board(target_board_id, [jira_issue_key])
                    except Exception:
                        pass
            except Exception as je:
                logger.warning(f"Could not create issue immediately in Jira: {je}")

        db_task = AutomationTaskDB(
            sprint_id=target_sp_id,
            assignee_id=assignee_id,
            title=t_data.get("title", "Task"),
            description=t_data.get("description", ""),
            priority=t_data.get("priority", "Medium"),
            issue_type=t_data.get("issue_type", "Task"),
            story_points=float(t_data.get("story_points")) if t_data.get("story_points") is not None else None,
            original_estimate=orig_est,
            time_spent=act_time,
            jira_issue_key=jira_issue_key,
            created=bool(jira_issue_key),
            current_status="To Do",
            start_date=start_date,
            due_date=due_date,
            create_at=start_date,
            from_jira=False,
        )
        db.add(db_task)
        db.flush()
        task_mapping[temp_id] = db_task.id
        created_tasks_count += 1

    # Process Moves
    tasks_with_new_moves = set()
    for m_data in plan.get("moves", []):
        t_temp_id = m_data.get("task_temp_id")
        existing_t_id = m_data.get("existing_task_id") or m_data.get("task_id")
        target_task_id = task_mapping.get(t_temp_id) if t_temp_id else (task_mapping.get(existing_t_id) or existing_t_id)
        if target_task_id:
            tasks_with_new_moves.add(target_task_id)

    # Clear pending moves for tasks getting new moves
    for t_id in tasks_with_new_moves:
        db.query(TaskStatusMoveDB).filter(
            TaskStatusMoveDB.task_id == t_id,
            TaskStatusMoveDB.done == False,
        ).delete()

    for m_data in plan.get("moves", []):
        t_temp_id = m_data.get("task_temp_id")
        existing_t_id = m_data.get("existing_task_id") or m_data.get("task_id")

        target_task_id = task_mapping.get(t_temp_id) if t_temp_id else (task_mapping.get(existing_t_id) or existing_t_id)
        if not target_task_id:
            continue

        status_name = m_data.get("status")
        if not status_name:
            continue

        move_at_str = m_data.get("move_at")
        try:
            move_at_dt = datetime.fromisoformat(move_at_str.replace("Z", "+00:00")) if move_at_str else datetime.now(UTC)
        except Exception:
            move_at_dt = datetime.now(UTC)

        if move_at_dt.tzinfo is not None:
            move_at_dt = move_at_dt.astimezone(UTC).replace(tzinfo=None)

        db_move = TaskStatusMoveDB(
            task_id=target_task_id,
            status=status_name,
            from_status=m_data.get("from_status"),
            move_at=move_at_dt,
            done=False,
        )
        db.add(db_move)
        created_moves_count += 1

    db.commit()

    parts = []
    if created_sprints_count:
        parts.append(f"{created_sprints_count} sprints created")
    if updated_sprints_count:
        parts.append(f"{updated_sprints_count} sprints updated")
    if created_tasks_count:
        parts.append(f"{created_tasks_count} tasks created")
    if updated_tasks_count:
        parts.append(f"{updated_tasks_count} tasks updated")
    if created_moves_count:
        parts.append(f"{created_moves_count} moves scheduled")

    msg = f"Plan applied successfully: {', '.join(parts)}." if parts else "Plan applied successfully."

    return AgentExecutePlanResponse(
        success=True,
        message=msg,
        created_sprints=created_sprints_count,
        updated_sprints=updated_sprints_count,
        created_tasks=created_tasks_count,
        updated_tasks=updated_tasks_count,
        created_moves=created_moves_count,
    )
