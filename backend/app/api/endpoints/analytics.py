from fastapi import APIRouter
from app.services.analysis import get_analytics_data

router = APIRouter()

@router.get("/dashboard")
async def get_dashboard_summary(start_date: str = None, end_date: str = None):
    return get_analytics_data(start_date, end_date)

@router.get("/meeting")
async def get_meeting_analysis(target_date: str = None):
    from app.services.analysis import analyze_meeting_data
    return analyze_meeting_data(target_date)
