"""Centralized Dependency Injection (DI) providers and type annotations."""
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import require_auth

# Type-annotated Dependency Injection aliases for FastAPI 0.115+
DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]
AuthenticatedUser = Annotated[bool, Depends(require_auth)]
