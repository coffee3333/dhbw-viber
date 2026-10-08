# syntax=docker/dockerfile:1
# Production Dockerfile for MeetingAgent AI using Astral uv with non-root security
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

# Create dedicated non-root user and group
RUN groupadd -g 10001 appuser && \
    useradd -u 10001 -g appuser -s /bin/bash -m appuser

# Copy dependency specifications first to leverage Docker layer caching
COPY pyproject.toml uv.lock .python-version ./

# Install project dependencies using uv frozen lockfile
RUN uv sync --frozen --no-dev --no-cache

# Copy application source code and assets
COPY app/ ./app/
COPY main.py ./

# Create data directories and establish secure non-root ownership
RUN mkdir -p /app/data/recordings /app/data/materials /app/data/logs /app/data/tmp_repos && \
    chown -R appuser:appuser /app && \
    chmod 750 /app/data

# Switch to unprivileged user
USER 10001

# Declare volume for data persistence
VOLUME ["/app/data"]

EXPOSE 8000

# Healthcheck to ensure FastAPI is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Launch application using uv run
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
