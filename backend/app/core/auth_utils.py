from datetime import UTC, datetime, timedelta
from typing import Any
import bcrypt
import jwt
from app.core.config import get_settings

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 14


def get_jwt_secret() -> str:
    """Retrieve the cryptographically secure secret key for signing tokens."""
    settings = get_settings()
    if not settings.secret_key:
        raise RuntimeError("SECRET_KEY is not configured in settings")
    return settings.secret_key


def hash_password(password: str) -> str:
    """Hashes a plaintext password using bcrypt with salt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a bcrypt hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Creates a signed JWT access token for user sessions."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(days=JWT_EXPIRE_DAYS)
    
    to_encode.update({"exp": expire, "iat": datetime.now(UTC)})
    return jwt.encode(to_encode, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decodes and validates a JWT token. Returns payload dict or None if invalid/expired."""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        return None
