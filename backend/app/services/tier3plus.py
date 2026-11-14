"""Tier3+(지역사회·외부 연계) 개별학생 프로그램.

- 프로그램 1개 = 학생 1명. 학년도마다 최대 20개. 유형·월 단위 기간·연계기관·목표·담당.
- 저장: 숨김 탭 'Tier3+_프로그램'(앱이 처음 저장할 때 만든다). 표·모니터링은 sst.ProgramBook을 같이 쓴다.
- 성과: 그 학생의 월별 위기행동 기록 건수·평균 강도·CICO 수행률을 운영 전 1개월·운영 중·운영 후 1개월로 본다.
- 단계 확인: Tier3+ 단계 자체는 Tier3관리의 월별 명단이 출처다. 운영 중인 프로그램 학생의 그 달 단계가
  Tier3+가 아니면 알려만 준다(자동으로 바꾸지 않음).
"""

from typing import Any, Dict, List

from app.services.sst import ProgramBook, runs_in

TYPES = ["의료 협력(진료·약물)", "교육청 행동중재 지원단", "외부 치료·상담 연계", "가정 연계·부모 상담",
         "추가 인력 지원", "개별 위기대응 계획", "기타"]
MAX_PROGRAMS = 20

BOOK = ProgramBook("Tier3+_프로그램", MAX_PROGRAMS, TYPES, single_target=True, extra={"연계기관": "agency"})


def level_check(month: int) -> List[Dict[str, Any]]:
    """그 달 운영 중인 프로그램 학생 중 Tier3관리 명단 단계가 Tier3+가 아닌 학생."""
    from app.services.tier_monthly import month_state
    st = month_state(month)
    out = []
    for p in BOOK.list_programs():
        if not runs_in(p, month):
            continue
        for c in p["targets"]:
            level = st["t3"].get(c, "")
            if level != "Tier3+":
                out.append({"program": p["name"], "code": c, "level": level or "명단 없음"})
    return out
