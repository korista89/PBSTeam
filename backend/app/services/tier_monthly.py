"""월별 Tier 현황: 관리 탭들의 월별 표를 한데 모으고, 이번 달 값을 TierStatus에 비춘다.

단계별 '그 달' 출처(하나뿐):
- Tier2(CICO): CICO_설정의 그 달 줄(Tier2=O인 줄이 하나라도 있으면 대상)
- Tier2(SST):  그 달에 운영 중인 SST 프로그램의 대상 학생
- Tier3/Tier3+: Tier3_월별의 그 달 명단(제외 줄 빼고)
Tier1·이름·재학·BeAble·메모는 월별이 아니라 TierStatus 그대로다.

TierStatus의 Tier2(CICO)·Tier2(SST)·Tier3·Tier3+ 칸은 '이번 달'의 거울이다. 사이트의 다른 화면(대시보드 인원,
CICO 병행 판정, 브리핑 등)은 계속 TierStatus를 읽으므로, 이번 달 월별 표가 바뀌면 바뀐 학생만 거울에 반영한다.
안전장치: 그 달 표가 아직 없으면(CICO 달 미작성, Tier3 명단 0명, SST 프로그램 0개) 그 단계는 거울에 쓰지 않는다.
"""

import logging
from typing import Any, Dict, Iterable, List, Optional

from app.adapters.sheets.client import open_main_sheet
from app.adapters.sheets.cico_store import open_store, school_year
from app.core.time import now_kst
from app.services import sst as sst_svc
from app.services import tier3_monthly as t3

logger = logging.getLogger(__name__)

MIRROR_COLS = {"Tier2(CICO)": "I", "Tier2(SST)": "J", "Tier3": "K", "Tier3+": "L"}  # update_student_tier와 같은 배치
CHANGED_COL = "M"


def current_month() -> int:
    return now_kst().month


def month_state(month: int) -> Dict[str, Any]:
    """그 달 학생별 단계와 각 단계 표가 준비됐는지."""
    sy = school_year()
    cico_rows = open_store(open_main_sheet()).month_rows(sy, month) if 3 <= month <= 12 else []
    cico = {r.get("학생코드") for r in cico_rows if str(r.get("Tier2", "")).strip().upper() == "O"}
    programs = sst_svc.list_programs(sy)
    sst: Dict[str, List[str]] = {}
    for p in programs:
        if sst_svc.runs_in(p, month):
            for c in p["targets"]:
                sst.setdefault(c, []).append(p["name"])
    t3_rows = t3.month_rows(sy, month)
    return {
        "cico": cico,
        "sst": sst,
        "t3": {r["학생코드"]: r.get("단계", "Tier3") for r in t3_rows},
        "ready": {"cico": bool(cico_rows), "sst": bool(programs), "t3": bool(t3_rows)},
    }


def desired_tiers(state: Dict[str, Any], code: str) -> Dict[str, str]:
    """거울에 쓸 값(준비된 단계만). Tier3+는 Tier3 칸도 O(기존 관례)."""
    out: Dict[str, str] = {}
    if state["ready"]["cico"]:
        out["Tier2(CICO)"] = "O" if code in state["cico"] else "X"
    if state["ready"]["sst"]:
        out["Tier2(SST)"] = "O" if code in state["sst"] else "X"
    if state["ready"]["t3"]:
        level = state["t3"].get(code, "")
        out["Tier3"] = "O" if level else "X"
        out["Tier3+"] = "O" if level == "Tier3+" else "X"
    return out


def _status_ws_and_rows():
    from app.services.sheets import get_student_status_worksheet
    from app.adapters.sheets.client import safe_get_all_records
    ws = get_student_status_worksheet()
    if not ws:
        raise RuntimeError("TierStatus 시트에 연결할 수 없습니다.")
    return ws, safe_get_all_records(ws)


