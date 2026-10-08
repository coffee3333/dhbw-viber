from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logger import get_logger
from app.core.security import decrypt_token, encrypt_token
from app.models.db import GoogleCredentialDB
from google.oauth2.credentials import Credentials

logger = get_logger("meeting_agent.google.auth")

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/drive.file"
]


def get_oauth_flow(state: str | None = None) -> Flow:
    """Create Google OAuth Flow object."""
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise ValueError("Google Client ID and Client Secret must be configured in Settings or .env")

    client_config = {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.google_redirect_uri]
        }
    }

    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        state=state
    )
    flow.redirect_uri = settings.google_redirect_uri
    return flow


def generate_auth_url(state: str | None = None) -> str:
    """Generate authorization URL with offline access to receive refresh token."""
    flow = get_oauth_flow(state=state)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent"
    )
    return auth_url


def exchange_code_and_store(db: Session, code: str, state: str | None = None) -> GoogleCredentialDB:
    """Exchange authorization code for tokens and persist to database."""
    settings = get_settings()
    flow = get_oauth_flow(state=state)
    flow.fetch_token(code=code)
    creds = flow.credentials

    # Retrieve user email
    user_email = None
    try:
        oauth2_service = build("oauth2", "v2", credentials=creds)
        user_info = oauth2_service.userinfo().get().execute()
        user_email = user_info.get("email")
    except Exception as e:
        logger.warning(f"Could not retrieve Google userinfo: {e}")

    # Upsert into GoogleCredentialDB
    cred_db = db.query(GoogleCredentialDB).filter(GoogleCredentialDB.user_id == "default").first()
    if not cred_db:
        cred_db = GoogleCredentialDB(user_id="default")
        db.add(cred_db)

    cred_db.email = user_email or cred_db.email or "connected@gmail.com"
    cred_db.access_token = encrypt_token(creds.token, settings.secret_key)
    if creds.refresh_token:
        cred_db.refresh_token = encrypt_token(creds.refresh_token, settings.secret_key)
    cred_db.token_uri = creds.token_uri
    cred_db.client_id = settings.google_client_id
    cred_db.client_secret = settings.google_client_secret
    cred_db.scopes = list(creds.scopes or SCOPES)
    if creds.expiry:
        cred_db.expiry = creds.expiry.replace(tzinfo=None) if creds.expiry.tzinfo else creds.expiry

    db.commit()
    db.refresh(cred_db)
    return cred_db


def get_valid_google_credentials(db: Session) -> Credentials | None:
    """Retrieve credentials from DB, refreshing access token if expired."""
    cred_db = db.query(GoogleCredentialDB).filter(GoogleCredentialDB.user_id == "default").first()
    if not cred_db or not cred_db.access_token:
        return None

    settings = get_settings()
    client_id = cred_db.client_id or settings.google_client_id
    client_secret = cred_db.client_secret or settings.google_client_secret

    raw_access_token = decrypt_token(cred_db.access_token, settings.secret_key)
    raw_refresh_token = decrypt_token(cred_db.refresh_token, settings.secret_key)

    creds = Credentials(
        token=raw_access_token,
        refresh_token=raw_refresh_token,
        token_uri=cred_db.token_uri,
        client_id=client_id,
        client_secret=client_secret,
        scopes=cred_db.scopes
    )

    # Check expiration and refresh if necessary
    from google.auth.transport.requests import Request
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            cred_db.access_token = encrypt_token(creds.token, settings.secret_key)
            if creds.expiry:
                cred_db.expiry = creds.expiry.replace(tzinfo=None) if creds.expiry.tzinfo else creds.expiry
            db.commit()
        except Exception as e:
            logger.error(f"Failed to refresh Google credentials: {e}")
            return None

    return creds



def is_google_connected(db: Session) -> tuple[bool, str | None]:
    """Check if user has an active Google connection."""
    cred_db = db.query(GoogleCredentialDB).filter(GoogleCredentialDB.user_id == "default").first()
    if cred_db and cred_db.access_token:
        return True, cred_db.email
    return False, None


def disconnect_google(db: Session) -> bool:
    """Disconnect and remove stored Google credentials."""
    cred_db = db.query(GoogleCredentialDB).filter(GoogleCredentialDB.user_id == "default").first()
    if cred_db:
        db.delete(cred_db)
        db.commit()
        return True
    return False
