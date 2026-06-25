"""Application configuration loaded once from environment / .env."""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central settings object. Never hardcode config — read from here."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+asyncpg://postgres@localhost:5432/synapse"

    # Vector store
    chroma_persist_path: str = "./chroma_db"

    # JWT / Auth
    jwt_secret_key: str = "change_me_in_production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 20
    refresh_token_expire_days: int = 7

    # LLM providers
    groq_api_key: str = ""
    gemini_api_key: str = ""

    # CORS — restricted to known frontend origins (dev servers, vite preview
    # ports used by local `npm run preview` and the Playwright/Lighthouse audit
    # harnesses, the API's own origin for Swagger, and the production Vercel
    # domain). Override via ALLOWED_ORIGINS in deployed envs.
    allowed_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:4173,http://127.0.0.1:4173,"
        "http://localhost:4319,http://127.0.0.1:4319,"
        "http://localhost:8000,http://127.0.0.1:8000,"
        "https://synapse.vercel.app"
    )

    # File storage
    storage_path: str = "./storage"

    # App
    debug: bool = False
    app_env: str = "development"

    # Public base URL used to build absolute URLs returned to the client
    # (e.g. avatar image URLs). The SPA is served from a different origin in
    # dev, so a relative path would not resolve — we return the full URL.
    app_base_url: str = "http://127.0.0.1:8000"

    # Upload limits
    max_upload_size_mb: int = 50
    allowed_extensions: str = "pdf,docx,txt,png,jpg,jpeg"

    # OCR (PNG/JPG uploads and scanned/image-only PDF pages)
    ocr_language: str = "eng"  # Tesseract language pack(s), e.g. "eng" or "eng+de"
    ocr_dpi: int = 300  # render DPI when rasterizing a scanned PDF page
    # When Tesseract is missing or returns nothing, fall back to a multimodal
    # LLM. This has API cost — keep OFF unless you have a provider key and
    # accept the spend. Gemini is preferred; Groq is used if no Gemini key.
    ocr_vision_fallback_enabled: bool = False
    ocr_vision_model: str = "gemini-2.5-flash"
    ocr_vision_model_groq: str = "llama-3.2-11b-vision-preview"
    ocr_timeout_seconds: int = 60

    # Hybrid retrieval (BM25 keyword + semantic vector) blending weights.
    # Combined score = hybrid_semantic_weight * semantic_norm + hybrid_bm25_weight * bm25_norm.
    hybrid_semantic_weight: float = 0.6
    hybrid_bm25_weight: float = 0.4

    # LLM token pricing (USD per 1,000,000 tokens) for cost estimation/logging.
    groq_input_cost_per_1m: float = 0.59
    groq_output_cost_per_1m: float = 0.79
    gemini_input_cost_per_1m: float = 0.30
    gemini_output_cost_per_1m: float = 2.50

    # In-memory response cache (LRU) max entries.
    response_cache_max_size: int = 256
    response_cache_ttl_seconds: int = 3600

    @property
    def avatars_path(self) -> str:
        """Directory where user-uploaded profile avatars are stored."""
        return str(Path(self.storage_path).resolve() / "avatars")

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def allowed_extensions_list(self) -> list[str]:
        return [e.strip().lower() for e in self.allowed_extensions.split(",") if e.strip()]

    @field_validator("chroma_persist_path", "storage_path")
    @classmethod
    def _resolve_paths(cls, v: str) -> str:
        # Resolve relative paths (e.g. ./chroma_db) to absolute so Chroma and the
        # file store are stable regardless of the process working directory.
        return str(Path(v).resolve())


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (loaded once)."""
    return Settings()


settings = get_settings()
