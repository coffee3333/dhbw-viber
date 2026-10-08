import shutil
from pathlib import Path

from app.core.config import RECORDINGS_DIR


def save_recording_file(file_obj, filename: str) -> Path:
    """Save an incoming file upload/blob to the recordings directory."""
    destination = RECORDINGS_DIR / filename
    with open(destination, "wb") as buffer:
        shutil.copyfileobj(file_obj, buffer)
    return destination


def get_recording_path(filename: str) -> Path | None:
    """Retrieve path to a recording if it exists."""
    path = RECORDINGS_DIR / filename
    if path.exists():
        return path
    return None


def delete_recording_files(base_filename: str) -> None:
    """Clean up raw recording and any converted derivatives (.wav, .mp3)."""
    if not base_filename:
        return

    p = RECORDINGS_DIR / base_filename
    if p.exists():
        p.unlink()

    stem = Path(base_filename).stem
    for ext in (".wav", ".mp3"):
        derived = RECORDINGS_DIR / f"{stem}{ext}"
        if derived.exists():
            derived.unlink()
