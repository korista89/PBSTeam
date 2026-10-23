"""위기행동 지원 및 개별학생교육지원 보고서 — 사이트 기록 → 보고서 항목 → 한글(hwpx) 양식 채우기.

양식은 학교에서 쓰는 최신 판(빈 양식, data/crisis_report_template.hwpx)을 그대로 쓰고 값만 칸 좌표로 넣는다.
화면 인쇄(PDF)와 한글 파일이 같은 report_fields() 결과를 쓰므로 두 결과물 내용이 항상 같다.
"""
import io
import os
from typing import Any, Dict, List, Tuple

from app.services import hwpx_lib as H

TEMPLATE = os.path.join(os.path.dirname(__file__), "..", "data", "crisis_report_template.hwpx")

# 보고 사유 체크박스(양식 안 순서): 제지 / 상해 / 수업 중 교실 내 / 수업 중 교실 밖 / 수업시간 외 특정장소
REASONS = ["방어 및 보호를 위한 제지", "본인/타인 상해 발생", "수업 중 교실 내 분리", "수업 중 교실 밖 분리", "수업시간 외 특정장소 분리"]
REASON_BOXES = ["CheckBox6", "CheckBox7", "CheckBox8", "CheckBox1", "CheckBox9"]
# 보고 사유는 1차_경위(사이트)·개별학생교육지원 경위(구글 폼) 첫머리에 [사유] 표시로 저장한다(Log_Main 열 구조를 바꾸지 않기 위해)
SUPPORT_TYPES = REASONS[2:]
FOLLOWUPS = [("부상자 치료", "부상자_치료"), ("관리자 보고", "관리자_보고"), ("학부모 알림", "학부모_알림"),
             ("학생 상담", "학생_상담"), ("학부모 상담", "학부모_상담"), ("긴급회의", "긴급회의")]


def _g(d: Dict[str, Any], *keys) -> str:
    for k in keys:
        v = str((d or {}).get(k, "") or "").strip()
        if v:
            return v
    return ""


def split_tags(text: str, allowed=REASONS) -> Tuple[List[str], str]:
    """'[제지][수업 중 교실 밖 분리] 경위…' → (['제지…', '수업 중 교실 밖 분리'], '경위…'). 앞머리의 허용된 [표시]만 떼어 낸다."""
    t, tags = str(text or "").strip(), []
    while True:
        hit = next((a for a in allowed if t.startswith(f"[{a}]")), None)
        if not hit:
            return tags, t
        tags.append(hit)
        t = t[len(hit) + 2:].lstrip()


