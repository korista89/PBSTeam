"""월별 Tier 정합성 점검(읽기 전용, 시트에 쓰지 않음).

CICO관리·CICO기록·리포트·대시보드·Tier3관리·SST관리·Tier현황이 달마다 같은 학생을 가리키는지,
이번 달 TierStatus 거울 차이, 중복·명단 밖 학생·재학 X·별칭 아닌 이름·Tier1 누락을 본다.
쓰는 곳: scripts/audit_tier_monthly.py(직접 실행).
"""
from collections import Counter
from typing import List

from app.adapters.sheets.client import open_main_sheet
from app.adapters.sheets.cico_store import open_store, school_year
from app.core.privacy import mask_name
from app.services import tier_monthly as tm, tier3_monthly as t3, sst
from app.services.sheets import (fetch_student_status, get_cico_report_data, get_monthly_cico_data,
                                 list_cico_targets)


def left_month(memo: str):
    """재학 X 학생이 학교를 떠난 달: 메모의 'M/D'(예: '11/27 자퇴'). 없으면 None(이번 달부터 점검).
    떠난 달까지는 그 달 대상이 맞으므로 문제로 세지 않는다."""
    import re
    m = re.search(r"(\d{1,2})\s*/\s*\d{1,2}", str(memo or ""))
    if m and 1 <= int(m.group(1)) <= 12:
        return int(m.group(1))
    return None


def _after_left(m: int, lm, cur: int) -> bool:
    return sst.month_index(m) > sst.month_index(lm) if lm else sst.month_index(m) >= sst.month_index(cur)


