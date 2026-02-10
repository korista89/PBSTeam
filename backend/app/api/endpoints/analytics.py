from fastapi import APIRouter
from app.services.analysis import get_analytics_data
from app.services.sheets import fetch_all_records, get_beable_code_mapping, get_tier3_report_data

router = APIRouter()

@router.get("/dashboard")
async def get_dashboard_summary(start_date: str = None, end_date: str = None):
    return get_analytics_data(start_date, end_date)

@router.get("/meeting")
async def get_meeting_analysis(target_date: str = None):
    from app.services.analysis import analyze_meeting_data
    return analyze_meeting_data(target_date)

@router.get("/tier3-report")
async def get_tier3_report(start_date: str = None, end_date: str = None):
    """Get Tier3 report data for decision making."""
    data = get_tier3_report_data(start_date, end_date)
    if "error" in data:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=data["error"])
    return data


@router.get("/debug")
async def debug_data():
    """Debug endpoint to check data flow"""
    raw_data = fetch_all_records()
    beable_mapping = get_beable_code_mapping()
    
    # Get columns
    columns = list(raw_data[0].keys()) if raw_data else []
    
    # Check 코드번호 values (all unique)
    all_code_values = list(set(str(r.get('코드번호', 'N/A')) for r in raw_data)) if raw_data else []
    
    # Check BeAble mapping keys (all)
    all_beable_keys = list(beable_mapping.keys()) if beable_mapping else []
    
    # Check intersection (matching codes)
    matching_codes = set(all_code_values) & set(all_beable_keys)
    
    # Count matched records
    matched_records = [r for r in raw_data if str(r.get('코드번호', '')) in all_beable_keys]
    
    # Check March records specifically
    march_records = [r for r in raw_data if str(r.get('행동발생 날짜', '')).startswith('2025-03')]
    march_codes = list(set(str(r.get('코드번호', '')) for r in march_records))
    march_matched = [c for c in march_codes if c in all_beable_keys]
    march_unmatched = [c for c in march_codes if c not in all_beable_keys]
    
    # March matched records count
    march_matched_records = [r for r in march_records if str(r.get('코드번호', '')) in all_beable_keys]
    
    return {
        "시트1_total_records": len(raw_data),
        "시트1_columns": columns,
        "시트1_unique_코드번호_count": len(all_code_values),
        "TierStatus_total_with_beable": len(beable_mapping),
        "matching_codes_count": len(matching_codes),
        "matched_records_count": len(matched_records),
        "march_총_records": len(march_records),
        "march_코드번호": march_codes,
        "march_TierStatus일치": march_matched,
        "march_TierStatus불일치": march_unmatched,
        "march_일치_records_count": len(march_matched_records)
    }
