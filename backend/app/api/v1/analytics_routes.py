"""Analytics dashboard route."""
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.schemas.analytics_schema import DashboardResponse, UsageResponse
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(
    current_user=Depends(get_current_user), session: AsyncSession = Depends(get_db)
):
    return await AnalyticsService(session).get_dashboard(current_user.id)


@router.get("/usage", response_model=UsageResponse)
async def usage(
    days: int = Query(30, ge=1, le=365, description="Trailing window in days"),
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """LLM token/cost usage over the trailing window, bucketed per day."""
    return await AnalyticsService(session).get_usage(current_user.id, days)


@router.get("/heatmap")
async def heatmap(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """Return daily activity counts for the past 371 days (53 full weeks).

    Each entry is ``{date: "YYYY-MM-DD", count: int}`` where count is the
    number of study-minutes recorded that day (intensity is scaled client-side).
    Days with zero activity are omitted to keep the payload compact.
    """
    return await AnalyticsService(session).get_heatmap(current_user.id)
