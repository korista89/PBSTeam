"""월별 Tier 정합성 점검(읽기 전용, 시트에 쓰지 않음).

실행: cd backend && PYTHONPATH=. .venv/bin/python ../scripts/audit_tier_monthly.py
CICO관리·CICO기록·리포트·대시보드·Tier3관리·SST관리·Tier현황이 달마다 같은 학생을 가리키는지,
이번 달 TierStatus 거울 차이, 중복·명단 밖 학생·재학 X·별칭 아닌 이름·Tier1 누락을 본다.
"""
from collections import Counter
from app.adapters.sheets.client import open_main_sheet
from app.adapters.sheets.cico_store import open_store, school_year
from app.core.privacy import mask_name
from app.services import tier_monthly as tm, tier3_monthly as t3, sst
from app.services.sheets import (fetch_student_status, get_cico_report_data, get_monthly_cico_data,
                                 list_cico_targets)

sy = school_year(); cur = tm.current_month()
roster = {str(s.get("학생코드", "")).strip(): s for s in fetch_student_status() if s.get("학생코드")}
store = open_store(open_main_sheet())
problems = []
def bad(area, msg): problems.append(f"[{area}] {msg}")

months = [m for m in sst.SCHOOL_MONTHS if sst.month_index(m) <= sst.month_index(cur)]
print("학년도", sy, "이번 달", cur, "점검 월", months)
for m in months:
    st = tm.month_state(m)
    line = [f"{m:>2}월", f"CICO {len(st['cico'])}", f"SST {len(st['sst'])}", f"T3 {sum(v=='Tier3' for v in st['t3'].values())}", f"T3+ {sum(v=='Tier3+' for v in st['t3'].values())}", f"준비 {st['ready']}"]
    print(" · ".join(line))
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
        left = sorted(c for c in codes if c in roster and str(roster[c].get("재학여부", "O")).strip() == "X")
        if unknown: bad(f"{m}월 {area}", f"Tier현황에 없는 학생코드 {unknown}")
        if left: bad(f"{m}월 {area}", f"재학 X 학생이 대상 {left}")

# 5) SST 프로그램
progs = sst.list_programs(sy)
print("SST 프로그램", [(p["name"], f"{p['start']}~{p['end']}월", len(p["targets"])) for p in progs])
if len(progs) > sst.MAX_PROGRAMS: bad("SST", "프로그램 6개 초과")
for p in progs:
    if sst.month_index(p["start"]) > sst.month_index(p["end"]): bad("SST", f"{p['name']} 기간 역전")
    d = [c for c, n in Counter(p["targets"]).items() if n > 1]
    if d: bad("SST", f"{p['name']} 대상 중복 {d}")

# 6) 이번 달 거울
diff = tm.mirror_diff()
print("이번 달 TierStatus 거울 차이", len(diff))
for d in diff: bad("거울", f"{d['code']} {d['col']} 시트 {d['from']} / 월별 {d['to']}")

# 7) 개인정보: 월별 표 이름이 별칭인지
for name, rows in (("CICO_설정", store.settings.rows()), ("Tier3_월별", t3._rows())):
    raw = sorted({r.get("학생명", "") for r in rows if r.get("학생명") and mask_name(r["학생명"]) != r["학생명"]})
    if raw: bad("개인정보", f"{name}에 별칭이 아닌 이름 {len(raw)}건")

# 8) Tier1 칸
t1x = [c for c, s in roster.items() if str(s.get("재학여부", "O")).strip() == "O" and str(s.get("Tier1", "")).strip() != "O"]
if t1x: bad("Tier1", f"재학생인데 Tier1이 O가 아님 {t1x}")

print("\n=== 문제", len(problems), "건 ===")
for p in problems: print(p)
