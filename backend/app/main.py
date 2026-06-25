"""Synapse backend entrypoint."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.analytics_routes import router as analytics_router
from app.api.v1.auth_routes import router as auth_router
from app.api.v1.chat_routes import router as chat_router
from app.api.v1.document_routes import router as document_router
from app.api.v1.folder_routes import router as folder_router
from app.api.v1.study_routes import router as study_router
from app.api.v1.user_routes import router as user_router
from app.api.v1.eval_routes import router as eval_router
from app.ai.ocr import log_tesseract_status
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.limiter import limiter
from app.core.logger import get_logger

log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    for p in (settings.chroma_persist_path, settings.storage_path, settings.avatars_path):
        Path(p).resolve().mkdir(parents=True, exist_ok=True)
    # Surface OCR availability once at startup (graceful degradation if missing).
    log_tesseract_status()
    log.info(
        "synapse_startup",
        env=settings.app_env,
        chroma_persist_path=settings.chroma_persist_path,
        storage_path=settings.storage_path,
    )
    yield


app = FastAPI(
    title="Synapse API",
    version="1.0.0",
    description="AI-powered study assistant — RAG chat, document pipeline, study tools.",
    docs_url="/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# CORS — restricted to known frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting
app.state.limiter = limiter
register_exception_handlers(app)

# Routers (Phase 1 + 2 + 3 + 4 + 5)
app.include_router(auth_router)
app.include_router(user_router)
# Register folder routes BEFORE document routes: both live under
# /api/v1/documents, and the document router's `/{document_id}` catch-all would
# otherwise shadow `/documents/folders*` (GET/DELETE would hit get_document).
app.include_router(folder_router)
app.include_router(document_router)
app.include_router(chat_router)
app.include_router(study_router)
app.include_router(analytics_router)
app.include_router(eval_router)

# Serve uploaded profile avatars. Filenames are random UUIDs so they are not
# enumerable; the directory is created here (and again in the lifespan hook).
Path(settings.avatars_path).mkdir(parents=True, exist_ok=True)
app.mount("/avatars", StaticFiles(directory=settings.avatars_path), name="avatars")


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "synapse"}
