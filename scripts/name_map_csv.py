"""2027 익명코드 이관 뒤, 학급별 실명 매핑 CSV를 이 PC에서만 만든다(서버에는 실명이 없다).

사용법 (backend/ 에서, backend 가상환경):
  python ../scripts/name_map_csv.py ~/Downloads/익명코드_대응표_2027-02-20.json
입력: 마법사가 내려준 대응표 {익명코드: 이전 표기(별칭)} + 저장소 밖 ~/data/pbst_alias_map.json(실명→별칭)
출력: ~/data/pbst_name_map/<학급>.csv (student_code, 익명코드, 학급, student_name) — 담임에게 USB·출력으로 전달 후 지운다.
또 ~/data/pbst_alias_map.json 의 별칭을 익명코드로 바꿔 둔다(이전 파일은 .before_anon 으로 보관).
예약 작업(anonymize_sheet --incremental)이 구글폼으로 들어온 새 실명을 옛 별칭이 아니라 익명코드로 가리게 하려는 것.
"""
import csv
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.services.sheets import fetch_student_status  # noqa: E402


def main(path):
    code_map = json.load(open(os.path.expanduser(path), encoding="utf-8"))           # 익명코드 → 별칭
    alias = json.load(open(os.path.expanduser("~/data/pbst_alias_map.json")))["alias"]  # 실명 → 별칭
    real_of = {}
    for real, al in alias.items():
        real_of.setdefault(al, real)
    out_dir = os.path.expanduser("~/data/pbst_name_map")
    os.makedirs(out_dir, mode=0o700, exist_ok=True)
    by_class, missing = {}, []
    for s in fetch_student_status():
        code = str(s.get("학생이름", "")).strip()
        if code not in code_map:
            continue
        real = real_of.get(code_map[code], "")
        if not real:
            missing.append(code)
        by_class.setdefault(s.get("학급", "기타"), []).append([s.get("학생코드", ""), code, s.get("학급", ""), real])
    for cls, rows in by_class.items():
        p = os.path.join(out_dir, f"{cls}.csv")
        fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8-sig", newline="") as f:
            csv.writer(f).writerows([["student_code", "익명코드", "학급", "student_name"], *rows])
    amap_path = os.path.expanduser("~/data/pbst_alias_map.json")
    saved = json.load(open(amap_path))
    # 동명이인처럼 두 학생이 같은 표기를 쓰면 어느 코드인지 몰라 옛 표기를 그대로 둔다(다른 학생 코드로 가리지 않게)
    n_al = {}
    for al in code_map.values():
        n_al[al] = n_al.get(al, 0) + 1
    to_code = {al: code for code, al in code_map.items() if n_al[al] == 1}
    if any(v in to_code for v in saved["alias"].values()):
        os.replace(amap_path, amap_path + ".before_anon")
        saved["alias"] = {real: to_code.get(al, al) for real, al in saved["alias"].items()}
        fd = os.open(amap_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(saved, f, ensure_ascii=False)
        print("대응표(실명→표기)를 익명코드로 갱신했습니다.")
    print(f"{len(by_class)}개 학급 → {out_dir} | 실명을 못 찾은 학생 {len(missing)}명(이름 칸 비움)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
