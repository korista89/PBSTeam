"""학생 이름 가림(별칭) 규칙.

시트와 화면에는 실명 대신 별칭만 저장·표시한다.
  김민준 → 김O준 / 이서 → 이O / 홍길동A → 홍O동A
별칭 규칙은 프런트 utils.ts 의 maskName 과 동일해야 한다(멱등: 별칭에 다시 적용해도 그대로).
같은 가림 표기를 쓰는 서로 다른 학생은 `-학생코드`를 붙여 구분한다(김O준-1011).
"""
import re
from typing import Dict, Iterable, Optional


def mask_name(name: Optional[str]) -> str:
    n = str(name or "").strip()
    if len(n) == 2:
        return n[0] + "O"
    if len(n) >= 3:
        return n[0] + "O" + n[2:]
    return n


def alias_for(name: str, code: str = "", taken: Optional[Dict[str, str]] = None) -> str:
    """신규 입력 이름의 별칭. taken = {별칭: 학생코드} 로 이미 쓰는 별칭이면 코드를 붙인다."""
    a = mask_name(name)
    if taken and a in taken and str(taken[a]) != str(code):
        return f"{a}-{code}" if code else a
    return a


def build_alias_map(name_to_codes: Dict[str, Iterable[str]]) -> Dict[str, str]:
    """{실명: [학생코드...]} → {실명: 별칭}. 가림 표기가 겹치는 서로 다른 이름만 코드 접미사를 붙인다.
    같은 이름(동명이인)은 기존처럼 같은 별칭을 공유한다."""
    groups: Dict[str, list] = {}
    for n in name_to_codes:
        groups.setdefault(mask_name(n), []).append(n)
    out: Dict[str, str] = {}
    for m, names in groups.items():
        if len(names) == 1:
            out[names[0]] = m
            continue
        for i, n in enumerate(sorted(names)):
            codes = sorted(str(c) for c in name_to_codes[n] if str(c))
            out[n] = f"{m}-{codes[0]}" if codes else f"{m}-x{i + 1}"
    return out


# 2글자 이름 뒤에 올 수 있는 것: 한글이 아닌 문자/끝, '학생', 또는 단독 조사
_AFTER_SHORT = r"(?=학생|(?:이|가|은|는|을|를|의|도|와|과|에게|한테)(?![가-힣])|[^가-힣]|$)"


def anonymize_text(text: str, alias_map: Dict[str, str]) -> str:
    """자유서술 안의 실명을 별칭으로 치환. 3글자 이상은 그대로, 2글자는 단어 일부를 건드리지 않게 경계·조사를 확인한다."""
    if not text or not alias_map:
        return text
    names = sorted(alias_map, key=len, reverse=True)
    long_ = [re.escape(n) for n in names if len(n) >= 3]
    short = [re.escape(n) for n in names if len(n) == 2]
    parts = []
    if long_:
        parts.append("(?:" + "|".join(long_) + ")")
    if short:
        parts.append("(?<![가-힣])(?:" + "|".join(short) + ")" + _AFTER_SHORT)
    if not parts:
        return text
    return re.compile("|".join(parts)).sub(lambda m: alias_map[m.group()], text)
