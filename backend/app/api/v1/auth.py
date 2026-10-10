import secrets
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.ai_credentials import normalize_gemini_model
from app.core.auth_utils import create_access_token, hash_password, verify_password
from app.core.config import get_settings
from app.core.crypto import decrypt_secret, encrypt_secret, mask_secret
from app.core.database import get_db
from app.core.security import (
    check_rate_limit,
    create_session_token,
    get_current_user,
    get_current_user_optional,
    is_authenticated,
    record_failed_attempt,
    require_admin,
    reset_failed_attempts,
)
from app.models.user import UserCredentialsDB, UserDB

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str = Field(..., min_length=1)


class AuthStatusResponse(BaseModel):
    auth_required: bool
    authenticated: bool
    user: dict[str, Any] | None = None


class UserProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    email: str | None = None
    telegram_username: str | None = None
    telegram_chat_id: str | None = None


class UserCredentialsUpdateRequest(BaseModel):
    github_token: str | None = None
    git_author_name: str | None = None
    git_author_email: str | None = None
    jira_account_id: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str | None = None
    openai_api_key: str | None = None
    openai_model: str | None = None
    transcription_engine: str | None = None
    summarization_engine: str | None = None


class AdminCreateUserRequest(BaseModel):
    username: str = Field(..., min_length=2)
    display_name: str | None = None
    password: str = Field(..., min_length=4)
    role: str = "member"  # "admin" or "member"
    email: str | None = None


@router.get("/status", response_model=AuthStatusResponse)
def get_auth_status(request: Request, db: Session = Depends(get_db)):
    """Check if app has authentication active and retrieve current user session."""
    current_user = get_current_user_optional(request, db)
    authenticated = bool(current_user is not None)
    
    user_info = None
    if current_user:
        user_info = {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "display_name": current_user.display_name,
            "role": current_user.role,
            "telegram_username": current_user.telegram_username,
            "telegram_connected": bool(current_user.telegram_chat_id),
        }

    return {
        "auth_required": True,
        "authenticated": authenticated,
        "user": user_info
    }


def get_client_ip(request: Request) -> str:
    """Safely extracts real client IP even behind reverse proxies (Cloudflare/Traefik)."""
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip and cf_ip.strip():
        return cf_ip.strip().split(",")[0].strip()
    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip and x_real_ip.strip():
        return x_real_ip.strip().split(",")[0].strip()
    xff = request.headers.get("X-Forwarded-For")
    if xff and xff.strip():
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """Authenticate via username/password or master password and issue secure JWT."""
    settings = get_settings()
    client_ip = get_client_ip(request)
    identifier = (payload.username or payload.email or "").strip().lower()
    rate_key = f"{client_ip}:{identifier or 'master'}"

    if not check_rate_limit(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Please wait 5 minutes."
        )

    # 1. Username/Password login (Multi-User)
    if identifier:
        user = db.query(UserDB).filter(
            (UserDB.username == identifier) | (UserDB.email == identifier)
        ).first()
        if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
            failed_count = record_failed_attempt(rate_key)
            remaining = max(0, 5 - failed_count)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid username or password. ({remaining} attempts remaining)"
            )

        reset_failed_attempts(rate_key)
        token = create_access_token({"user_id": user.id, "username": user.username, "role": user.role})

        response.set_cookie(
            key=settings.session_cookie_name,
            value=token,
            max_age=settings.session_expire_days * 86400,
            httponly=True,
            samesite="lax",
            secure=not settings.debug and request.url.scheme == "https",
            path="/"
        )

        return {
            "success": True,
            "token": token,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "display_name": user.display_name,
                "role": user.role,
            },
            "message": f"Welcome back, {user.display_name}!"
        }

    # 2. Master Password fallback
    if settings.app_password and settings.app_password.strip():
        if not secrets.compare_digest(payload.password.encode("utf-8"), settings.app_password.encode("utf-8")):
            failed_count = record_failed_attempt(rate_key)
            remaining = max(0, 5 - failed_count)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid password. ({remaining} attempts remaining)"
            )

        reset_failed_attempts(rate_key)
        admin = db.query(UserDB).filter(UserDB.role == "admin").first()
        admin_id = admin.id if admin else "admin"
        admin_username = admin.username if admin else "admin"
        token = create_access_token({"user_id": admin_id, "username": admin_username, "role": "admin"})

        response.set_cookie(
            key=settings.session_cookie_name,
            value=token,
            max_age=settings.session_expire_days * 86400,
            httponly=True,
            samesite="lax",
            secure=not settings.debug and request.url.scheme == "https",
            path="/"
        )

        return {
            "success": True,
            "token": token,
            "user": {"id": admin_id, "username": admin_username, "display_name": "Administrator", "role": "admin"},
            "message": "Welcome back, Administrator!"
        }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Please provide a valid username and password to log in."
    )


@router.get("/me")
def get_my_profile(current_user: UserDB = Depends(get_current_user)):
    """Retrieve current user profile, roles, and credential configurations."""
    creds = current_user.credentials
    raw_github = decrypt_secret(creds.github_token_encrypted) if creds else None
    raw_gemini = decrypt_secret(creds.gemini_api_key_encrypted) if creds else None
    raw_openai = decrypt_secret(creds.openai_api_key_encrypted) if creds else None

    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "display_name": current_user.display_name,
        "role": current_user.role,
        "telegram_username": current_user.telegram_username,
        "telegram_connected": bool(current_user.telegram_chat_id),
        "credentials": {
            "github_token_masked": mask_secret(raw_github) if raw_github else None,
            "has_github_token": bool(raw_github),
            "git_author_name": creds.git_author_name if creds else None,
            "git_author_email": creds.git_author_email if creds else None,
            "jira_account_id": creds.jira_account_id if creds else None,
            "gemini_api_key_masked": mask_secret(raw_gemini) if raw_gemini else None,
            "has_gemini_api_key": bool(raw_gemini),
            "gemini_model": normalize_gemini_model(creds.gemini_model if creds else None),
            "openai_api_key_masked": mask_secret(raw_openai) if raw_openai else None,
            "has_openai_api_key": bool(raw_openai),
            "openai_model": (creds.openai_model if creds and creds.openai_model else "gpt-4o"),
            "transcription_engine": (creds.transcription_engine if creds and creds.transcription_engine else "gemini"),
            "summarization_engine": (creds.summarization_engine if creds and creds.summarization_engine else "gemini"),
        }
    }


