"""Audio and media recordings streaming router with dependency injection."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import RECORDINGS_DIR
from app.core.dependencies import AuthenticatedUser

router = APIRouter(prefix="/recordings", tags=["recordings"])


@router.get("/{filename}")
async def stream_recording(filename: str, _: AuthenticatedUser):
    """
    Stream meeting audio or media file with authentication and traversal prevention.
    """
    # Reject directory traversal attempts
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid recording filename")

    base_dir = RECORDINGS_DIR.resolve()
    file_path = (RECORDINGS_DIR / filename).resolve()

    try:
        is_safe = file_path.is_relative_to(base_dir)
    except AttributeError:
        is_safe = str(file_path).startswith(str(base_dir))

    if not is_safe or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Recording file not found")

    return FileResponse(file_path)
