"""Light text cleaning for extracted document text."""
import re
import unicodedata


class TextCleaner:
    @staticmethod
    def clean(text: str) -> str:
        if not text:
            return ""
        text = unicodedata.normalize("NFKC", text)
        text = text.replace(" ", " ")
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = text.strip()
        return text


def clean_text(text: str) -> str:
    return TextCleaner.clean(text)
