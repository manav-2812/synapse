"""PDF text extraction, preserving page numbers.

Digital PDFs carry an embedded text layer (extracted via PyMuPDF). Scanned /
image-only PDFs have no text layer, so for each empty page we render it to an
image and run OCR (Tesseract, with optional vision-LLM fallback) — see
``app.ai.ocr``. Every page is processed defensively so a single bad page never
crashes ingestion.
"""
from app.ai.ocr import ocr_pil_image
from app.core.config import settings
from app.core.logger import get_logger

log = get_logger("loader.pdf")


def load_pdf(path: str) -> list[tuple[int, str]]:
    """Return list of (page_number, text) for each page."""
    import fitz  # PyMuPDF
    from PIL import Image

    pages: list[tuple[int, str]] = []
    doc = fitz.open(path)
    try:
        for i, page in enumerate(doc):
            text = (page.get_text("text") or "").strip()
            if not text:
                # Scanned page: render to an image and OCR it.
                try:
                    pix = page.get_pixmap(dpi=settings.ocr_dpi, alpha=False)
                    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
                    ocr_text = ocr_pil_image(img)
                    if ocr_text:
                        text = ocr_text
                        log.info("pdf_page_ocr", page=i + 1, chars=len(text))
                except Exception as e:
                    log.warning("pdf_page_ocr_failed", page=i + 1, error=str(e)[:200])
            pages.append((i + 1, text))
    finally:
        doc.close()
    log.info("pdf_loaded", pages=len(pages), path=path)
    return pages
