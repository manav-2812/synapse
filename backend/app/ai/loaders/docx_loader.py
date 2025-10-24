"""DOCX text extraction."""
from app.core.logger import get_logger

log = get_logger("loader.docx")


def load_docx(path: str) -> list[tuple[int, str]]:
    """Return list of (page_number, text). DOCX has no inherent pages, so one block."""
    from docx import Document as DocxDocument

    doc = DocxDocument(path)
    paragraphs = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
    text = "\n".join(paragraphs)
    log.info("docx_loaded", paragraphs=len(paragraphs), path=path)
    return [(1, text)]
