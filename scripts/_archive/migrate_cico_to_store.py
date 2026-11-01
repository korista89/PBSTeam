"""월별 CICO 탭(3월~)을 CICO_설정·CICO_기록·CICO_달력으로 옮긴다(2026-11-01 한 번 실행).
기본은 점검만, --apply 로 새 탭을 만든다. 새 탭에 이미 자료가 있으면 멈춘다. backend/에서 실행."""
import os, re, sys
sys.path.insert(0, os.getcwd())
import logging; logging.disable(50)
from app.adapters.sheets.client import open_main_sheet
from app.adapters.sheets.cico_store import SET_HEADERS, REC_HEADERS, CAL_HEADERS, SETTINGS_TAB, RECORDS_TAB, CALENDAR_TAB, full_date
from app.services.sheets import find_col_fuzzy

SY = 2026
SYN = {
    "번호": ["번호", "No", "연번"], "학급": ["학급", "Class", "반", "Grade"], "학생명": ["학생명", "Name", "이름", "학생"],
    "학생코드": ["학생코드", "Code", "코드", "ID", "StudentCode"], "Tier2": ["Tier2", "Tier2(CICO)", "대상자", "CICO", "대상", "T2"],
    "Tier3": ["Tier3", "T3", "BIP", "개별화"], "목표행동": ["목표행동", "TargetBehavior", "Behavior", "목표"],
    "목표행동 유형": ["목표행동유형", "목표행동 유형", "유형", "Type"], "척도": ["척도", "Scale", "점수기준"],
    "입력 기준(베이스라인)": ["입력기준", "입력 기준", "Criteria", "베이스라인", "Baseline"],
    "목표 달성 기준": ["목표달성기준", "목표 달성 기준", "Goal", "기준", "Criterion"],
    "수행/발생률": ["수행/발생률", "수행률", "발생률", "성취율", "Rate", "Performance"],
    "목표 달성 여부": ["목표달성여부", "목표 달성 여부", "달성여부", "성공여부", "Achieved", "Result"],
    "교사메모": ["교사메모", "Memo", "비고"], "입력자": ["입력자", "Writer", "Author"],
    "팀 협의 내용": ["팀협의내용", "협의내용", "TeamTalk", "협의"], "차월 대상여부": ["차월대상여부", "차월", "NextMonth", "next"],
}

ss = open_main_sheet()
titles = [w.title for w in ss.worksheets()]
settings, records, calendar = [], [], []
for m in range(3, 13):
    if f"{m}월" not in titles:
        continue
    vals = ss.worksheet(f"{m}월").get_all_values()
    hdr = vals[0]
    col = {k: find_col_fuzzy(hdr, v) for k, v in SYN.items()}
    # 예전 파서와 같게: Tier3 열이 없으면 비워 둔다(3월 탭)
    dates = [(i, h.strip()) for i, h in enumerate(hdr) if re.fullmatch(r"\d\d-\d\d", h.strip())]
    legacy = col["Tier3"] == -1  # 2026학년도 3월 탭 배치(학생코드·학생명 열 따로, 날짜 맨 뒤)
    calendar.append([str(SY), str(m), ",".join(d for _, d in dates), "구형" if legacy else ""])
    seen = {}
    for row in vals[1:]:
        if not any(str(x).strip() for x in row):
            continue
        g = lambda k: (row[col[k]] if col[k] != -1 and col[k] < len(row) else "")
        raw = g("학생명").strip()
        mm = re.search(r"\((.*?)\)", raw)
        code = g("학생코드").strip() if col["학생코드"] != -1 and "(코드)" not in hdr[col["학생코드"]] else ""
        code = code or (mm.group(1).strip() if mm else "")
        name = raw.replace(f"({mm.group(1)})", "").strip() if mm else raw
        rec = {h: "" for h in SET_HEADERS}
        rec.update({k: g(k) for k in SYN if k not in ("학생명", "학생코드")})
        seen[code] = goal = seen.get(code, 0) + 1
        rec.update({"학년도": str(SY), "월": str(m), "학생코드": code, "목표": str(goal), "학생명": name})
        settings.append([rec[h] for h in SET_HEADERS])
        for i, d in dates:
            v = row[i].strip() if i < len(row) else ""
            if v:
                records.append([str(SY), full_date(SY, d), code, str(goal), "", v, "", ""])
    print(f"{m}월: 학생 {sum(1 for s in settings if s[1] == str(m))}줄, 기록일 {len(dates)}")
print("설정", len(settings), "기록", len(records), "달력", len(calendar))
if "--apply" in sys.argv:
    for t in (SETTINGS_TAB, RECORDS_TAB, CALENDAR_TAB):
        if t in titles and len(ss.worksheet(t).get_all_values()) > 1 and "--replace" not in sys.argv:
            sys.exit(f"{t} 에 이미 자료가 있어 멈춤(덮어쓰려면 --replace)")
    for t, hdr, data in ((SETTINGS_TAB, SET_HEADERS, settings), (RECORDS_TAB, REC_HEADERS, records), (CALENDAR_TAB, CAL_HEADERS, calendar)):
        if t in titles:
            ss.del_worksheet(ss.worksheet(t))
        ws = ss.add_worksheet(title=t, rows=len(data) + 500, cols=len(hdr))
        ws.update(range_name="A1", values=[hdr] + data, value_input_option="RAW")
        print("작성", t, len(data))
