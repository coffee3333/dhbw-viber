import base64
import hashlib
import secrets
import time
from typing import Any

from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db

# In-memory brute-force protection: client_ip -> (failed_count, lock_until_timestamp)
_FAILED_ATTEMPTS: dict[str, tuple[int, float]] = {}
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 300  # 5 minutes


def get_fernet_cipher(secret_key: str) -> Fernet:
    """Derive deterministic 32-byte Fernet key using SHA-256."""
    key = base64.urlsafe_b64encode(hashlib.sha256(secret_key.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_token(raw_token: str | None, secret_key: str) -> str | None:
    """Encrypt sensitive OAuth tokens for database persistence."""
    if not raw_token:
        return raw_token
    cipher = get_fernet_cipher(secret_key)
    encrypted_bytes = cipher.encrypt(raw_token.encode("utf-8"))
    return f"enc:{encrypted_bytes.decode('utf-8')}"


def decrypt_token(stored_token: str | None, secret_key: str) -> str | None:
    """Decrypt stored OAuth tokens; fallback to plain token for backward compatibility."""
    if not stored_token:
        return stored_token
    if not stored_token.startswith("enc:"):
        return stored_token  # Unencrypted legacy token
    try:
        cipher = get_fernet_cipher(secret_key)
        decrypted_bytes = cipher.decrypt(stored_token[4:].encode("utf-8"))
        return decrypted_bytes.decode("utf-8")
    except Exception:
        return stored_token


def create_session_token(secret_key: str, user_id: str = "default") -> str:
    """Create a tamper-proof encrypted session token."""
    cipher = get_fernet_cipher(secret_key)
    now_ts = int(time.time())
    payload = f"session:{user_id}:{now_ts}:{secrets.token_hex(8)}"
    return cipher.encrypt(payload.encode("utf-8")).decode("utf-8")


def verify_session_token(token: str | None, secret_key: str, max_age_seconds: int = 14 * 86400) -> str | None:
    """Verify session token signature and expiration."""
    if not token:
        return None
    try:
        cipher = get_fernet_cipher(secret_key)
        decrypted = cipher.decrypt(token.encode("utf-8"), ttl=max_age_seconds).decode("utf-8")
        parts = decrypted.split(":")
        if len(parts) >= 2 and parts[0] == "session":
            return parts[1]  # user_id
    except Exception:
        return None
    return None


def check_rate_limit(client_ip: str) -> bool:
    """Check if IP is currently locked out due to repeated failed logins."""
    now = time.time()
    if client_ip in _FAILED_ATTEMPTS:
        count, lock_until = _FAILED_ATTEMPTS[client_ip]
        if lock_until > now:
            return False  # Locked out
        if count >= MAX_FAILED_ATTEMPTS and lock_until <= now:
            # Lockout expired, reset
            del _FAILED_ATTEMPTS[client_ip]
    return True


def record_failed_attempt(client_ip: str) -> int:
    """Increment failed login counter and trigger lockout if limit reached."""
    now = time.time()
    count, lock_until = _FAILED_ATTEMPTS.get(client_ip, (0, 0.0))
    count += 1
    if count >= MAX_FAILED_ATTEMPTS:
        lock_until = now + LOCKOUT_DURATION_SECONDS
    _FAILED_ATTEMPTS[client_ip] = (count, lock_until)
    return count


def reset_failed_attempts(client_ip: str) -> None:
    """Clear failed login counter upon successful authentication."""
    _FAILED_ATTEMPTS.pop(client_ip, None)


def get_current_user_optional(request: Request, db: Session = Depends(get_db)) -> Any:
    """Extract and resolve the current user from JWT token or session cookie."""
    from app.core.auth_utils import decode_access_token
    from app.models.user import UserDB

    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)

    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if token:
        # 1. Try decoding as JWT
        payload = decode_access_token(token)
        if payload and "user_id" in payload:
            user = db.query(UserDB).filter(UserDB.id == payload["user_id"], UserDB.is_active == True).first()
            if user:
                return user

        # 2. Try legacy session token
        user_id = verify_session_token(
            token=token,
            secret_key=settings.secret_key,
            max_age_seconds=settings.session_expire_days * 86400
        )
        if user_id:
            user = db.query(UserDB).filter(UserDB.id == user_id, UserDB.is_active == True).first()
            if user:
                return user
            if user_id in ("admin", "master", "default") and settings.app_password:
                user = db.query(UserDB).filter(UserDB.role == "admin", UserDB.is_active == True).first()
                if user:
                    return user

    return None


def is_authenticated(request: Request) -> bool:
    """Check if the incoming request has a valid session or JWT token."""
    from app.core.auth_utils import decode_access_token

    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if not token:
        return False

    # Check JWT first
    payload = decode_access_token(token)
    if payload and "user_id" in payload:
        return True

    # Check session token
    user_id = verify_session_token(
        token=token,
        secret_key=settings.secret_key,
        max_age_seconds=settings.session_expire_days * 86400
    )
    return user_id is not None


def require_auth(request: Request) -> bool:
    """FastAPI route dependency ensuring authentication."""
    if not is_authenticated(request):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return True


def get_current_user(request: Request, db: Session = Depends(get_db)) -> Any:
    """Dependency that resolves the active authenticated user."""
    user = get_current_user_optional(request, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return user


def require_admin(user: Any = Depends(get_current_user)) -> Any:
    """Dependency that ensures the authenticated user is an administrator."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Admin privileges required."
        )
    return user

