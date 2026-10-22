from app.core.privacy import mask_name, build_alias_map, anonymize_text


def test_mask_and_idempotent():
    assert mask_name("김민준") == "김O준"
    assert mask_name("이서") == "이O"
    assert mask_name("홍길동A") == "홍O동A"
    for n in ["김O준", "이O", "김O준-1011"]:
        assert mask_name(n) == n


def test_alias_unique_and_homonym_shared():
    m = build_alias_map({"김민준": ["1"], "김서준": ["2"], "박하늘": ["3", "4"]})
    assert m["김민준"] != m["김서준"] and m["박하늘"] == "박O늘"
    assert len(set(m.values())) == 3


def test_anonymize_text_boundaries():
    m = {"김민준": "김O준", "이서": "이O"}
    assert anonymize_text("김민준이 이서 학생에게", m) == "김O준이 이O 학생에게"
    assert anonymize_text("부장교사(이서생) 이서는", m) == "부장교사(이서생) 이O는"
