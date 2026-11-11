"""폼·사이트 입력 행을 같은 값으로 읽는 정리 규칙."""
from app.services.log_normalize import (
    parse_occurrence_count, canonical_slots, StudentIndex, LINK_AMBIGUOUS, LINK_BY_NAME, LINK_BY_SUFFIX, LINK_NONE,
)


def test_occurrence_count():
    assert parse_occurrence_count("5회") == 5
    assert parse_occurrence_count("10회, 자해 행동 뿐만 아니라 30~35분동안") == 10
    assert parse_occurrence_count("13:47 ~ 14:40") == 1   # 시간 범위를 13회로 읽지 않는다
    assert parse_occurrence_count("지속시간동안 반복발생") == 1
    assert parse_occurrence_count(None) == 1


def test_slots_same_for_form_and_site():
    form = "5구간: 초등점심 / 중등4교시, 4구간: 3교시"
    site = "4구간: 3교시, 5구간: 초등점심/중등4교시"
    assert canonical_slots(form) == canonical_slots(site) == "4구간: 3교시, 5구간: 초등점심/중등4교시"
    assert canonical_slots("1교시: 교실 / 4교시: 교실") == "1교시: 교실 / 4교시: 교실"  # 자유 서술은 그대로


def test_student_link_never_guesses_for_namesakes():
    idx = StudentIndex([
        {"학생코드": "2513", "학생이름": "이O준-2513", "재학여부": "O"}, {"학생코드": "5113", "학생이름": "이O준-2513", "재학여부": "O"},
        {"학생코드": "3316", "학생이름": "김O민", "재학여부": "O"}, {"학생코드": "9001", "학생이름": "박O수", "재학여부": "X"},
    ])
    assert idx.resolve("이O준-2513") == ("", LINK_AMBIGUOUS)
    assert idx.resolve("김O민") == ("3316", LINK_BY_NAME)
    assert idx.resolve("박O수") == ("9001", LINK_BY_NAME)        # 졸업·전출 학생의 지난해 기록
    assert idx.resolve("김O서-3316") == ("3316", LINK_BY_SUFFIX)
    assert idx.resolve("없O름") == ("", LINK_NONE)
    assert idx.resolve("누구든", "2513") == ("2513", "코드")      # 코드가 있으면 그대로
