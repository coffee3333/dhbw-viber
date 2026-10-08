"""Global HTTP and unhandled exception handlers."""
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.logger import get_logger

logger = get_logger("meeting_agent.exceptions")


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handles structured FastAPI HTTPException responses with level-aware logging."""
    if exc.status_code >= 500:
        logger.error(f"HTTP {exc.status_code} server error at {request.url.path}: {exc.detail}")
    elif exc.status_code >= 400:
        logger.warning(f"HTTP {exc.status_code} client error at {request.url.path}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "status_code": exc.status_code},
        headers=exc.headers,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catches unhandled runtime exceptions, logs stack trace, and returns 500 JSON response."""
    logger.exception(f"Unhandled exception while processing {request.method} {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal server error occurred. Please check the backend logs for details.",
            "error_type": exc.__class__.__name__,
            "status_code": 500,
        },
    )


def setup_exception_handlers(app: FastAPI) -> None:
    """Registers standard exception handlers on the application instance."""
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
