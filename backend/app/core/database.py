from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.core.config import get_settings
from app.core.logger import get_logger

settings = get_settings()
logger = get_logger("meeting_agent.db")

# Engine configuration
connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db() -> Generator[Session, None, None]:
    """Dependency for injecting SQLAlchemy database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all database tables on application startup and ensure newly added columns exist."""
    from sqlalchemy import text

    import app.models.db  # noqa: F401 - load models

    # If running against PostgreSQL, enable pgvector extension first and check columns
    if settings.database_url.startswith("postgresql"):
        try:
            with engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE;"))
                conn.execute(text("ALTER TABLE users ALTER COLUMN email DROP NOT NULL;"))
                conn.execute(text("ALTER TABLE user_credentials ADD COLUMN IF NOT EXISTS openai_api_key_encrypted TEXT;"))
                conn.execute(text("ALTER TABLE user_credentials ADD COLUMN IF NOT EXISTS openai_model VARCHAR(50) DEFAULT 'gpt-4o';"))
                conn.execute(text("ALTER TABLE user_credentials ADD COLUMN IF NOT EXISTS transcription_engine VARCHAR(30) DEFAULT 'gemini';"))
                conn.execute(text("ALTER TABLE user_credentials ADD COLUMN IF NOT EXISTS summarization_engine VARCHAR(30) DEFAULT 'gemini';"))
                conn.execute(text("ALTER TABLE meetings ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);"))
                conn.commit()
                logger.info("PostgreSQL extensions and schema verified successfully.")
        except Exception as e:
            logger.warning(f"pgvector / schema check note: {e}")
    elif settings.database_url.startswith("sqlite"):
        try:
            with engine.connect() as conn:
                # Check user_credentials columns
                table_check = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='user_credentials';")).fetchone()
                if table_check:
                    cols = [r[1] for r in conn.execute(text("PRAGMA table_info(user_credentials);")).fetchall()]
                    if "openai_api_key_encrypted" not in cols:
                        conn.execute(text("ALTER TABLE user_credentials ADD COLUMN openai_api_key_encrypted TEXT;"))
                    if "openai_model" not in cols:
                        conn.execute(text("ALTER TABLE user_credentials ADD COLUMN openai_model VARCHAR(50) DEFAULT 'gpt-4o';"))
                    if "transcription_engine" not in cols:
                        conn.execute(text("ALTER TABLE user_credentials ADD COLUMN transcription_engine VARCHAR(30) DEFAULT 'gemini';"))
                    if "summarization_engine" not in cols:
                        conn.execute(text("ALTER TABLE user_credentials ADD COLUMN summarization_engine VARCHAR(30) DEFAULT 'gemini';"))
                # Check meetings columns
                m_check = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='meetings';")).fetchone()
                if m_check:
                    m_cols = [r[1] for r in conn.execute(text("PRAGMA table_info(meetings);")).fetchall()]
                    if "user_id" not in m_cols:
                        conn.execute(text("ALTER TABLE meetings ADD COLUMN user_id VARCHAR(64);"))
                conn.commit()
        except Exception as e:
            logger.warning(f"SQLite migration check note: {e}")

    Base.metadata.create_all(bind=engine)
    logger.info("SQLAlchemy database tables schema verified.")

    # Seed initial Admin user if no admin exists
    try:
        from app.models.user import UserDB
        from app.core.auth_utils import hash_password
        with SessionLocal() as db:
            admin_user = db.query(UserDB).filter(UserDB.role == "admin").first()
            if not admin_user:
                default_admin_pwd = settings.app_password or "admin123"
                new_admin = UserDB(
                    username="admin",
                    display_name="Administrator",
                    password_hash=hash_password(default_admin_pwd),
                    role="admin",
                    is_active=True,
                )
                db.add(new_admin)
                db.commit()
                logger.info("Default admin user initialized (username: admin).")
            elif not admin_user.username:
                admin_user.username = "admin"
                db.commit()
    except Exception as e:
        logger.warning(f"Admin seeding note: {e}")

    # Safe migration for newly added columns in SQLite
    if settings.database_url.startswith("sqlite"):
        try:
            with engine.connect() as conn:
                # Lecture columns migration
                res = conn.execute(text("PRAGMA table_info(lectures)")).fetchall()
                cols = [row[1] for row in res]
                if "status" not in cols:
                    conn.execute(text("ALTER TABLE lectures ADD COLUMN status VARCHAR(50) DEFAULT 'scheduled'"))
                if "notes" not in cols:
                    conn.execute(text("ALTER TABLE lectures ADD COLUMN notes TEXT DEFAULT ''"))
                if "materials_json" not in cols:
                    conn.execute(text("ALTER TABLE lectures ADD COLUMN materials_json TEXT DEFAULT '[]'"))
                if "ai_summary_override" not in cols:
                    conn.execute(text("ALTER TABLE lectures ADD COLUMN ai_summary_override TEXT DEFAULT NULL"))

                # Knowledge chunk embedding column migration
                chunk_res = conn.execute(text("PRAGMA table_info(lecture_knowledge_chunks)")).fetchall()
                chunk_cols = [row[1] for row in chunk_res]
                if "embedding" not in chunk_cols:
                    conn.execute(text("ALTER TABLE lecture_knowledge_chunks ADD COLUMN embedding TEXT DEFAULT NULL"))

                conn.commit()
        except Exception as e:
            logger.warning(f"Database migration check notice: {e}")
