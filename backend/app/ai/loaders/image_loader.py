"""Image (scanned notes) extraction via OCR.

OCR depends on Tesseract being installed on the host, with an optional
vision-LLM fallback when Tesseract is missing or returns nothing. When all OCR
paths fail we degrade gracefully: the upload still succeeds and the document is
stored, but with a clear, user-facing note instead of a raw exception that would
crash processing.
"""
from app.ai.ocr import OCR_UNAVAILABLE_NOTE, ocr_pil_image
from app.core.logger import get_logger

log = get_logger("loader.image")


def load_image(path: str) -> list[tuple[int, str]]:
    """Run OCR on a PNG/JPG and return [(1, text)].

    Returns a single chunk with ``OCR_UNAVAILABLE_NOTE`` when OCR cannot run, so
    the pipeline never crashes on an image upload.
    """
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover - defensive, Pillow is a hard dep
        return [(1, OCR_UNAVAILABLE_NOTE)]

    try:
        img = Image.open(path)
        if img.mode != "RGB":
            img = img.convert("RGB")
        text = ocr_pil_image(img)
    except Exception as e:
        # Graceful fallback: keep the upload usable instead of failing it.
        log.warning("image_ocr_failed", error=str(e)[:200], path=path)
        return [(1, OCR_UNAVAILABLE_NOTE)]

    if not text:
        log.info("image_ocr_empty", path=path)
        return [(1, OCR_UNAVAILABLE_NOTE)]

    log.info("image_ocr_done", chars=len(text), path=path)
    return [(1, text)]