@router.patch("/profile")
def update_my_profile(
    payload: UserProfileUpdateRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Allows authenticated user to update their display name, email, and Telegram settings."""
    if payload.display_name is not None:
        name_clean = payload.display_name.strip()
        if name_clean:
            current_user.display_name = name_clean

    if payload.email is not None:
        email_clean = payload.email.strip().lower()
        if email_clean and email_clean != (current_user.email or "").lower():
            # Check unique email
            existing = db.query(UserDB).filter(UserDB.email == email_clean, UserDB.id != current_user.id).first()
            if existing:
                raise HTTPException(status_code=400, detail="This email is already in use by another user.")
            current_user.email = email_clean
        elif not email_clean:
            current_user.email = None

    if payload.telegram_username is not None:
        clean_tg = payload.telegram_username.strip().lstrip("@")
        current_user.telegram_username = clean_tg or None

    if payload.telegram_chat_id is not None:
        clean_chat_id = payload.telegram_chat_id.strip()
        current_user.telegram_chat_id = clean_chat_id or None

    db.commit()
    db.refresh(current_user)
    return {"success": True, "message": "Profile updated successfully."}


@router.patch("/credentials")
def update_my_credentials(
    payload: UserCredentialsUpdateRequest,
    current_user: UserDB = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Allows authenticated user to update their personal GitHub token, Git author, Jira ID, and AI BYOK keys."""
    creds = current_user.credentials
    if not creds:
        creds = UserCredentialsDB(user_id=current_user.id)
        db.add(creds)

    if payload.github_token is not None:
        token_clean = payload.github_token.strip()
        creds.github_token_encrypted = encrypt_secret(token_clean) if token_clean else None

    if payload.git_author_name is not None:
        creds.git_author_name = payload.git_author_name.strip() or None

    if payload.git_author_email is not None:
        creds.git_author_email = payload.git_author_email.strip().lower() or None

    if payload.jira_account_id is not None:
        creds.jira_account_id = payload.jira_account_id.strip() or None

    if payload.gemini_api_key is not None:
        gemini_clean = payload.gemini_api_key.strip()
        creds.gemini_api_key_encrypted = encrypt_secret(gemini_clean) if gemini_clean else None

    if payload.gemini_model is not None:
        creds.gemini_model = normalize_gemini_model(payload.gemini_model.strip() or "gemini-flash-lite-latest")

    if payload.openai_api_key is not None:
        openai_clean = payload.openai_api_key.strip()
        creds.openai_api_key_encrypted = encrypt_secret(openai_clean) if openai_clean else None

    if payload.openai_model is not None:
        creds.openai_model = payload.openai_model.strip() or "gpt-4o"

    if payload.transcription_engine is not None:
        creds.transcription_engine = payload.transcription_engine.strip() or "gemini"

    if payload.summarization_engine is not None:
        creds.summarization_engine = payload.summarization_engine.strip() or "gemini"

    db.commit()
    return {"success": True, "message": "Personal credentials updated successfully."}


@router.get("/users")
def list_users(admin: UserDB = Depends(require_admin), db: Session = Depends(get_db)):
    """Admin-only: List all registered team members and their statuses."""
    users = db.query(UserDB).order_by(UserDB.created_at).all()
    results = []
    for u in users:
        has_gh = bool(u.credentials and u.credentials.github_token_encrypted)
        results.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "display_name": u.display_name,
            "role": u.role,
            "telegram_connected": bool(u.telegram_chat_id),
            "has_github_token": has_gh,
            "jira_account_id": u.credentials.jira_account_id if u.credentials else None,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })
    return results


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user_by_admin(
    payload: AdminCreateUserRequest,
    admin: UserDB = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Admin-only: Register a new team member with username, name, and temporary password."""
    username_clean = payload.username.strip().lower()
    existing = db.query(UserDB).filter(UserDB.username == username_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with username '{username_clean}' already exists."
        )

    display_name = (payload.display_name or "").strip() or username_clean
    email_clean = payload.email.strip().lower() if payload.email and payload.email.strip() else None

    new_user = UserDB(
        username=username_clean,
        display_name=display_name,
        email=email_clean,
        password_hash=hash_password(payload.password),
        role=payload.role if payload.role in ["admin", "member"] else "member",
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "success": True,
        "message": f"User '{new_user.display_name}' (@{new_user.username}) registered successfully.",
        "user_id": new_user.id
    }


@router.delete("/users/{user_id}")
def delete_user_by_admin(
    user_id: str,
    admin: UserDB = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Admin-only: Remove a team member."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account.")

    target = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    db.delete(target)
    db.commit()
    return {"success": True, "message": f"User '{target.display_name}' deleted."}


@router.post("/logout")
def logout(response: Response):
    """Clear session cookie to log out."""
    settings = get_settings()
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/"
    )
    return {"success": True, "message": "Successfully logged out."}
