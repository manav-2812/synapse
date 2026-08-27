"""Application configuration loaded once from environment / .env."""
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator, model_validator
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

    # Google OAuth 2.0
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:5173/auth/callback/google"

    # Microsoft OAuth 2.0
    microsoft_client_id: str = ""
    microsoft_tenant_id: str = "common"
    microsoft_client_secret: str = ""
    microsoft_redirect_uri: str = "http://localhost:5173/auth/callback/microsoft"

    # WebAuthn / Passkey
    # webauthn_rp_id: leave empty to auto-derive from app_base_url hostname.
    # Must match the domain the frontend is served from (e.g. "synapse.study").
    webauthn_rp_id: str = ""
    webauthn_rp_name: str = "Synapse"

    # Brute-force login protection
    login_max_attempts: int = 10       # failures before lockout
    login_lockout_minutes: int = 15    # lockout duration

    # LLM providers
    groq_api_key: str = ""
    gemini_api_key: str = ""
    openrouter_api_key: str = ""
    # Gemini model name — override via GEMINI_MODEL env var if the default changes.
    gemini_model: str = "gemini-2.5-flash"

    # CORS — restricted to known frontend origins (dev servers, vite preview
    # ports used by local `npm run preview` and the Playwright/Lighthouse audit
    # harnesses, the API's own origin for Swagger, and the production Vercel
    # domain). Override via ALLOWED_ORIGINS in deployed envs.
    allowed_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5174,http://127.0.0.1:5174,"
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
    frontend_base_url: str = "http://localhost:5173"

    # Email / SMTP configuration (leave smtp_host empty to use dev logging stub)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_tls: bool = True
    emails_from_email: str = "noreply@synapse.study"
    emails_from_name: str = "Synapse"

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

    # Retrieval top-k values. chat_top_k is how many chunks are injected into
    # the chat prompt; study_top_k for quiz/flashcard/notes generation.
    # Increasing these improves coverage but grows the prompt (cost + latency).
    chat_top_k: int = 6
    study_top_k: int = 7

    # Multiplier applied to top_k when pulling initial candidates for re-ranking.
    retrieval_candidate_factor: int = 3

    # Minimum hybrid score [0..1] a chunk must reach to be included in the
    # prompt context. Chunks below this are excluded even if they rank in top_k.
    # Set to 0.0 to disable (legacy behaviour — passes all retrieved chunks).
    relevance_threshold: float = 0.15

    # Minimum score a chunk must reach for the retrieval to be considered
    # "genuinely relevant" — i.e. the user's documents actually cover the topic.
    # Used exclusively to decide whether to fall back to web search.
    # Must be >= relevance_threshold. Increase this to trigger web fallback more
    # aggressively; decrease it to rely more on documents.
    web_fallback_threshold: float = 0.58

    # Chunking parameters. CHUNK_TOKENS should stay under the embedding model's
    # max_seq_length (all-MiniLM-L6-v2 = 256 tokens). CHUNK_OVERLAP provides
    # sentence-boundary continuity between adjacent chunks.
    chunk_tokens: int = 240
    chunk_overlap: int = 40

    # How many recent conversation turns to include as history in the chat
    # prompt. Each turn = 1 user + 1 assistant message pair.
    chat_history_window: int = 6

    # LLM token pricing (USD per 1,000,000 tokens) for cost estimation/logging.
    groq_input_cost_per_1m: float = 0.59
    groq_output_cost_per_1m: float = 0.79
    gemini_input_cost_per_1m: float = 0.30
    gemini_output_cost_per_1m: float = 2.50

    # In-memory response cache (LRU) max entries.
    response_cache_max_size: int = 256
    response_cache_ttl_seconds: int = 3600

    # Web search (Tavily) — secondary retrieval source when document retrieval
    # returns no relevant chunks above the relevance threshold.
    # Set TAVILY_API_KEY to a non-empty value to enable web search.
    tavily_api_key: str = ""
    # Maximum number of Tavily results to include in the LLM context.
    web_search_max_results: int = 5

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

    @model_validator(mode="after")
    def _validate_production_jwt_secret(self) -> "Settings":
        if self.app_env.lower() == "production" and self.jwt_secret_key == "change_me_in_production":
            raise RuntimeError(
                "CRITICAL: Refusing to start in production with default jwt_secret_key='change_me_in_production'. "
                "Please set a secure JWT_SECRET_KEY in environment variables."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (loaded once)."""
    return Settings()


settings = get_settings()
