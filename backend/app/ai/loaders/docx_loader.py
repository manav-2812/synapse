"""DOCX text extraction."""
from app.core.logger import get_logger

log = get_logger("loader.docx")


def load_docx(path: str) -> list[tuple[int, str]]:
    """Return list of (page_number, text). DOCX has no inherent pages, so one block."""
    from docx import Document as DocxDocument
    from docx.opc.exceptions import PackageNotFoundError

    try:
        doc = DocxDocument(path)
        paragraphs = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
        text = "\n".join(paragraphs)
        log.info("docx_loaded", paragraphs=len(paragraphs), path=path)
        return [(1, text)]
    except PackageNotFoundError:
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read().strip()
                if content and any(c.isalnum() for c in content[:200]):
                    log.warning("docx_fallback_text", path=path)
                    return [(1, content)]
        except Exception:
            pass
        raise
