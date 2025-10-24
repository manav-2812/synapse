"""Pydantic schemas for the analytics dashboard."""
from datetime import datetime

from pydantic import BaseModel


class AnalyticsSummary(BaseModel):
    documents_uploaded_count: int = 0
    questions_asked_count: int = 0
    quizzes_taken_count: int = 0
    average_quiz_score: float = 0.0
    total_study_minutes: int = 0
    study_streak: int = 0
    today_study_minutes: int = 0
    weekly_study_minutes: int = 0
    daily_study_goal_minutes: int = 0


class DocumentItem(BaseModel):
    id: str
    name: str
    status: str
    chunk_count: int = 0
    created_at: datetime


class QuizItem(BaseModel):
    id: str
    title: str
    difficulty: str
    score: float | None = None
    created_at: datetime


class TopicPerformance(BaseModel):
    topic: str
    score: float
    quizzes: int


class DayMinutes(BaseModel):
    """One bar of the weekly chart: a calendar day and its studied minutes."""
    date: str
    weekday: str
    minutes: int = 0


class WeeklyActivity(BaseModel):
    """Mon..Sun of the current calendar week plus the week-over-week totals."""
    by_day: list[DayMinutes] = []
    this_week_minutes: int = 0
    last_week_minutes: int = 0


class MetricTrend(BaseModel):
    """A metric's value this calendar week vs the previous one (None = no data).

    Floats (not ints) because avg_quiz_score carries fractions (0–1) while the
    count metrics happen to be whole numbers.
    """
    this_week: float | None = None
    last_week: float | None = None


class MetricTrends(BaseModel):
    documents: MetricTrend = MetricTrend()
    questions: MetricTrend = MetricTrend()
    quizzes: MetricTrend = MetricTrend()
    # avg_score carries percentage points (0–100) when a week has scored quizzes.
    avg_score: MetricTrend = MetricTrend()


class DashboardResponse(BaseModel):
    summary: AnalyticsSummary
    weekly_activity: WeeklyActivity = WeeklyActivity()
    metric_trends: MetricTrends = MetricTrends()
    weak_topics: list[str] = []
    strong_topics: list[str] = []
    recent_documents: list[DocumentItem] = []
    recent_quizzes: list[QuizItem] = []
    topic_performance: list[TopicPerformance] = []


class UsageDay(BaseModel):
    date: str
    requests: int = 0
    total_tokens: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    estimated_cost: float = 0.0
    cache_hits: int = 0


class UsageResponse(BaseModel):
    requests: int = 0
    total_tokens: int = 0
    total_cost: float = 0.0
    cache_hit_rate: float = 0.0
    per_day: list[UsageDay] = []
