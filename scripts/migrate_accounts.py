"""직책·학급 기반 1:1 계정으로 전환한다(Users 탭).

사용법 (backend/ 에서, backend 가상환경):
  python ../scripts/migrate_accounts.py                 # 점검만(쓰기 없음): 만들 계정·바뀔 칸 수
  python ../scripts/migrate_accounts.py --apply         # 백업 → 칸 추가 → 계정 생성 → 이름 칸을 아이디로
  python ../scripts/migrate_accounts.py --disable-admin # 새 관리자 계정 로그인 확인 뒤, 공용 admin 사용 중지
  python ../scripts/migrate_accounts.py --rollback ~/data/pbst_users_backup_YYYYMMDD_HHMMSS.json

- 기존 계정·비밀번호는 그대로 둔다. 새 계정만 임시 비밀번호(무작위)로 만든다.
- 임시 비밀번호 표와 백업은 저장소 밖 ~/data/ 에만 쓴다(권한 600). 화면·로그에 비밀번호를 찍지 않는다.
- 교사 실명은 저장하지 않는다: Name 칸은 아이디(직책)로 바꾼다(이전 값은 백업에만).
"""
import csv
import json
import os
import secrets
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.adapters.sheets.client import open_main_sheet  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.core.time import now_kst  # noqa: E402

DATA = os.path.expanduser("~/data")
NEW_COLS = ["Roles", "AssignedClasses", "Active"]

ADMIN = ["학교관리자1", "학교관리자2", "행동중재지원팀장", "행동중재전문교사"]
STAFF = ["위기행동지원담당자1", "위기행동지원담당자2", "Tier1담당자1", "Tier1담당자2", "Tier2담당자1", "Tier2담당자2",
         "Tier3담당자1", "Tier3담당자2", "학생맞춤통합지원담당자", "경은그림말담당자"]
# 교과전담: 과정 전체를 배정(과정명은 in_scope가 그 과정 학급 전부로 본다)
SUBJECT = [("중학교교과전담교사1", "중학교"), ("고등학교교과전담교사1", "고등학교"),
           ("고등학교교과전담교사2", "고등학교"), ("고등학교교과전담교사3", "고등학교")]


def planned(existing):
    """만들 계정 [(ID, Role, ClassID, AssignedClasses)]. 부담임은 담임 계정(학급)마다 하나."""
    rows = [(i, "admin", "", "") for i in ADMIN] + [(i, "pbst_staff", "", "") for i in STAFF]
    rows += [(i, "class_teacher", "", d) for i, d in SUBJECT]
    for u in existing:
        uid, role = str(u.get("ID", "")), str(u.get("Role", "")).lower()
        if role == "class_teacher" and "순회" not in uid and uid != "예비관리자":
            rows.append((f"{uid} 부담임", "class_teacher", str(u.get("ClassID", "")), ""))
    have = {str(u.get("ID", "")) for u in existing}
    return [r for r in rows if r[0] not in have]


def _private(path, write):
    os.makedirs(DATA, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8-sig" if path.endswith(".csv") else "utf-8", newline="") as f:
        write(f)


def main(argv):
    ws = open_main_sheet().worksheet("Users")
    values = ws.get_all_values()
    hdr = values[0]
    records = [dict(zip(hdr, r + [""] * (len(hdr) - len(r)))) for r in values[1:]]
    new = planned(records)
    name_fix = [i for i, r in enumerate(records) if r.get("Name", "") != r.get("ID", "")]
    missing = [c for c in NEW_COLS if c not in hdr]
    print(f"계정 {len(records)}개 | 추가할 칸: {missing or '없음'} | 새 계정: {len(new)}개 | 이름 칸 정리: {len(name_fix)}개")
    for r in new:
        print(f"  + {r[0]} ({r[1]}{', ' + r[3] if r[3] else ''})")

    if "--rollback" in argv:
        path = argv[argv.index("--rollback") + 1]
        backup = json.load(open(os.path.expanduser(path), encoding="utf-8"))
        ws.clear()
        ws.update(range_name="A1", values=backup, value_input_option="RAW")
        print(f"되돌림: {path} ({len(backup) - 1}개 계정)")
        return

    if "--disable-admin" in argv:
        if "Active" not in hdr:
            sys.exit("Active 칸이 없습니다. 먼저 --apply 를 실행하세요.")
        row = next((i + 2 for i, r in enumerate(records) if r.get("ID") == "admin"), None)
        if not row:
            sys.exit("admin 계정이 없습니다.")
        ws.update_cell(row, hdr.index("Active") + 1, "false")
        print("공용 admin 계정을 사용 중지했습니다(행 삭제 없음, Active=false).")
        return

    if "--apply" not in argv:
        print("\n점검만 했습니다. 반영하려면 --apply")
        return

    stamp = now_kst().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(DATA, f"pbst_users_backup_{stamp}.json")
    _private(backup_path, lambda f: json.dump(values, f, ensure_ascii=False))
    print(f"백업: {backup_path}")

    if missing:
        hdr = hdr + missing
        ws.resize(cols=max(ws.col_count, len(hdr)))
        ws.update(range_name="A1", values=[hdr], value_input_option="RAW")
    col = {h: i for i, h in enumerate(hdr)}

    if name_fix:
        from gspread.utils import rowcol_to_a1
        ws.batch_update([{"range": rowcol_to_a1(i + 2, col["Name"] + 1), "values": [[records[i]["ID"]]]} for i in name_fix],
                        value_input_option="RAW")

    temps, rows = [], []
    for uid, role, cls, assigned in new:
        pw = "".join(secrets.choice("abcdefghjkmnpqrstuvwxyz23456789") for _ in range(8))
        temps.append((uid, role, pw))
        row = [""] * len(hdr)
        for k, v in {"ID": uid, "Password": hash_password(pw), "Role": role, "ClassID": cls,
                     "ClassName": "", "Name": uid, "AssignedClasses": assigned, "Active": "true"}.items():
            if k in col:
                row[col[k]] = v
        rows.append(row)
    if rows:
        ws.append_rows(rows, value_input_option="RAW")
        pw_path = os.path.join(DATA, f"pbst_temp_passwords_{stamp}.csv")
        _private(pw_path, lambda f: csv.writer(f).writerows([["아이디", "권한", "임시 비밀번호"], *temps]))
        print(f"임시 비밀번호 표(오프라인 배부용): {pw_path}")
    print("완료. 새 관리자 계정으로 로그인해 본 뒤 --disable-admin 을 실행하세요.")


if __name__ == "__main__":
    main(sys.argv[1:])
