# backend/app/api/endpoints/ebp.py

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from app.domain.models import EBPStrategy, EBPCategory, FunctionCode, FunctionHypothesis
from app.services.ebp.catalog import load_ebp_catalog, get_ebp_by_code, search_ebp_catalog
from app.services.ebp.matching import generate_ebp_recommendation_bundle

router = APIRouter()

@router.get("/catalog")
async def get_catalog(
    category: Optional[str] = Query(None, description="Filter by EBP category"),
    function_code: Optional[str] = Query(None, description="Filter by function code"),
    query: Optional[str] = Query(None, description="Search keyword")
):
    """Retrieve canonical 39 경기 Be-Able EBP catalog"""
    cat_enum = None
    if category and category in EBPCategory.__members__:
        cat_enum = EBPCategory(category)

    fn_enum = None
    if function_code and function_code in FunctionCode.__members__:
        fn_enum = FunctionCode(function_code)

    results = search_ebp_catalog(query=query or "", category=cat_enum, function_code=fn_enum)
    return {
        "catalog_version": "2026.08-beable39-v1",
        "total": len(results),
        "strategies": results
    }


@router.get("/catalog/{code}")
async def get_strategy_detail(code: str):
    """Retrieve detailed implementation steps, guardrails, and pairings for a specific EBP code"""
    strategy = get_ebp_by_code(code)
    if not strategy:
        raise HTTPException(status_code=404, detail=f"EBP Strategy '{code}' not found.")
    return strategy


class EBPRecommendationRequest(BaseModel):
    function_code: Optional[str] = "UNKNOWN"
    antecedent_patterns: List[str] = []
    setting_events: List[str] = []
    current_tier: str = "TIER_1"
    selected_ebps: List[str] = []

@router.post("/recommend")
async def recommend_ebp_bundle(req: EBPRecommendationRequest):
    """Generate deterministic 39 Be-Able EBP candidate bundle with guardrails and pairings"""
    fn_enum = FunctionCode(req.function_code) if req.function_code in FunctionCode.__members__ else FunctionCode.UNKNOWN
    
    hypothesis = FunctionHypothesis(
        hypothesis_id="TEMP_HYP",
        student_code="TEMP",
        target_behavior="표적행동",
        function_code=fn_enum,
        confidence_level="MEDIUM" if fn_enum != FunctionCode.UNKNOWN else "LOW"
    )

    bundle = generate_ebp_recommendation_bundle(
        hypothesis=hypothesis,
        antecedent_patterns=req.antecedent_patterns,
        setting_events=req.setting_events,
        current_tier=req.current_tier,
        selected_ebps=req.selected_ebps
    )
    return bundle
