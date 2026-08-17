# backend/app/services/ebp/catalog.py

import json
import os
from typing import List, Dict, Optional, Any
from app.domain.models import EBPStrategy, EBPCategory, FunctionCode, WorkloadLevel

_CATALOG_CACHE: Optional[List[EBPStrategy]] = None
_CATALOG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "ebp_catalog.json")

def load_ebp_catalog() -> List[EBPStrategy]:
    global _CATALOG_CACHE
    if _CATALOG_CACHE is not None:
        return _CATALOG_CACHE

    if not os.path.exists(_CATALOG_PATH):
        raise FileNotFoundError(f"EBP Catalog JSON not found at: {_CATALOG_PATH}")

    with open(_CATALOG_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    strategies = []
    for raw in data.get("strategies", []):
        cat_enum = EBPCategory(raw["category"])
        fn_fits = [FunctionCode(f) for f in raw.get("function_fits", []) if f in FunctionCode.__members__]
        workload = WorkloadLevel(raw.get("workload", "MEDIUM"))

        strategy = EBPStrategy(
            id=raw["id"],
            code=raw["code"],
            name=raw["name"],
            category=cat_enum,
            summary=raw["summary"],
            when_to_use=raw["when_to_use"],
            function_fits=fn_fits,
            prerequisites=raw.get("prerequisites", []),
            implementation_steps=raw.get("implementation_steps", []),
            guardrails=raw.get("guardrails", []),
            recommended_pairings=raw.get("recommended_pairings", []),
            outcome_measures=raw.get("outcome_measures", []),
            fidelity_items=raw.get("fidelity_items", []),
            workload=workload
        )
        strategies.append(strategy)

    _CATALOG_CACHE = strategies
    return strategies


def get_ebp_by_code(code: str) -> Optional[EBPStrategy]:
    catalog = load_ebp_catalog()
    clean_code = code.strip().upper()
    for s in catalog:
        if s.code.upper() == clean_code:
            return s
    return None


def search_ebp_catalog(
    query: str = "",
    category: Optional[EBPCategory] = None,
    function_code: Optional[FunctionCode] = None
) -> List[EBPStrategy]:
    catalog = load_ebp_catalog()
    results = catalog

    if category:
        results = [s for s in results if s.category == category]

    if function_code:
        results = [s for s in results if function_code in s.function_fits or not s.function_fits]

    if query:
        q = query.strip().lower()
        results = [
            s for s in results
            if q in s.name.lower() or q in s.code.lower() or q in s.summary.lower() or q in s.when_to_use.lower()
        ]

    return results
