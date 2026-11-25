"""국외 AI로 나가는 내용의 비식별 처리.

1) pseudonymize/restore: 모든 AI 호출(_call_llm)에서 학생 별칭(김O준)·학생코드·BeAble코드를
   '학생A' 같은 임시 표기로 바꿔 보내고, 받은 답에서 다시 원래 표기로 되돌린다(화면은 그대로).
2) sanitize_chart_payload/assert_aggregate_only: 차트 해석 버튼은 집계 수치만 보낸다.
   자유서술·식별 필드는 서버에서 지우고, 그래도 남으면 요청을 막는다.
"""
import re
from typing import Any, Dict, Iterable, Tuple


class PIIBlocked(ValueError):
    """AI로 보내면 안 되는 필드가 남아 있다."""


# 식별 필드: 값 자체를 임시 표기로 바꾼다
ID_KEYS = {"student_name", "studentname", "학생명", "학생이름", "이름", "student_code", "studentcode",
           "code", "학생코드", "학번", "beable코드", "beable_code", "student"}
# 자유서술 필드: 차트 해석에는 필요 없으니 지운다
TEXT_KEYS = {"memo", "note", "notes", "content", "description", "comment", "comments", "remark", "remarks",
             "메모", "비고", "특기사항", "내용", "상세", "관찰내용", "detail", "details", "text"}
MAX_LABEL = 40  # 차트 범주 라벨 길이 상한. 이보다 긴 문자열은 서술로 본다.


def _norm_key(k: Any) -> str:
    return str(k).strip().lower()


def _roster() -> Tuple[set, set]:
    """(별칭들, 코드들). 시트를 못 읽으면 빈 값(호출은 막지 않는다)."""
    try:
        from app.services.sheets import fetch_student_status
        rows = fetch_student_status()
    except Exception:
        return set(), set()
    names, codes = set(), set()
    for r in rows:
        n = str(r.get("학생이름") or r.get("학생명") or "").strip()
        if len(n) >= 2:
            names.add(n)
            names.add(n.split("-")[0])
        for k in ("학생코드", "BeAble코드"):
            c = str(r.get(k) or "").strip()
            if len(c) >= 4:
                codes.add(c)
    return names, codes


def _token(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return "학생" + s


def pseudonymize(texts: Iterable[str], names: set = None, codes: set = None) -> Tuple[list, Dict[str, str]]:
    """여러 글에 같은 규칙을 적용해 [바뀐 글], {임시표기: 원래표기}를 돌려준다."""
    if names is None or codes is None:
        names, codes = _roster()
    texts = [t or "" for t in texts]
    alts = [re.escape(n) for n in sorted(names, key=len, reverse=True)]
    alts += [r"(?<![0-9A-Za-z])" + re.escape(c) + r"(?![0-9A-Za-z])" for c in sorted(codes, key=len, reverse=True)]
    if not alts:
        return texts, {}
    pat = re.compile("|".join(alts))
    seen: Dict[str, str] = {}

    def sub(m):
        v = m.group()
        if v not in seen:
            seen[v] = _token(len(seen))
        return seen[v]
    out = [pat.sub(sub, t) for t in texts]
    return out, {tok: orig for orig, tok in seen.items()}


def restore(text: str, mapping: Dict[str, str]) -> str:
    if not text or not mapping:
        return text
    pat = re.compile("|".join(re.escape(t) for t in sorted(mapping, key=len, reverse=True)) + r"(?![A-Z])")
    return pat.sub(lambda m: mapping[m.group()], text)


def sanitize_chart_payload(obj: Any) -> Any:
    """차트 해석용 자료에서 자유서술 필드와 긴 문자열을 지운다. 식별 필드 값은 그대로 두고
    _call_llm의 pseudonymize가 임시 표기로 바꾼다(답을 되돌려야 하므로 여기서 지우지 않는다)."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            nk = _norm_key(k)
            if nk in TEXT_KEYS or nk.startswith("raw_"):
                continue
            v = sanitize_chart_payload(v)
            if v is _DROP:
                continue
            out[k] = v
        return out
    if isinstance(obj, (list, tuple)):
        return [x for x in (sanitize_chart_payload(v) for v in obj) if x is not _DROP]
    if isinstance(obj, str) and len(obj) > MAX_LABEL:
        return _DROP
    return obj


_DROP = object()


def assert_aggregate_only(obj: Any, path: str = "") -> None:
    """화이트리스트 검사: 숫자·참거짓·빈값·짧은 라벨만 허용. 서술 필드나 긴 글이 있으면 PIIBlocked."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            nk = _norm_key(k)
            if nk in TEXT_KEYS or nk.startswith("raw_"):
                raise PIIBlocked(f"서술 필드 '{path}{k}'는 AI로 보낼 수 없습니다.")
            assert_aggregate_only(v, f"{path}{k}.")
    elif isinstance(obj, (list, tuple)):
        for i, v in enumerate(obj):
            assert_aggregate_only(v, f"{path}{i}.")
    elif isinstance(obj, str):
        if len(obj) > MAX_LABEL:
            raise PIIBlocked(f"'{path.rstrip('.')}'에 긴 글이 있어 AI로 보낼 수 없습니다.")
    elif obj is not None and not isinstance(obj, (int, float, bool)):
        raise PIIBlocked(f"'{path.rstrip('.')}'의 값 형식을 보낼 수 없습니다.")


def chart_payload(obj: Any) -> Any:
    """차트 해석 입구: 지우고 → 검사. 검사에 걸리면 PIIBlocked."""
    clean = sanitize_chart_payload(obj)
    if clean is _DROP:
        clean = None
    assert_aggregate_only(clean)
    return clean
