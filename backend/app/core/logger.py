import logging
import sys
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# ANSI Color codes for terminal/docker stdout output
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
BLUE = "\033[34m"
MAGENTA = "\033[35m"
CYAN = "\033[36m"
WHITE = "\033[37m"

LEVEL_COLORS = {
    logging.DEBUG: CYAN,
    logging.INFO: GREEN,
    logging.WARNING: YELLOW,
    logging.ERROR: RED,
    logging.CRITICAL: MAGENTA + BOLD,
}

class ColoredFormatter(logging.Formatter):
    """Custom colorized log formatter with ISO-like timestamps and styled logger tags."""
    def format(self, record: logging.LogRecord) -> str:
        color = LEVEL_COLORS.get(record.levelno, WHITE)
        level_str = f"{color}{record.levelname:<7}{RESET}"
        timestamp = f"{DIM}{self.formatTime(record, '%Y-%m-%d %H:%M:%S')}{RESET}"
        name = f"{CYAN}[{record.name}]{RESET}"
        message = record.getMessage()

        if record.exc_info and not record.exc_text:
            record.exc_text = self.formatException(record.exc_info)
        if record.exc_text:
            message = f"{message}\n{RED}{record.exc_text}{RESET}"

        return f"{timestamp} {level_str} {name} {message}"

class PlainFileFormatter(logging.Formatter):
    """Plain-text formatter for rotating disk log files without ANSI escape characters."""
    def __init__(self):
        super().__init__(
            fmt="%(asctime)s [%(levelname)-7s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )

_is_configured = False

def setup_logging(log_level: str = "INFO", log_dir: Path | None = None) -> None:
    """Configures root logger with colorized stdout handler and rotating file handler."""
    global _is_configured
    if _is_configured:
        return
    _is_configured = True

    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)
    root_logger.handlers.clear()

    # 1. Console / Docker standard output stream
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(numeric_level)
    console_handler.setFormatter(ColoredFormatter())
    root_logger.addHandler(console_handler)

    # 2. Rotating log file on disk (persisted under backend/data/logs/)
    if log_dir:
        try:
            log_dir.mkdir(parents=True, exist_ok=True)
            log_file = log_dir / "meeting_agent.log"
            file_handler = RotatingFileHandler(
                log_file,
                maxBytes=15 * 1024 * 1024,  # 15 MB per file
                backupCount=5,
                encoding="utf-8"
            )
            file_handler.setLevel(numeric_level)
            file_handler.setFormatter(PlainFileFormatter())
            root_logger.addHandler(file_handler)
        except Exception as e:
            root_logger.warning(f"Failed to initialize rotating file logger at {log_dir}: {e}")

    # Silence overly verbose external transport loggers
    logging.getLogger("uvicorn.access").handlers.clear()
    logging.getLogger("uvicorn.access").propagate = False
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)

def get_logger(name: str = "meeting_agent") -> logging.Logger:
    """Returns a named logger instance."""
    return logging.getLogger(name)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that logs incoming HTTP requests, response status, and roundtrip duration.
    Highlights slow responses and errors.
    """
    def __init__(self, app, logger: logging.Logger | None = None):
        super().__init__(app)
        self.logger = logger or get_logger("meeting_agent.http")

    async def dispatch(self, request: Request, call_next):
        start_time = time.perf_counter()
        method = request.method
        path = request.url.path
        query = str(request.url.query) if request.url.query else ""
        full_path = f"{path}?{query}" if query else path
        client_host = request.client.host if request.client else "unknown"

        # Suppress periodic /health check logs from Docker healthcheck to avoid polluting logs
        is_health = path == "/health"

        try:
            response: Response = await call_next(request)
            duration_ms = (time.perf_counter() - start_time) * 1000
            status = response.status_code

            if not is_health:
                if status >= 500:
                    self.logger.error(f"{client_host} ➜ {method} {full_path} ✖ {status} ({duration_ms:.1f}ms)")
                elif status >= 400:
                    self.logger.warning(f"{client_host} ➜ {method} {full_path} ⚠ {status} ({duration_ms:.1f}ms)")
                else:
                    self.logger.info(f"{client_host} ➜ {method} {full_path} ✔ {status} ({duration_ms:.1f}ms)")
            return response
        except Exception:
            duration_ms = (time.perf_counter() - start_time) * 1000
            self.logger.exception(f"{client_host} ➜ {method} {full_path} 💥 EXCEPTION ({duration_ms:.1f}ms)")
            raise
