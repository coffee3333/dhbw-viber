#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo "  🚀 Starting MeetingAgent AI via Docker Compose"
echo "  🐘 Database:              PostgreSQL 16 + pgvector (:5432)"
echo "  ⚡ Backend (FastAPI):     http://localhost:8000"
echo "  ⚛️ Frontend (React SPA):  http://localhost:5173  (or :3000)"
echo "=========================================================="

# Check if Docker daemon is running
if ! docker info >/dev/null 2>&1; then
    echo "⚠️ Docker daemon is not running. Starting Docker Desktop..."
    open -a Docker || true
    echo "⏳ Waiting for Docker daemon to become ready..."
    while ! docker info >/dev/null 2>&1; do
        sleep 2
    done
    echo "✅ Docker daemon is ready!"
fi

# Trap Ctrl+C and termination signals to cleanly shut down containers
cleanup() {
    echo ""
    echo "🛑 Shutting down Docker containers..."
    docker compose down
}
trap cleanup EXIT INT TERM

# Build and start all services (PostgreSQL + pgvector, Backend, Frontend)
echo "📦 Building and starting containers (Postgres + Backend + Frontend)..."
docker compose up --build
