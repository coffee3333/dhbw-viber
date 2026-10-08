import base64
import hashlib
from cryptography.fernet import Fernet
from app.core.config import get_settings


def _get_fernet_instance() -> Fernet:
    """Returns a deterministic Fernet cipher based on master key or app secret."""
    settings = get_settings()
    master_key = getattr(settings, "encryption_master_key", None)
    
    if not master_key or not master_key.strip():
        # Derive a 32-byte URL-safe base64 key from app_password or secret fallback
        seed = (settings.app_password or "meeting-agent-default-master-key-seed-2026").encode("utf-8")
        derived_32 = hashlib.sha256(seed).digest()
        master_key = base64.urlsafe_b64encode(derived_32).decode("utf-8")
    
    # Ensure key is valid urlsafe base64 32 bytes
    if isinstance(master_key, str):
        master_key = master_key.encode("utf-8")
    return Fernet(master_key)


def encrypt_secret(plaintext: str | None) -> str | None:
    """Encrypts sensitive plaintext (API tokens, PATs) into an AES-256 ciphertext string."""
    if not plaintext:
        return None
    cipher = _get_fernet_instance()
    encrypted_bytes = cipher.encrypt(plaintext.encode("utf-8"))
    return encrypted_bytes.decode("utf-8")


def decrypt_secret(ciphertext: str | None) -> str | None:
    """Decrypts AES-256 ciphertext back to plaintext. Returns empty string if invalid or None."""
    if not ciphertext:
        return None
    try:
        cipher = _get_fernet_instance()
        decrypted_bytes = cipher.decrypt(ciphertext.encode("utf-8"))
        return decrypted_bytes.decode("utf-8")
    except Exception:
        # If decryption fails (e.g. already plain or corrupted), return None
        return None


def mask_secret(secret: str | None, prefix_len: int = 4, suffix_len: int = 4) -> str:
    """Masks secret for UI display (e.g., 'ghp_••••••••8b9c')."""
    if not secret:
        return ""
    if len(secret) <= prefix_len + suffix_len:
        return "••••••••"
    return f"{secret[:prefix_len]}••••••••{secret[-suffix_len:]}"
