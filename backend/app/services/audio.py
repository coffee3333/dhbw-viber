import os
import subprocess
from pathlib import Path

import imageio_ffmpeg

from app.core.logger import get_logger

logger = get_logger("meeting_agent.audio")


def get_ffmpeg_path() -> str:
    """Return path to ffmpeg binary (from imageio_ffmpeg or system)."""
    try:
        path = imageio_ffmpeg.get_ffmpeg_exe()
        if os.path.exists(path):
            return path
    except Exception as e:
        logger.debug(f"Could not locate imageio ffmpeg executable: {e}")
    return "ffmpeg"


def get_audio_duration(file_path: Path) -> float:
    """Extract audio duration in seconds using ffmpeg."""
    ffmpeg_bin = get_ffmpeg_path()
    cmd = [
        ffmpeg_bin,
        "-i", str(file_path),
        "-hide_banner"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    for line in result.stderr.splitlines():
        if "Duration:" in line:
            parts = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = parts.split(":")
            return float(h) * 3600 + float(m) * 60 + float(s)
    return 0.0


def convert_to_wav(input_path: Path, output_path: Path | None = None, sample_rate: int = 16000) -> Path:
    """Extract and convert media into 16kHz mono WAV for local Whisper."""
    if output_path is None:
        output_path = input_path.with_suffix(".wav")

    ffmpeg_bin = get_ffmpeg_path()
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", str(input_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", str(sample_rate),
        "-ac", "1",
        str(output_path)
    ]
    process = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if process.returncode != 0:
        raise RuntimeError(f"FFmpeg audio conversion failed: {process.stderr}")
    return output_path


def convert_to_mp3(input_path: Path, output_path: Path | None = None, bitrate: str = "64k") -> Path:
    """Convert audio to compact MP3 for fast API uploads."""
    if output_path is None:
        output_path = input_path.with_suffix(".mp3")

    ffmpeg_bin = get_ffmpeg_path()
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", str(input_path),
        "-vn",
        "-ar", "16000",
        "-ac", "1",
        "-b:a", bitrate,
        str(output_path)
    ]
    process = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if process.returncode != 0:
        raise RuntimeError(f"FFmpeg MP3 compression failed: {process.stderr}")
    return output_path


def format_timestamp(seconds: float) -> str:
    """Format seconds into HH:MM:SS or MM:SS."""
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"
