"""Plain text extraction."""
from app.core.logger import get_logger

log = get_logger("loader.txt")


def load_txt(path: str) -> list[tuple[int, str]]:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()
    log.info("txt_loaded", chars=len(text), path=path)
    return [(1, text)]