def run_audit(verbose: bool = False) -> List[str]:
    """문제 목록(빈 목록이면 정상). verbose면 월별 숫자도 출력."""
    sy, cur = school_year(), tm.current_month()
    roster = {str(s.get("학생코드", "")).strip(): s for s in fetch_student_status() if s.get("학생코드")}
    store = open_store(open_main_sheet())
    problems = []

    def bad(area, msg):
        problems.append(f"[{area}] {msg}")

    def _say(*a):
        if verbose:
            print(*a)

    months = [m for m in sst.SCHOOL_MONTHS if sst.month_index(m) <= sst.month_index(cur)]
    _say("학년도", sy, "이번 달", cur, "점검 월", months)
    for m in months:
        st = tm.month_state(m)
        line = [f"{m:>2}월", f"CICO {len(st['cico'])}", f"SST {len(st['sst'])}", f"T3 {sum(v=='Tier3' for v in st['t3'].values())}", f"T3+ {sum(v=='Tier3+' for v in st['t3'].values())}", f"준비 {st['ready']}"]
        _say(" · ".join(line))
        # 1) CICO: 관리탭 목록 = 기록탭 그리드 = 리포트 = Tier현황
        if 3 <= m <= 12 and st["ready"]["cico"]:
            tg = list_cico_targets(m)
            act = {t["code"] for t in tg["targets"] if t["active"]}
            grid = get_monthly_cico_data(m).get("students", [])
            rep = get_cico_report_data(m).get("students", [])
            if act != st["cico"]: bad(f"{m}월 CICO", f"관리탭≠Tier현황 {sorted(act ^ st['cico'])}")
            if {g["학생코드"] for g in grid} != act: bad(f"{m}월 CICO", f"기록탭≠관리탭 {sorted({g['학생코드'] for g in grid} ^ act)}")
            if {r["code"] for r in rep} != act: bad(f"{m}월 CICO", f"리포트≠관리탭 {sorted({r['code'] for r in rep} ^ act)}")
            gm = {g["row"]: g["학생코드"] for g in grid}
            mism = [r["row"] for r in rep if gm.get(r["row"]) != r["code"]]
            if mism: bad(f"{m}월 CICO", f"리포트·기록탭 행 번호 어긋남 {mism}")
            hist = set(tg["history"].get(str(m), []))
            if hist != act: bad(f"{m}월 CICO", f"대시보드 history≠관리탭 {sorted(hist ^ act)}")
            # 리포트 병행 판정이 그 달 표 기준인지
            for r in rep:
                if st["ready"]["sst"] and r["has_sst"] != (r["code"] in st["sst"]): bad(f"{m}월 CICO판정", f"{r['code']} SST 병행 불일치")
                if st["ready"]["t3"] and r["has_t3"] != (r["code"] in st["t3"]): bad(f"{m}월 CICO판정", f"{r['code']} Tier3 병행 불일치")
                if st["ready"]["t3"] and r["has_t3plus"] != (st["t3"].get(r["code"]) == "Tier3+"): bad(f"{m}월 CICO판정", f"{r['code']} Tier3+ 불일치")
            # 목표 순번 중복
            rows = store.month_rows(sy, m)
            dup = [k for k, n in Counter((r.get("학생코드"), r.get("목표") or "1") for r in rows).items() if n > 1]
            if dup: bad(f"{m}월 CICO", f"같은 학생·같은 목표 번호 중복 {dup}")
        # 2) Tier3: 관리탭 overview = Tier현황
        o3 = t3.overview(m)
        a3 = {r["code"]: r["level"] for r in o3["rows"] if not r["excluded"]}
        if a3 != st["t3"]: bad(f"{m}월 Tier3", f"Tier3관리≠Tier현황 {set(a3.items()) ^ set(st['t3'].items())}")
        dup3 = [c for c, n in Counter(r["학생코드"] for r in t3.month_rows(sy, m)).items() if n > 1]
        if dup3: bad(f"{m}월 Tier3", f"명단 중복 {dup3}")
        bad_lv = [r["학생코드"] for r in t3.month_rows(sy, m) if r.get("단계") not in t3.LEVELS]
        if bad_lv: bad(f"{m}월 Tier3", f"단계 값 이상 {bad_lv}")
        # 3) Tier현황 overview = month_state
        ov = tm.overview(m)
        if {s["학생코드"] for s in ov["students"] if s["cico"]} != st["cico"]: bad(f"{m}월 Tier현황", "CICO 열 불일치")
        if {s["학생코드"]: s["t3"] for s in ov["students"] if s["t3"]} != st["t3"]: bad(f"{m}월 Tier현황", "Tier3 열 불일치")
        # 4) 명단에 없거나 재학 아닌 학생
        for area, codes in (("CICO", st["cico"]), ("SST", set(st["sst"])), ("Tier3", set(st["t3"]))):
            unknown = sorted(c for c in codes if c not in roster)
            left = sorted(c for c in codes if c in roster and str(roster[c].get("재학여부", "O")).strip() == "X"
                          and _after_left(m, left_month(roster[c].get("메모", "")), cur))
            if unknown: bad(f"{m}월 {area}", f"Tier현황에 없는 학생코드 {unknown}")
            if left: bad(f"{m}월 {area}", f"재학 X 학생이 대상 {left}")

    # 5) SST 프로그램
    progs = sst.list_programs(sy)
    _say("SST 프로그램", [(p["name"], f"{p['start']}~{p['end']}월", len(p["targets"])) for p in progs])
    if len(progs) > sst.MAX_PROGRAMS: bad("SST", "프로그램 6개 초과")
    for p in progs:
        if sst.month_index(p["start"]) > sst.month_index(p["end"]): bad("SST", f"{p['name']} 기간 역전")
        d = [c for c, n in Counter(p["targets"]).items() if n > 1]
        if d: bad("SST", f"{p['name']} 대상 중복 {d}")

    # 5-1) Tier3+ 개별 프로그램(20개 이하, 학생 1명, 명단에 있는 학생)·Tier1 프로그램 범위
    from app.services import tier3plus, tier1
    t3p = tier3plus.BOOK.list_programs(sy)
    if len(t3p) > tier3plus.MAX_PROGRAMS:
        bad("Tier3+", "프로그램 20개 초과")
    for p in t3p:
        if len(p["targets"]) != 1:
            bad("Tier3+", f"{p['name']} 대상이 1명이 아님")
        elif p["targets"][0] not in roster:
            bad("Tier3+", f"{p['name']} 학생코드 {p['targets'][0]}가 Tier현황에 없음")
    classes = {s.get("학급", "") for s in roster.values()}
    for p in tier1.list_programs(sy):
        if p["scope"] == "학급":
            missing = [c for c in p["scope_values"] if c not in classes]
            if missing:
                bad("Tier1", f"{p['name']} 없는 학급 {missing}")
    _say("Tier3+ 프로그램", len(t3p), "· Tier1 프로그램", len(tier1.list_programs(sy)))

    # 6) 이번 달 거울
    diff = tm.mirror_diff()
    _say("이번 달 TierStatus 거울 차이", len(diff))
    for d in diff: bad("거울", f"{d['code']} {d['col']} 시트 {d['from']} / 월별 {d['to']}")

    # 7) 개인정보: 월별 표 이름이 별칭인지
    for name, rows in (("CICO_설정", store.settings.rows()), ("Tier3_월별", t3._rows())):
        raw = sorted({r.get("학생명", "") for r in rows if r.get("학생명") and mask_name(r["학생명"]) != r["학생명"]})
        if raw: bad("개인정보", f"{name}에 별칭이 아닌 이름 {len(raw)}건")

    # 8) Tier1 칸
    t1x = [c for c, s in roster.items() if str(s.get("재학여부", "O")).strip() == "O" and str(s.get("Tier1", "")).strip() != "O"]
    if t1x: bad("Tier1", f"재학생인데 Tier1이 O가 아님 {t1x}")

    return problems
