import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal, init_db
from app.models.user import UserDB, UserCredentialsDB
from app.core.auth_utils import hash_password, create_access_token
from app.core.crypto import decrypt_secret
from app.core.ai_credentials import resolve_user_ai_config


def test_byok_and_profile():
    print("\n========== RUNNING UNIT & INTEGRATION TESTS FOR BYOK & PROFILE ==========")
    init_db()
    client = TestClient(app)
    db = SessionLocal()

    try:
        # Create test user
        username = "byok_tester"
        db.query(UserDB).filter(UserDB.username == username).delete()
        db.commit()

        user = UserDB(
            username=username,
            display_name="BYOK Tester",
            email="tester@dhbw.de",
            password_hash=hash_password("testpass123"),
            role="member",
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token({"sub": user.id, "username": user.username, "role": user.role})
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Test GET /auth/me before custom keys
        print("--> 1. Testing GET /auth/me default credentials...")
        r = client.get("/api/v1/auth/me", headers=headers)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["username"] == username
        assert data["credentials"]["has_gemini_api_key"] is False
        assert data["credentials"]["has_openai_api_key"] is False
        print("  ✓ GET /auth/me returned correct defaults without custom keys")

        # 2. Test resolve_user_ai_config with defaults
        print("--> 2. Testing resolve_user_ai_config fallback to settings...")
        cfg = resolve_user_ai_config(user)
        assert cfg.has_custom_keys is False
        print("  ✓ resolve_user_ai_config correctly used system fallbacks")

        # 3. Test PATCH /auth/credentials (BYOK Gemini + OpenAI + Engines)
        print("--> 3. Testing PATCH /auth/credentials with BYOK keys and engines...")
        creds_payload = {
            "gemini_api_key": "AIzaSy_fake_test_gemini_key_12345",
            "gemini_model": "gemini-pro-latest",
            "openai_api_key": "sk-proj-fake_test_openai_key_67890",
            "openai_model": "gpt-4o",
            "transcription_engine": "openai",
            "summarization_engine": "openai",
            "jira_account_id": "712020:test-jira-account-id",
            "github_token": "ghp_fake_github_pat_token",
            "git_author_name": "Test Developer",
            "git_author_email": "dev@company.com",
        }
        r = client.patch("/api/v1/auth/credentials", json=creds_payload, headers=headers)
        assert r.status_code == 200, f"Credentials update failed: {r.text}"
        print("  ✓ PATCH /auth/credentials returned 200 OK")

        # 4. Verify DB encryption
        print("--> 4. Verifying Fernet AES-256 DB encryption...")
        db.refresh(user)
        user_creds = user.credentials
        assert user_creds is not None
        # Encrypted ciphertexts must not equal plaintext!
        assert user_creds.gemini_api_key_encrypted != creds_payload["gemini_api_key"]
        assert user_creds.openai_api_key_encrypted != creds_payload["openai_api_key"]
        assert user_creds.github_token_encrypted != creds_payload["github_token"]
        # Decrypted ciphertexts must match plaintext exactly
        assert decrypt_secret(user_creds.gemini_api_key_encrypted) == creds_payload["gemini_api_key"]
        assert decrypt_secret(user_creds.openai_api_key_encrypted) == creds_payload["openai_api_key"]
        assert decrypt_secret(user_creds.github_token_encrypted) == creds_payload["github_token"]
        assert user_creds.transcription_engine == "openai"
        assert user_creds.summarization_engine == "openai"
        print("  ✓ Secrets are securely encrypted in DB and successfully decrypt back to exact plaintext")

        # 5. Test GET /auth/me returns masked secrets
        print("--> 5. Testing GET /auth/me with masked personal keys...")
        r = client.get("/api/v1/auth/me", headers=headers)
        assert r.status_code == 200
        me_data = r.json()
        assert me_data["credentials"]["has_gemini_api_key"] is True
        assert me_data["credentials"]["has_openai_api_key"] is True
        assert me_data["credentials"]["has_github_token"] is True
        assert "••••" in me_data["credentials"]["gemini_api_key_masked"]
        assert "••••" in me_data["credentials"]["openai_api_key_masked"]
        assert "••••" in me_data["credentials"]["github_token_masked"]
        assert me_data["credentials"]["transcription_engine"] == "openai"
        assert me_data["credentials"]["summarization_engine"] == "openai"
        print(f"  ✓ Masked Gemini key: {me_data['credentials']['gemini_api_key_masked']}")
        print(f"  ✓ Masked OpenAI key: {me_data['credentials']['openai_api_key_masked']}")
        print(f"  ✓ Masked GitHub token: {me_data['credentials']['github_token_masked']}")

        # 6. Test resolve_user_ai_config with user's custom BYOK keys
        print("--> 6. Testing resolve_user_ai_config with user BYOK keys active...")
        cfg_custom = resolve_user_ai_config(user)
        assert cfg_custom.has_custom_keys is True
        assert cfg_custom.summarization_engine == "openai"
        assert cfg_custom.summarization_api_key == creds_payload["openai_api_key"]
        assert cfg_custom.transcription_engine == "openai"
        assert cfg_custom.transcription_api_key == creds_payload["openai_api_key"]
        print("  ✓ resolve_user_ai_config successfully resolved user's personal keys and custom engines!")

        # 7. Test PATCH /auth/profile
        print("--> 7. Testing PATCH /auth/profile (Display name & Telegram)...")
        profile_payload = {
            "display_name": "Senior BYOK Developer",
            "telegram_username": "@byok_dev",
            "telegram_chat_id": "987654321",
        }
        r = client.patch("/api/v1/auth/profile", json=profile_payload, headers=headers)
        assert r.status_code == 200, f"Profile update failed: {r.text}"
        db.refresh(user)
        assert user.display_name == "Senior BYOK Developer"
        assert user.telegram_username == "byok_dev"
        assert user.telegram_chat_id == "987654321"
        print("  ✓ PATCH /auth/profile updated user display name, telegram username, and chat id")

        # 8. Test clearing personal keys back to system defaults
        print("--> 8. Testing resetting keys to system defaults...")
        r = client.patch("/api/v1/auth/credentials", json={"gemini_api_key": "", "openai_api_key": ""}, headers=headers)
        assert r.status_code == 200
        db.refresh(user)
        assert user.credentials.gemini_api_key_encrypted is None
        assert user.credentials.openai_api_key_encrypted is None
        cfg_cleared = resolve_user_ai_config(user)
        assert cfg_cleared.has_custom_keys is False
        print("  ✓ Personal keys cleared cleanly and reverted to system defaults")

        print("\n==================== ALL BYOK TESTS PASSED (8/8) ====================\n")

    finally:
        db.query(UserDB).filter(UserDB.username == username).delete()
        db.commit()
        db.close()


if __name__ == "__main__":
    test_byok_and_profile()
