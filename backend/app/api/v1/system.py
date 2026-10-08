"""System health checks and root information endpoints."""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from app.core.dependencies import AppSettings, DbSession

router = APIRouter(tags=["system"])


@router.get("/health")
@router.get("/api/health")
@router.get("/api/v1/health")
def health_check(settings: AppSettings, db: DbSession):
    """
    Service health check endpoint for container orchestrators and load balancers.
    Verifies database connectivity and returns service metadata.
    """
    from sqlalchemy import text
    db_healthy = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_healthy = False

    return {
        "status": "ok" if db_healthy else "degraded",
        "app": settings.app_name,
        "version": settings.app_version,
        "database": "connected" if db_healthy else "unreachable"
    }


@router.get("/", response_class=HTMLResponse)
def root_index(settings: AppSettings):
    """Developer portal landing page."""
    return HTMLResponse(
        content=f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{settings.app_name} API</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f1f5f9; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }}
        .card {{ background: #131b2e; border: 1px solid #1e293b; padding: 40px; border-radius: 20px; max-width: 480px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }}
        h1 {{ color: #818cf8; font-size: 24px; margin-bottom: 8px; }}
        p {{ color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }}
        .btn {{ display: inline-block; padding: 10px 20px; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 10px; margin: 0 6px; transition: 0.2s; }}
        .btn-primary {{ background: #4f46e5; color: white; }}
        .btn-primary:hover {{ background: #4338ca; }}
        .btn-secondary {{ background: #1e293b; color: #38bdf8; border: 1px solid #334155; }}
        .btn-secondary:hover {{ background: #334155; }}
        .badge {{ display: inline-block; padding: 4px 10px; background: rgba(16,185,129,0.1); color: #34d399; border: 1px solid rgba(16,185,129,0.2); border-radius: 999px; font-size: 11px; font-weight: 600; margin-bottom: 16px; }}
    </style>
</head>
<body>
    <div class="card">
        <span class="badge">● REST API Active • PostgreSQL + pgvector</span>
        <h1>{settings.app_name} API</h1>
        <p>DHBW Student Manager • Lecture Recorder • Agentic AI Summarizer backend engine is running.</p>
        <div>
            <a href="/docs" class="btn btn-primary">Swagger API Docs</a>
            <a href="http://localhost:5173" class="btn btn-secondary">Open Frontend UI</a>
        </div>
    </div>
</body>
</html>"""
    )
