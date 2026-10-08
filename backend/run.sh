#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

PORT="${PORT:-8000}"
HOST="${HOST:-127.0.0.1}"

echo "=========================================================="
echo "  🚀 Starting MeetingAgent AI with uv"
echo "  📡 Web UI: http://${HOST}:${PORT}"
echo "  🎙️ Universal Meeting Recorder & AI Summarizer"
echo "  Platforms: Zoom • Moodle BBB • Microsoft Teams • Web"
echo "=========================================================="

# uv run automatically handles virtualenv sync and runs uvicorn
uv run uvicorn main:app --host "$HOST" --port "$PORT" --reload
