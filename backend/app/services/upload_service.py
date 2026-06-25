"""File upload handling: validation + disk storage with UUID names."""
import os
import uuid

from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.core.logger import get_logger

log = get_logger("upload")

# Image extensions are normalized to the loader's single "image" type so the
# file_type stored on the document matches what loaders/__init__.py dispatches on.
_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg"}


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def validate_upload(file: UploadFile) -> str:
    """Validate size + extension. Returns a normalized file type.

    Image extensions (png/jpg/jpeg) are mapped to ``"image"``; all other
    allowed extensions are returned unchanged.
    """
    ext = _ext(file.filename or "")
    if ext not in settings.allowed_extensions_list:
        raise ValidationError(
            f"Unsupported file type '.{ext}'. Allowed: {', '.join(settings.allowed_extensions_list)}"
        )
    return "image" if ext in _IMAGE_EXTENSIONS else ext


async def save_upload(file: UploadFile, user_id: uuid.UUID, document_id: uuid.UUID) -> tuple[str, str, int]:
    """Persist the uploaded file. Returns (storage_path, filename_uuid, size_bytes)."""
    ext = _ext(file.filename or "")
    filename = f"{document_id}{('.' + ext) if ext else ''}"
    user_dir = os.path.join(settings.storage_path, str(user_id))
    os.makedirs(user_dir, exist_ok=True)
    dest = os.path.join(user_dir, filename)

    size = 0
    with open(dest, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            size += len(chunk)
            if size > settings.max_upload_size_mb * 1024 * 1024:
                break

    # Close the file *before* removing it so the deletion succeeds on Windows
    # (removing an open handle raises PermissionError there), and so the
    # intended ValidationError reaches the client instead of a 500.
    if size > settings.max_upload_size_mb * 1024 * 1024:
        os.remove(dest)
        raise ValidationError(
            f"File exceeds max size of {settings.max_upload_size_mb}MB."
        )

    log.info("file_saved", user_id=str(user_id), dest=dest, size=size)
    return dest, filename, size