def mirror_diff(month: Optional[int] = None, codes: Optional[Iterable[str]] = None,
                cols: Optional[Iterable[str]] = None) -> List[Dict[str, Any]]:
    """TierStatus(지금)와 이번 달 월별 표가 다른 칸 목록. codes·cols를 주면 그 학생·그 칸만 본다."""
    month = month or current_month()
    state = month_state(month)
    _, records = _status_ws_and_rows()
    wanted = set(str(c) for c in codes) if codes is not None else None
    only = set(cols) if cols is not None else None
    out = []
    for idx, r in enumerate(records):
        code = str(r.get("학생코드", "")).strip()
        if not code or (wanted is not None and code not in wanted):
            continue
        for col, val in desired_tiers(state, code).items():
            if only is not None and col not in only:
                continue
            cur = "O" if str(r.get(col, "")).strip().upper() == "O" else "X"
            if cur != val:
                out.append({"code": code, "name": r.get("학생이름", ""), "class": r.get("학급", ""),
                            "row": idx + 2, "col": col, "from": cur, "to": val})
    return out


def apply_mirror(month: Optional[int] = None, codes: Optional[Iterable[str]] = None,
                 cols: Optional[Iterable[str]] = None) -> Dict[str, Any]:
    """다른 칸만 TierStatus에 한 번에 쓴다(변경일 함께). 이번 달이 아니면 아무것도 하지 않는다."""
    from app.services.sheets import clear_cache
    from app.adapters.sheets.client import invalidate_cache
    month = month or current_month()
    if month != current_month():
        return {"changed": 0}
    diff = mirror_diff(month, codes, cols)
    if not diff:
        return {"changed": 0}
    ws, _ = _status_ws_and_rows()
    today = now_kst().replace(tzinfo=None).strftime("%Y-%m-%d")
    updates = [{"range": f"{MIRROR_COLS[d['col']]}{d['row']}", "values": [[d["to"]]]} for d in diff]
    updates += [{"range": f"{CHANGED_COL}{r}", "values": [[today]]} for r in sorted({d["row"] for d in diff})]
    ws.batch_update(updates)
    clear_cache("tierstatus")
    invalidate_cache("sheet:cico:report")  # CICO 판정의 SST·Tier3 병행 여부
    return {"changed": len(diff), "students": len({d["code"] for d in diff})}


CICO_COLS = ["Tier2(CICO)"]
SST_COLS = ["Tier2(SST)"]
T3_COLS = ["Tier3", "Tier3+"]


def mirror_after_change(month: int, codes: Optional[Iterable[str]], cols: Iterable[str]) -> Dict[str, Any]:
    """관리 탭에서 이번 달 표를 바꾼 뒤 부른다. 그 탭이 맡은 칸(cols)만, 바뀐 학생(codes)만.
    codes=None(전교생)은 Tier현황의 '모두 반영'처럼 사람이 차이를 보고 누를 때만 쓴다. 실패해도 원래 저장은 유지한다."""
    try:
        return apply_mirror(month, None if codes is None else list(codes), list(cols))
    except Exception as e:
        logger.warning("TierStatus 거울 반영 실패", exc_info=True)
        return {"error": str(e)}


# ── Tier현황 탭: 월별 보기·고치기 ─────────────────────────
def overview(month: int) -> Dict[str, Any]:
    from app.services.sheets import fetch_student_status
    state = month_state(month)
    pm = t3.prev_month(month)
    prev_state = month_state(pm) if pm else None
    students = []
    for s in fetch_student_status() or []:
        code = str(s.get("학생코드", "")).strip()
        if not code:
            continue
        students.append({
            **{k: s.get(k, "") for k in ("번호", "학급", "학생코드", "학생이름", "재학여부", "BeAble코드", "그림말인증", "Tier1", "변경일", "메모")},
            "cico": code in state["cico"],
            "sst": state["sst"].get(code, []),
            "t3": state["t3"].get(code, ""),
            "prev": None if not prev_state else {
                "cico": code in prev_state["cico"], "sst": bool(prev_state["sst"].get(code)), "t3": prev_state["t3"].get(code, ""),
            },
            # 이 달 표가 아직 없을 때 보여 줄 Tier현황(지금) 값
            "now": {"cico": str(s.get("Tier2(CICO)", "")).strip().upper() == "O",
                    "sst": str(s.get("Tier2(SST)", "")).strip().upper() == "O",
                    "t3": t3.tierstatus_level(s)},
        })
    return {
        "month": month,
        "prev_month": pm,
        "is_current": month == current_month(),
        "ready": state["ready"],
        "prev_ready": prev_state["ready"] if prev_state else None,
        "sst_programs": len(sst_svc.list_programs()),
        "students": students,
    }


