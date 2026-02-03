from fastapi import APIRouter
from app.services.analysis import get_analytics_data
from app.services.sheets import fetch_all_records, get_beable_code_mapping

router = APIRouter()

@router.get("/dashboard")
async def get_dashboard_summary(start_date: str = None, end_date: str = None):
    return get_analytics_data(start_date, end_date)

@router.get("/meeting")
async def get_meeting_analysis(target_date: str = None):
    from app.services.analysis import analyze_meeting_data
    return analyze_meeting_data(target_date)

@router.get("/debug")
async def debug_data():
    """Debug endpoint to check data flow"""
    raw_data = fetch_all_records()
    beable_mapping = get_beable_code_mapping()
    
    # Get first 3 records and columns
    sample_records = raw_data[:3] if raw_data else []
    columns = list(raw_data[0].keys()) if raw_data else []
    
    # Check 코드번호 values
    code_values = [str(r.get('코드번호', 'N/A')) for r in raw_data[:5]] if raw_data else []
    
    # Check BeAble mapping keys
    beable_keys = list(beable_mapping.keys())[:5] if beable_mapping else []
    
    return {
        "시트1_total_records": len(raw_data),
        "시트1_columns": columns,
        "시트1_sample_코드번호": code_values,
        "TierStatus_BeAble_codes_sample": beable_keys,
        "TierStatus_total_with_beable": len(beable_mapping)
    }
