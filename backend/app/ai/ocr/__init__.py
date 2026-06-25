"""Shared OCR utilities: Tesseract with graceful degradation + vision-LLM fallback.

Used by both the image loader (PNG/JPG uploads) and the PDF loader (scanned,
image-only PDF pages that have no embedded text layer).

OCR priority per image:
  1. Tesseract (pytesseract) — fast, free, runs locally on the host.
  2. Vision LLM (Gemini then Groq) — only if ``OCR_VISION_FALLBACK_ENABLED`` is
     set and a provider key is configured, and Tesseract produced no usable
     text. This incurs API cost, so it is OFF by default.

Everything degrades gracefully: if no OCR path succeeds, callers get ``None``
(or ``OCR_UNAVAILABLE_NOTE`` for the public-facing image upload path) instead of
a crash, so the ingestion pipeline never fails on an image.
"""
import base64
import io
import threading

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("ocr")

# Injected into a retrievable chunk when OCR cannot run, so the document still
# explains the situation instead of failing silently.
OCR_UNAVAILABLE_NOTE = (
    "[OCR unavailable: no text could be extracted from this image. "
    "Install Tesseract or enable the vision-LLM OCR fallback to extract text "
    "from scanned or handwritten images.]"
)

_VISION_PROMPT = (
    "Transcribe all text visible in this image exactly as written, preserving "
    "line breaks, headings, and lists. If it is a document or notes, return only "
    "the transcribed text with no commentary. If there is no text, return empty."
)

_lock = threading.Lock()
_tesseract_checked = False
_tesseract_available: bool | None = None


def _tesseract_available() -> bool:
    """Probe for a working Tesseract install once, then cache the result."""
    global _tesseract_checked, _tesseract_available
    with _lock:
        if _tesseract_checked:
            return bool(_tesseract_available)
        available = False
        try:
            import pytesseract  # noqa: F401

            pytesseract.get_tesseract_version()
            available = True
        except Exception as e:  # Tesseract binary missing, not on PATH, etc.
            log.warning("tesseract_unavailable", error=str(e)[:200])
        _tesseract_checked = True
        _tesseract_available = available
        return available


def _vision_provider() -> str | None:
    """Return the vision provider to use, or None if fallback is off/unconfigured."""
    if not settings.ocr_vision_fallback_enabled:
        return None
    if settings.gemini_api_key:
        return "gemini"
    if settings.groq_api_key:
        return "groq"
    return None


def ocr_pil_image(img) -> str | None:
    """Run OCR on an in-memory PIL image. Returns stripped text, or None.

    Tries Tesseract first; if it yields nothing and the vision fallback is
    enabled, sends the image to a multimodal LLM. Never raises.
    """
    if _tesseract_available():
        try:
            import pytesseract

            text = (pytesseract.image_to_string(img, lang=settings.ocr_language) or "").strip()
            if text:
                return text
            log.info("ocr_tesseract_empty")
        except Exception as e:
            log.warning("ocr_tesseract_failed", error=str(e)[:200])

    provider = _vision_provider()
    if provider == "gemini":
        return _vision_ocr_gemini(img)
    if provider == "groq":
        return _vision_ocr_groq(img)
    return None


def _vision_ocr_gemini(img) -> str | None:
    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(settings.ocr_vision_model)
        resp = model.generate_content(
            [_VISION_PROMPT, img],
            generation_config={"max_output_tokens": 4096, "temperature": 0.0},
            request_options={"timeout": settings.ocr_timeout_seconds},
        )
        text = (resp.text or "").strip()
        if text:
            log.info("ocr_vision_gemini_done", chars=len(text))
            return text
    except Exception as e:  # pragma: no cover - network/provider dependent
        log.warning("ocr_vision_gemini_failed", error=str(e)[:200])
    return None


def _vision_ocr_groq(img) -> str | None:
    try:
        from groq import Groq

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        data_uri = f"data:image/png;base64,{b64}"
        client = Groq(api_key=settings.groq_api_key, timeout=settings.ocr_timeout_seconds)
        resp = client.chat.completions.create(
            model=settings.ocr_vision_model_groq,
            messages=[
                {"role": "system", "content": _VISION_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Transcribe this image."},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                },
            ],
            max_tokens=4096,
            temperature=0.0,
        )
        text = (resp.choices[0].message.content or "").strip()
        if text:
            log.info("ocr_vision_groq_done", chars=len(text))
            return text
    except Exception as e:  # pragma: no cover - network/provider dependent
        log.warning("ocr_vision_groq_failed", error=str(e)[:200])
    return None


def log_tesseract_status() -> None:
    """Probe OCR availability once at startup and log a clear warning if missing.

    Called from the app lifespan so a missing Tesseract install is surfaced
    immediately rather than only on the first image upload.
    """
    available = _tesseract_available()
    vision = _vision_provider()
    if available:
        log.info("tesseract_available", status="ok")
    else:
        log.warning(
            "tesseract_unavailable_startup",
            vision_fallback=vision or "disabled",
            msg=(
                "OCR disabled: Tesseract is not installed on this host. "
                "Image uploads will still be stored, but their text will not be "
                "extracted unless the vision-LLM OCR fallback is enabled."
            ),
        )
