"""Centralized application API and root router assembling all endpoints."""
from fastapi import APIRouter, Depends

from app.api.v1 import (
    agent,
    auth,
    calendar,
    chat,
    google,
    meetings,
    rag,
    recordings,
    settings,
    system,
    jira_automation,
)
from app.core.security import require_admin, require_auth

# ----------------- ROOT ROUTER -----------------
# Mounted directly at application root: /health, /, /recordings/{filename}
root_router = APIRouter()
root_router.include_router(system.router)
root_router.include_router(recordings.router)

# ----------------- API ROUTER -----------------
# Mounted at /api and /api/v1
api_router = APIRouter()

# Public routes (auth, system status)
api_router.include_router(auth.router)
api_router.include_router(system.router)

# Protected routes (require valid auth session)
# Admin-only Jira Automation
api_router.include_router(jira_automation.router, dependencies=[Depends(require_admin)])
api_router.include_router(calendar.router, dependencies=[Depends(require_auth)])
api_router.include_router(google.router, dependencies=[Depends(require_auth)])
api_router.include_router(meetings.router, dependencies=[Depends(require_auth)])
api_router.include_router(settings.router, dependencies=[Depends(require_auth)])

# Admin-only AI Intelligence & Chat routes (Grill Me, RAG Tutor, Agent Chat)
api_router.include_router(chat.router, dependencies=[Depends(require_admin)])
api_router.include_router(rag.router, dependencies=[Depends(require_admin)])
api_router.include_router(agent.router, dependencies=[Depends(require_admin)])
api_router.include_router(recordings.router)
