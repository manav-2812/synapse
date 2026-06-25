"""Evaluation dataset loader.

The dataset is a hand-written set of question / expected-answer / expected-
source-document triples used to *measure* retrieval quality rather than assume
it. Source documents are referenced by filename so they can be matched against
a user's real uploads at eval time (see :mod:`app.api.v1.eval_routes`).

Seed documents live in ``fixtures/`` and can be uploaded to any account to
reproduce the evaluation.
"""
from pathlib import Path

from app.core.logger import get_logger

log = get_logger("eval.dataset")

_FIXTURE = Path(__file__).parent / "fixtures" / "eval_dataset.json"


def load_eval_dataset() -> list[dict]:
    """Return the eval dataset as a list of item dicts."""
    import json

    try:
        with _FIXTURE.open(encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        log.warning("eval_dataset_missing", path=str(_FIXTURE))
        return []
    except json.JSONDecodeError as e:
        log.error("eval_dataset_invalid", error=str(e))
        return []
    return data


def dataset_size() -> int:
    return len(load_eval_dataset())
