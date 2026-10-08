import hashlib

import numpy as np

from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger("meeting_agent.embedding")

EMBEDDING_DIM = 768

def _local_fallback_embedding(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    """
    Generate a deterministic, normalized embedding vector from text using SHA256 n-gram hashing.
    Used when no external AI API key is configured or when offline.
    """
    if not text:
        return [0.0] * dim

    words = text.lower().split()
    vec = np.zeros(dim, dtype=np.float32)

    for i, word in enumerate(words):
        # Hash each word + bigram into deterministic float values
        h = int(hashlib.sha256(word.encode("utf-8")).hexdigest()[:8], 16)
        idx = h % dim
        sign = 1.0 if (h >> 16) % 2 == 0 else -1.0
        vec[idx] += sign * (1.0 / (i + 1.0) ** 0.5)

        if i < len(words) - 1:
            bigram = f"{word}_{words[i+1]}"
            bh = int(hashlib.sha256(bigram.encode("utf-8")).hexdigest()[:8], 16)
            bidx = bh % dim
            bsign = 1.0 if (bh >> 16) % 2 == 0 else -1.0
            vec[bidx] += bsign * 0.7

    norm = np.linalg.norm(vec)
    if norm > 1e-6:
        vec = vec / norm
    return vec.tolist()


class EmbeddingService:
    """Service for generating unified 768-dimensional text embeddings for RAG."""

    @staticmethod
    def get_embedding(text: str) -> list[float]:
        """Generate a 768-dim embedding for a single text string."""
        clean_text = text.strip() if text else ""
        if not clean_text:
            return [0.0] * EMBEDDING_DIM

        settings = get_settings()

        # 1. Try Gemini Embeddings (gemini-embedding-001)
        if settings.gemini_api_key:
            try:
                from google import genai
                from google.genai import types
                client = genai.Client(api_key=settings.gemini_api_key)
                response = client.models.embed_content(
                    model="gemini-embedding-001",
                    contents=clean_text[:4000],
                    config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM)
                )
                emb = getattr(response, "embedding", None)
                if emb and hasattr(emb, "values") and len(emb.values) == EMBEDDING_DIM:
                    return list(emb.values)
                if response.embeddings and len(response.embeddings) > 0:
                    val = response.embeddings[0].values
                    if len(val) == EMBEDDING_DIM:
                        return list(val)
            except Exception as e:
                logger.warning(f"Gemini embedding warning: {e}")

        # 2. Try OpenAI Embeddings (text-embedding-3-small with 768 dimensions)
        if settings.openai_api_key:
            try:
                from openai import OpenAI
                client = OpenAI(api_key=settings.openai_api_key)
                res = client.embeddings.create(
                    input=clean_text[:4000],
                    model="text-embedding-3-small",
                    dimensions=EMBEDDING_DIM
                )
                if res.data and len(res.data) > 0:
                    return list(res.data[0].embedding)
            except Exception as e:
                logger.warning(f"OpenAI embedding warning: {e}")

        # 3. Fallback to deterministic local embedding
        return _local_fallback_embedding(clean_text, dim=EMBEDDING_DIM)

    @staticmethod
    def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts."""
        return [EmbeddingService.get_embedding(t) for t in texts]

    @staticmethod
    def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
        """Compute cosine similarity between two float vectors."""
        if not vec1 or not vec2:
            return 0.0
        v1 = np.array(vec1, dtype=np.float32)
        v2 = np.array(vec2, dtype=np.float32)
        dot = np.dot(v1, v2)
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        if norm1 < 1e-6 or norm2 < 1e-6:
            return 0.0
        return float(dot / (norm1 * norm2))
