"""Loader dispatch by file type."""
import os

from app.core.exceptions import ProcessingError
from app.core.logger import get_logger

log = get_logger("loader")


def load_document(path: str, file_type: str) -> list[tuple[int, str]]:
    """Load a document and return list of (page_number, text)."""
    ft = file_type.lower()
    try:
        if ft == "pdf":
            from app.ai.loaders.pdf_loader import load_pdf

            return load_pdf(path)
        if ft == "docx":
            from app.ai.loaders.docx_loader import load_docx

            return load_docx(path)
        if ft == "txt":
            from app.ai.loaders.txt_loader import load_txt

            return load_txt(path)
        if ft == "image":
            from app.ai.loaders.image_loader import load_image

            return load_image(path)
    except ProcessingError:
        raise
    except Exception as e:
        raise ProcessingError(f"Failed to extract text from {os.path.basename(path)}: {e}") from e

    raise ProcessingError(f"Unsupported file type: {file_type}")
