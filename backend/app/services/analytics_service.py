"""Analytics dashboard aggregation."""
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm import cache as resp_cache
from app.core.exceptions import NotFoundError
from app.core.constants import MessageRole
from app.models.analytics import Analytics
from app.models.conversation import Conversation, Message
from app.models.llm_usage_log import LLMUsageLog
from app.repositories.chunk_repository import ChunkRepository
from app.repositories.document_repository import DocumentRepository
from app.repositories.study_activity_repository import StudyActivityRepository
from app.repositories.study_repository import StudyRepository
from app.repositories.user_repository import UserRepository


class AnalyticsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_dashboard(self, user_id: uuid.UUID):
        analytics = await UserRepository(self.session).get_analytics(user_id)
        if analytics is None:
            analytics = Analytics(user_id=user_id)

        docs = await DocumentRepository(self.session).list_by_user(user_id)
        quizzes = await StudyRepository(self.session).list_quizzes(user_id)

        # Study streak / today / weekly minutes from the per-day activity table,
        # with quiz/document creation days also counting as active days.
        today = datetime.now(timezone.utc).date()
        activity = await StudyActivityRepository(self.session).get_since(
            user_id, today - timedelta(days=365)
        )
        active_days: set[date] = {r.date for r in activity if r.minutes > 0}
        active_days.update(d.created_at.date() for d in docs if d.created_at)
        active_days.update(q.created_at.date() for q in quizzes if q.created_at)
        study_streak = _compute_streak(active_days)
        weekly_minutes = sum(
            r.minutes for r in activity if r.date >= today - timedelta(days=6)
        )
        today_minutes = sum(r.minutes for r in activity if r.date == today)

        user = await UserRepository(self.session).get_by_id(user_id)
        goal = user.daily_study_goal_minutes if user else 30

        # --- Weekly activity chart (Mon..Sun of the current calendar week) ---
        # Source of truth: the per-day StudyActivity table (minutes studied per
        # UTC day). Everything else is derived from it so the chart total, the
        # trend badge, and the value line all agree.
        activity_by_day = {r.date: r.minutes for r in activity}
        this_monday = today - timedelta(days=today.weekday())
        last_monday = this_monday - timedelta(days=7)
        this_sunday = this_monday + timedelta(days=6)
        weekday_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

        weekly_by_day = []
        for i in range(7):
            d = this_monday + timedelta(days=i)
            weekly_by_day.append(
                {"date": d.isoformat(), "weekday": weekday_labels[i],
                 "minutes": activity_by_day.get(d, 0)}
            )
        this_week_minutes = sum(b["minutes"] for b in weekly_by_day)
        last_week_minutes = sum(
            activity_by_day.get(last_monday + timedelta(days=i), 0) for i in range(7)
        )

        # --- Metric trends: this calendar week vs the previous one ---
        def count_in_window(items, start, end):
            return sum(
                1 for it in items
                if getattr(it, "created_at", None) and start <= it.created_at.date() <= end
            )

        documents_tw = count_in_window(docs, this_monday, this_sunday)
        documents_lw = count_in_window(docs, last_monday, this_monday - timedelta(days=1))
        quizzes_tw = count_in_window(quizzes, this_monday, this_sunday)
        quizzes_lw = count_in_window(quizzes, last_monday, this_monday - timedelta(days=1))

        # Questions asked = user chat messages, counted week-over-week.
        msg_res = await self.session.execute(
            select(Message.created_at)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(Conversation.user_id == user_id, Message.role == MessageRole.USER.value)
        )
        user_msg_dates = [row[0] for row in msg_res.all()]
        questions_tw = sum(
            1 for dt in user_msg_dates
            if dt and this_monday <= dt.date() <= this_sunday
        )
        questions_lw = sum(
            1 for dt in user_msg_dates
            if dt and last_monday <= dt.date() <= this_monday - timedelta(days=1)
        )

        # Avg quiz score week-over-week (None when a week has no scored quizzes).
        def avg_score_in_window(items, start, end):
            scores = [
                q.score for q in items
                if getattr(q, "created_at", None) and start <= q.created_at.date() <= end
                and q.score is not None
            ]
            return (sum(scores) / len(scores)) if scores else None

        score_tw = avg_score_in_window(quizzes, this_monday, this_sunday)
        score_lw = avg_score_in_window(quizzes, last_monday, this_monday - timedelta(days=1))

        # Per-document quiz performance (scope[0] is the primary document).
        doc_names = {str(d.id): d.original_filename for d in docs}
        perf: dict[str, list[float]] = {}
        for q in quizzes:
            scope = q.document_scope or []
            if scope:
                perf.setdefault(scope[0], []).append(q.score or 0.0)

        topic_performance = []
        weak, strong = [], []
        for did, scores in perf.items():
            avg = sum(scores) / len(scores)
            name = doc_names.get(str(did), "Untitled document")
            topic_performance.append({"topic": name, "score": avg, "quizzes": len(scores)})
            if avg < 0.5:
                weak.append(name)
            elif avg >= 0.7:
                strong.append(name)

        recent_documents = []
        for d in docs[:10]:
            cnt = await ChunkRepository(self.session).count_by_document(d.id)
            recent_documents.append(
                {
                    "id": str(d.id),
                    "name": d.original_filename,
                    "status": d.processing_status.value
                    if hasattr(d.processing_status, "value")
                    else d.processing_status,
                    "chunk_count": cnt,
                    "created_at": d.created_at,
                }
            )

        recent_quizzes = [
            {
                "id": str(q.id),
                "title": q.title,
                "difficulty": q.difficulty.value if hasattr(q.difficulty, "value") else q.difficulty,
                "score": q.score,
                "created_at": q.created_at,
            }
            for q in quizzes[:10]
        ]

        return {
            "summary": {
                "documents_uploaded_count": analytics.documents_uploaded_count,
                "questions_asked_count": analytics.questions_asked_count,
                "quizzes_taken_count": analytics.quizzes_taken_count,
                "average_quiz_score": analytics.average_quiz_score,
                "total_study_minutes": analytics.total_study_minutes,
                "study_streak": study_streak,
                "today_study_minutes": today_minutes,
                "weekly_study_minutes": weekly_minutes,
                "daily_study_goal_minutes": goal,
            },
            "weekly_activity": {
                "by_day": weekly_by_day,
                "this_week_minutes": this_week_minutes,
                "last_week_minutes": last_week_minutes,
            },
            "metric_trends": {
                "documents": {"this_week": documents_tw, "last_week": documents_lw},
                "questions": {"this_week": questions_tw, "last_week": questions_lw},
                "quizzes": {"this_week": quizzes_tw, "last_week": quizzes_lw},
                "avg_score": {"this_week": score_tw, "last_week": score_lw},
            },
            "weak_topics": weak,
            "strong_topics": strong,
            "recent_documents": recent_documents,
            "recent_quizzes": recent_quizzes,
            "topic_performance": topic_performance,
        }

    async def get_usage(self, user_id: uuid.UUID, days: int = 30):
        """Aggregate LLM token/cost usage over the last ``days`` for a sparkline.

        Buckets by UTC day and returns totals plus a cache-hit rate (from the
        in-memory response cache counters and the persisted ``cached`` flag).
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)
        res = await self.session.execute(
            select(LLMUsageLog)
            .where(LLMUsageLog.user_id == user_id, LLMUsageLog.created_at >= since)
            .order_by(LLMUsageLog.created_at.asc())
        )
        logs = list(res.scalars().all())

        # Build a continuous per-day series so the sparkline has no gaps.
        today = datetime.now(timezone.utc).date()
        series: dict[str, dict] = {}
        for i in range(days - 1, -1, -1):
            d = (today - timedelta(days=i)).isoformat()
            series[d] = {
                "date": d,
                "requests": 0,
                "total_tokens": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "estimated_cost": 0.0,
                "cache_hits": 0,
            }

        total_requests = 0
        total_tokens = 0
        total_cost = 0.0
        cached_total = 0
        for log_row in logs:
            day_key = log_row.created_at.date().isoformat()
            bucket = series.get(day_key)
            if bucket is None:  # older than the window; still count in totals
                bucket = {
                    "date": day_key,
                    "requests": 0,
                    "total_tokens": 0,
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "estimated_cost": 0.0,
                    "cache_hits": 0,
                }
                series[day_key] = bucket
            bucket["requests"] += 1
            bucket["total_tokens"] += log_row.total_tokens
            bucket["prompt_tokens"] += log_row.prompt_tokens
            bucket["completion_tokens"] += log_row.completion_tokens
            bucket["estimated_cost"] += log_row.estimated_cost
            if log_row.cached:
                bucket["cache_hits"] += 1
                cached_total += 1
            total_requests += 1
            total_tokens += log_row.total_tokens
            total_cost += log_row.estimated_cost

        # Cache-hit rate: blend the persisted ``cached`` flags (per-request,
        # accurate historically) with the live in-memory counter rate.
        persisted_rate = (cached_total / total_requests) if total_requests else 0.0
        live_rate = resp_cache.hit_rate()
        cache_hit_rate = max(persisted_rate, live_rate)

        return {
            "requests": total_requests,
            "total_tokens": total_tokens,
            "total_cost": round(float(total_cost), 6),
            "cache_hit_rate": round(float(cache_hit_rate), 4),
            "per_day": list(series.values()),
        }


def _compute_streak(active_days: set[date]) -> int:
    """Count consecutive active days ending today (or yesterday if today is idle)."""
    if not active_days:
        return 0
    today = datetime.now(timezone.utc).date()
    cursor = today if today in active_days else today - timedelta(days=1)
    if cursor not in active_days:
        return 0
    streak = 0
    while cursor in active_days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak
