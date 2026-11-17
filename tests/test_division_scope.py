"""과정부장·늘봄실장 열람 범위 규칙(deps)."""
from app.api.deps import division_of, in_scope, narrow_scope, user_scope, classes_in_scope, normalize_role, NO_SCOPE


def test_division_of():
    assert division_of("유1") == division_of("101") == division_of("초2-2") == "초등저학년"
    assert division_of("초3-1") == division_of("261") == "초등고학년"
    assert division_of("중순회") == "중학교"
    assert division_of("고3-2") == "고등학교"
    assert division_of("전2-3") == "전공과"
    assert division_of("예비") == ""


def test_scopes():
    head = {"role": normalize_role("division_head"), "class_id": "초등저학년"}
    teacher = {"role": normalize_role("class_teacher"), "class_id": "211"}
    nb = {"role": normalize_role("afterschool"), "class_id": ""}
    assert user_scope({"role": "admin"}) is None
    assert user_scope(head) == "초등저학년" and user_scope(teacher) == "초1-1" and user_scope(nb) == NO_SCOPE
    assert in_scope("유2", "초등저학년") and not in_scope("초3-1", "초등저학년")
    assert not in_scope("초1-1", NO_SCOPE)
    # 과정부장이 고른 학급은 과정 안일 때만 받아들인다
    assert narrow_scope(head, "221") == "초2-1"
    assert narrow_scope(head, "중1-1") == "초등저학년"
    # 담임은 다른 학급을 골라도 자기 학급
    assert narrow_scope(teacher, "중1-1") == "초1-1"
    assert classes_in_scope("초등저학년") == ["유1", "유2", "초1-1", "초1-2", "초2-1", "초2-2"]
    assert classes_in_scope(NO_SCOPE) == []