def report_fields(rec: Dict[str, Any], class_name: str = "") -> Dict[str, Any]:
    """사이트 입력(1차_경위 앞머리에 [보고 사유], 시각별 줄)과 구글 폼 옛 기록([제지]·[개별학생교육지원]·[상해] 열)을 모두 같은 양식 칸으로."""
    cd = rec.get("crisis_details") or {}
    fr = rec.get("form_report_details") or {}
    action = str(rec.get("제지유형_원문") or "")
    tags, story1 = split_tags(_g(cd, "1차_경위"))
    stypes, support_story = split_tags(_g(fr, "개별학생교육지원_경위"), SUPPORT_TYPES)

    reasons = {r: r in tags or r in stypes for r in REASONS}
    reasons[REASONS[0]] |= "제지" in action or bool(_g(fr, "제지_경위", "제지_방법"))
    reasons[REASONS[1]] |= "상해" in action or bool(_g(fr, "상해_경위", "상해_대상자"))
    if "개별학생교육지원" in action and not any(reasons[s] for s in SUPPORT_TYPES):
        reasons[REASONS[3]] = True  # 유형 미기재 개별학생교육지원은 가장 흔한 '수업 중 교실 밖'으로 둔다

    story = "\n".join(x for x in [
        story1,
        _g(cd, "2차_경위") and f"[2차] {_g(cd, '2차_경위')}",
        _g(fr, "제지_경위") and f"[제지 경위] {_g(fr, '제지_경위')}",
        _g(fr, "제지_방법") and f"[제지 방법] {_g(fr, '제지_방법')}",
        support_story and f"[개별학생교육지원 경위] {support_story}",
        _g(fr, "상해_경위") and f"[상해 경위] {_g(fr, '상해_경위')}" + (f" (상해 입은 사람: {_g(fr, '상해_대상자')})" if _g(fr, "상해_대상자") else ""),
    ] if x)
    observe = "\n".join(x for x in [
        _g(cd, "1차_관찰기록"),
        _g(cd, "2차_관찰기록") and f"[2차] {_g(cd, '2차_관찰기록')}",
        _g(fr, "개별학생교육지원_내용_회복과정"),
        _g(fr, "제지_사후조치_특기사항", "개별학생교육지원_사후조치_특기사항", "상해_사후조치_특기사항"),
    ] if x)
    legal = " / ".join(x for x in [_g(fr, "제지_법적의무_확인"), _g(fr, "개별학생교육지원_법적의무_확인"), _g(fr, "상해_후속조치_확인")] if x)

    return {
        "기록번호": rec.get("Log_ID", ""),
        "소속": class_name or rec.get("학급", ""),
        "학생": f"{rec.get('학생명', '')}({rec.get('학생코드', '')})",
        "담임교사": "",
        "보고사유": reasons,
        "발생일시": f"{rec.get('행동발생날짜', '')} {rec.get('시간대', '')}".strip(),
        "발생장소": str(rec.get("장소", "")),
        "지도교사": _g(cd, "발생 시 지도교사"),
        "지원시간": _g(cd, "1차_개별학생교육지원_시간") or _g(fr, "개별학생교육지원_시간"),
        "지원장소": _g(cd, "1차_개별학생교육지원_장소") or _g(fr, "개별학생교육지원_장소_신규"),
        "지원교사": _g(cd, "1차_개별학생교육지원_교사") or _g(fr, "개별학생교육지원_교사"),
        "A": _g(cd, "A_배경_선행사건") or " · ".join(x for x in [rec.get("배경사건", ""), rec.get("선행사건", "")] if x),
        "B": _g(cd, "B_나타난_위기행동") or " · ".join(x for x in [rec.get("행동유형", ""), f"강도 {rec.get('강도', '')}", rec.get("특기사항", "")] if x),
        "C": _g(cd, "C_후속결과") or str(rec.get("후속결과", "")),
        "경위": story,
        "관찰기록": observe,
        "조치사항": [{"구분": label, "일시": _g(cd, f"{key}_시간"), "내용": _g(cd, f"{key}_내용")} for label, key in FOLLOWUPS],
        "법적의무확인": legal,
        "상태": rec.get("Status", ""),
    }


# 양식(빈 최신 판) 값 칸 좌표: (행, 열) — 표는 섹션0의 가장 큰 표
CELLS = {"소속": (1, 4), "학생": (1, 7), "담임교사": (1, 9), "발생일시": (3, 4), "발생장소": (3, 7), "지도교사": (3, 9),
         "지원시간": (4, 4), "지원장소": (4, 7), "지원교사": (4, 9), "A": (5, 4), "B": (6, 4), "C": (7, 4),
         "경위": (8, 4), "관찰기록": (9, 4)}


def build_hwpx(fields: Dict[str, Any] = None) -> bytes:
    """fields 가 없으면 빈 양식(기록번호 칸만 안내)을 돌려준다."""
    entries = H.read_hwpx(TEMPLATE)
    x = H._dec(H.sections(entries)[0]["data"])
    tables = H.table_map(x)
    ti = max(range(len(tables)), key=lambda i: len(tables[i]["cells"]))
    f = fields or {}
    for key, (r, c) in CELLS.items():
        if f.get(key):
            H.fill_cell(entries, 0, ti, r, c, f[key])
    for i, row in enumerate(f.get("조치사항", [])):
        if row.get("일시"):
            H.fill_cell(entries, 0, ti, 11 + i, 4, row["일시"])
        if row.get("내용"):
            H.fill_cell(entries, 0, ti, 11 + i, 5, row["내용"])
    for name, label in zip(REASON_BOXES, REASONS):
        H.set_checkbox(entries, name, bool((f.get("보고사유") or {}).get(label)))
    sign = "발생 시 지도교사:                (서명)      담임교사:                (서명)"
    H.fill_cell(entries, 0, ti, 17, 0, f"PBST 기록번호: {f['기록번호']}      {sign}" if f.get("기록번호") else sign)
    buf = io.BytesIO()
    order = sorted(entries, key=lambda e: 0 if e["name"] == "mimetype" else 1)
    import zipfile
    with zipfile.ZipFile(buf, "w") as z:
        for e in order:
            zi = zipfile.ZipInfo(e["name"])
            zi.compress_type = zipfile.ZIP_STORED if e["name"] == "mimetype" else (e["ctype"] or zipfile.ZIP_DEFLATED)
            z.writestr(zi, e["data"])
    return buf.getvalue()
