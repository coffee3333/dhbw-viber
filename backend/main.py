"""MeetingAgent AI - Application entry point and factory."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.router import api_router, root_router
from app.core.config import RECORDINGS_DIR, get_settings
from app.core.database import init_db
from app.core.exceptions import setup_exception_handlers
from app.core.logger import get_logger, setup_logging
from app.core.middleware import setup_middleware

from app.services.jira_automation.scheduler import (
    start_automation_scheduler,
    stop_automation_scheduler,
)

settings = get_settings()
setup_logging(log_level=settings.log_level)
logger = get_logger("meeting_agent.main")


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Handles startup and shutdown lifecycle events."""
    logger.info("Initializing MeetingAgent AI backend...")
    init_db()
    RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        start_automation_scheduler()
    except Exception as e:
        logger.warning(f"Could not start Jira/Git automation scheduler: {e}")
    logger.info(f"MeetingAgent ready (env: {settings.app_name} v{settings.app_version})")
    yield
    try:
        stop_automation_scheduler()
    except Exception as e:
        logger.warning(f"Error stopping Jira/Git automation scheduler: {e}")
    logger.info("MeetingAgent backend shutdown complete.")


def create_app() -> FastAPI:
    """Creates and configures the FastAPI application instance."""
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="DHBW Student Manager • Lecture Recorder • Agentic AI Summarizer",
        lifespan=lifespan,
    )

    # Register middleware and global exception handlers
    setup_middleware(application, settings)
    setup_exception_handlers(application)

    # Mount routers
    application.include_router(root_router)
    application.include_router(api_router, prefix="/api/v1")
    application.include_router(api_router, prefix="/api")

    return application


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)
