"""Log_Main 입력 정리: 구글 폼으로 넣은 행과 사이트(PBST)로 넣은 행이 분석에서 같은 값으로 읽히게 한다.

원칙: 시트 원자료는 고치지 않는다. 읽는 쪽(map_log_row·분석)에서 한 번만 같은 기준으로 정리한다.
"""
import re
from typing import Dict, Iterable, List, Optional, Tuple


# ── 발생횟수 ─────────────────────────────────────────────────
def parse_occurrence_count(value, default: int = 1) -> int:
    """'5회' → 5, '10회, 자해 …' → 10, '13:47 ~ 14:40'(시간)·'지속시간동안 반복발생'·'기타(…)' → 기본값.
    예전에는 첫 숫자를 그대로 읽어 시간 범위 '13:47 ~ 14:40' 이 13회로 집계됐다."""
    s = str(value if value is not None else "").strip()
    if not s:
        return default
    m = re.search(r"(\d+)\s*회", s)
    if m:
        return int(m.group(1))
    if re.fullmatch(r"\d+", s):
        return int(s)
    return default


# ── 시간대 ───────────────────────────────────────────────────
_SLOT_SPLIT = re.compile(r",\s*(?=\d+구간)")
_SLOT_NO = re.compile(r"^\s*(\d+)구간")


def canonical_slots(value) -> str:
    """'2구간: 1교시, 1구간: 등교시간' → '1구간: 등교시간, 2구간: 1교시'. '/' 앞뒤 공백도 맞춘다.
    폼은 선택지 순서로, 사이트는 누른 순서로 저장해 같은 조합이 서로 다른 값으로 집계되던 것을 막는다.
    '구간' 형식이 아닌 자유 서술은 그대로 둔다."""
    s = str(value if value is not None else "").strip()
    if not s or "구간" not in s:
        return s
    parts = [re.sub(r"\s*/\s*", "/", p.strip()) for p in _SLOT_SPLIT.split(s) if p.strip()]
    if not all(_SLOT_NO.match(p) for p in parts):
        return s
    seen, uniq = set(), []
    for p in parts:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    uniq.sort(key=lambda p: int(_SLOT_NO.match(p).group(1)))
    return ", ".join(uniq)


# ── 학생 연결 ────────────────────────────────────────────────
LINK_BY_CODE = "코드"
LINK_BY_NAME = "이름"
LINK_BY_SUFFIX = "이름-코드"
LINK_AMBIGUOUS = "이름 겹침"
LINK_NONE = "명단에 없음"
LINK_BLANK = "이름·코드 없음"


def _key(name: str) -> str:
    return re.sub(r"\s+", "", str(name or ""))


class StudentIndex:
    """TierStatus 명단 → 기록 한 줄을 학생코드로 연결하는 규칙(폼 행은 이름만 있다).
    이름이 겹치면 첫 학생에게 붙이지 않고 '이름 겹침'으로 남긴다(조용한 오연결이 분석을 가장 크게 망친다)."""

    def __init__(self, roster: Iterable[dict]):
        self.codes: Dict[str, bool] = {}            # 코드 → 재학 여부
        self.by_name: Dict[str, List[str]] = {}     # 별칭 → 코드들
        for r in roster:
            code = str(r.get("학생코드", "")).strip()
            if not code:
                continue
            enrolled = str(r.get("재학여부", "O")).strip() in ("O", "o", "재학", "True", "true", "")
            self.codes[code] = enrolled
            name = _key(r.get("학생이름", ""))
            if name:
                self.by_name.setdefault(name, []).append(code)

    def resolve(self, name: str, code: str = "") -> Tuple[str, str]:
        code = str(code or "").strip()
        n = _key(name)
        if code:
            return code, LINK_BY_CODE
        if not n:
            return "", LINK_BLANK
        cands = self.by_name.get(n, [])
        enrolled = [c for c in cands if self.codes.get(c)]
        pool = enrolled or cands                  # 재학생 우선, 없으면 졸업·전출 학생(지난해 기록)
        if len(pool) == 1:
            return pool[0], LINK_BY_NAME
        if len(pool) > 1:                         # 동명이인은 별칭 뒤 코드가 같아 접미사로 구분할 수 없다
            return "", LINK_AMBIGUOUS
        m = re.search(r"-(\d{4})$", n)            # 명단에 없는 '별칭-코드' 표기는 코드로 연결
        if m and m.group(1) in self.codes:
            return m.group(1), LINK_BY_SUFFIX
        return "", LINK_NONE


# ── 자체 점검: python -m app.services.log_normalize ──
if __name__ == "__main__":
    assert parse_occurrence_count("5회") == 5
    assert parse_occurrence_count("10회, 자해 행동 뿐만 아니라 30~35분동안") == 10
    assert parse_occurrence_count("13:47 ~ 14:40") == 1
    assert parse_occurrence_count("지속시간동안 반복발생") == 1
    assert parse_occurrence_count("기타(특기사항에 작성해야 함)") == 1
    assert parse_occurrence_count("") == 1 and parse_occurrence_count(None) == 1
    assert canonical_slots("2구간: 1교시, 1구간: 등교시간") == "1구간: 등교시간, 2구간: 1교시"
    assert canonical_slots("5구간: 초등점심 / 중등4교시") == "5구간: 초등점심/중등4교시"
    assert canonical_slots("1교시: 교실 / 4교시: 교실") == "1교시: 교실 / 4교시: 교실"
    assert canonical_slots("4구간: 3교시, 4구간: 3교시") == "4구간: 3교시"
    idx = StudentIndex([
        {"학생코드": "2513", "학생이름": "이O준-2513", "재학여부": "O"}, {"학생코드": "5113", "학생이름": "이O준-2513", "재학여부": "O"},
        {"학생코드": "1011", "학생이름": "김O준-1011", "재학여부": "O"}, {"학생코드": "3316", "학생이름": "김O민", "재학여부": "O"},
        {"학생코드": "9001", "학생이름": "박O수", "재학여부": "X"},
    ])
    assert idx.resolve("김O민") == ("3316", LINK_BY_NAME)
    assert idx.resolve("김O준-1011") == ("1011", LINK_BY_NAME)
    assert idx.resolve("이O준-2513") == ("", LINK_AMBIGUOUS)
    assert idx.resolve("박O수") == ("9001", LINK_BY_NAME)
    assert idx.resolve("없O름") == ("", LINK_NONE)
    assert idx.resolve("김O서-3316") == ("3316", LINK_BY_SUFFIX)
    assert idx.resolve("", "2513") == ("2513", LINK_BY_CODE)
    assert idx.resolve("") == ("", LINK_BLANK)
    print("log_normalize OK")
