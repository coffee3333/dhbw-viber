# syntax=docker/dockerfile:1
# Production Dockerfile for MeetingAgent AI using Astral uv
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PORT=8000 \
    HOST=0.0.0.0

WORKDIR /app

# Install system dependencies including ffmpeg for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency specifications first to leverage Docker layer caching
COPY pyproject.toml uv.lock .python-version ./

# Install project dependencies using uv frozen lockfile
RUN uv sync --frozen --no-dev --no-cache

# Copy application source code and assets
COPY app/ ./app/
COPY main.py ./

# Create data directory for SQLite database and recordings
RUN mkdir -p /app/data/recordings && chmod -R 777 /app/data

# Declare volume for data persistence
VOLUME ["/app/data"]

EXPOSE 8000

# Healthcheck to ensure FastAPI is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Launch application using uv run
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
