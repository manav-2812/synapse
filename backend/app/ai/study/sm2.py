"""SM-2 spaced-repetition scheduler.

Implements the classic SuperMemo-2 algorithm: given a card's current
``ease_factor`` (≥1.3), ``interval`` (days), and ``repetitions`` count, plus the
user's recall ``quality`` rating (0–5), returns the next scheduling state.

Quality bands:
- 0–2  : forgot (lapse) -> repetitions reset, interval back to 1 day.
- 3    : recalled with serious difficulty.
- 4    : recalled with some hesitation.
- 5    : perfect recall.
"""
from datetime import datetime, timedelta, timezone

DEFAULT_EASE_FACTOR = 2.5
MIN_EASE_FACTOR = 1.3


def next_interval(repetitions: int, interval: int, ease_factor: float) -> int:
    """Compute the next review interval in days from the SM-2 progression."""
    if repetitions <= 0:
        return 1
    if repetitions == 1:
        return 6
    return max(1, round(interval * ease_factor))


def update(
    ease_factor: float,
    interval: int,
    repetitions: int,
    quality: int,
) -> tuple[float, int, int]:
    """Return ``(new_ease_factor, new_interval, new_repetitions)`` for a review.

    ``quality`` is clamped to 0–5. A lapse (quality < 3) resets the repetition
    counter and shortens the interval to 1 day; the ease factor still decays.
    """
    q = max(0, min(5, int(quality)))

    # Ease factor update (SM-2 formula).
    new_ef = ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    new_ef = max(MIN_EASE_FACTOR, new_ef)

    if q < 3:
        new_reps = 0
        new_interval = 1
    else:
        new_reps = repetitions + 1
        new_interval = next_interval(new_reps, interval, new_ef)

    return new_ef, new_interval, new_reps


def due_date_from(interval_days: int, now: datetime | None = None) -> datetime:
    """Absolute due timestamp for the next review (timezone-aware UTC)."""
    base = now or datetime.now(timezone.utc)
    return base + timedelta(days=max(0, interval_days))