def set_student(month: int, code: str, cico: Optional[bool] = None, t3_level: Optional[str] = None) -> Dict[str, Any]:
    """Tier현황 탭에서 한 학생의 그 달 CICO·Tier3를 바꾼다. 실제 저장은 각 관리 탭의 월별 표에 한다."""
    from app.services.sheets import add_cico_target, set_cico_target_active
    sy = school_year()
    done = []
    if cico is not None:
        if not 3 <= month <= 12:
            return {"error": "CICO는 3~12월만 운영합니다."}
        rows = [r for r in open_store(open_main_sheet()).month_rows(sy, month) if r.get("학생코드") == code]
        active = [r for r in rows if str(r.get("Tier2", "")).strip().upper() == "O"]
        if cico and not active:
            if rows:  # 이 달에 해제한 줄이 있으면 되살린다(목표 설정 유지)
                for r in rows:
                    set_cico_target_active(month, r["_row"], True)
            else:
                res = add_cico_target(sst_svc.calendar_year(sy, month), month, code)
                if "error" in res:
                    return res
            done.append("CICO 대상")
        elif not cico and active:
            for r in active:
                set_cico_target_active(month, r["_row"], False)
            done.append("CICO 해제")
    if t3_level is not None:
        if t3_level not in ("", "Tier3", "Tier3+"):
            return {"error": "단계는 없음·Tier3·Tier3+ 중 하나입니다."}
        row = next((r for r in t3.month_rows(sy, month, include_excluded=True) if r["학생코드"] == code), None)
        on = row is not None and row.get("상태") != "제외"
        if t3_level and not on:
            res = t3.add_student(month, code, t3_level)
            if "error" in res:
                return res
            done.append(t3_level)
        elif t3_level and on and row.get("단계") != t3_level:
            t3.update_row(month, row["_row"], level=t3_level)
            done.append(t3_level)
        elif not t3_level and on:
            t3.update_row(month, row["_row"], excluded=True)
            done.append("Tier3 해제")
    mirror = mirror_after_change(month, [code], CICO_COLS + T3_COLS)
    return {"message": ("저장했습니다: " + ", ".join(done)) if done else "바뀐 것이 없습니다.", "mirror": mirror}


def start_month(month: int) -> Dict[str, Any]:
    """그 달 표가 없는 단계를 지난달 그대로 시작한다(CICO 목표 설정 포함, Tier3 단계·메모 포함)."""
    from app.services.sheets import copy_prev_month_targets
    state = month_state(month)
    msgs, mirror = [], {}
    if 3 <= month <= 12 and not state["ready"]["cico"]:
        res = copy_prev_month_targets(sst_svc.calendar_year(school_year(), month), month)
        msgs.append("CICO: " + (res.get("error") or res.get("message", "")))
        mirror["cico"] = mirror_after_change(month, res.get("codes", []), CICO_COLS)
    if not state["ready"]["t3"]:
        res = t3.copy_prev(month)
        msgs.append("Tier3: " + (res.get("error") or res.get("message", "")))
        mirror["t3"] = mirror_after_change(month, res.get("codes", []), T3_COLS)
    return {"message": " / ".join(msgs) if msgs else "이미 이 달 표가 모두 있습니다.", "mirror": mirror}

