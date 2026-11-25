"""직책 계정 비밀번호를 그룹별 공통 임시 비밀번호로 맞추고 만료일을 적는다(Users 탭).

사용법 (backend/ 에서, backend 가상환경). 비밀번호는 명령줄·저장소에 남기지 않도록 환경변수로 준다:
  PW_ADMIN=… PW_CLASS=… PW_OTHER=… python ../scripts/set_common_passwords.py            # 점검만
  PW_ADMIN=… PW_CLASS=… PW_OTHER=… python ../scripts/set_common_passwords.py --apply --expires 2026-12-31

그룹
  ADMIN : 학교관리자1·2, 행동중재지원팀장, 행동중재전문교사
  CLASS : 담임·부담임(학급이 있는 class_teacher, 순회담임 포함)
  OTHER : 나머지 사용 중인 계정(기능 담당자·부장·늘봄·교과전담·예비관리자)
만료일이 지나면 로그인 화면에서 본인 비밀번호로 바꿔야 들어온다(auth._pw_expired).
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from gspread.utils import rowcol_to_a1  # noqa: E402

from app.adapters.sheets.client import open_main_sheet  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.core.time import now_kst  # noqa: E402

ADMIN = {"학교관리자1", "학교관리자2", "행동중재지원팀장", "행동중재전문교사"}
INACTIVE = ("false", "0", "inactive", "x", "no")


def group_of(r: dict) -> str:
    uid, role = str(r.get("ID", "")), str(r.get("Role", "")).strip().lower()
    if uid in ADMIN:
        return "ADMIN"
    if role in ("class_teacher", "teacher") and str(r.get("ClassID", "")).strip() and not str(r.get("AssignedClasses", "")).strip() \
            and uid != "예비관리자":
        return "CLASS"
    return "OTHER"


def main(argv):
    pw = {g: os.environ.get(f"PW_{g}", "") for g in ("ADMIN", "CLASS", "OTHER")}
    if not all(pw.values()):
        sys.exit("PW_ADMIN·PW_CLASS·PW_OTHER 환경변수를 모두 주세요.")
    expires = argv[argv.index("--expires") + 1] if "--expires" in argv else ""
    ws = open_main_sheet().worksheet("Users")
    values = ws.get_all_values()
    hdr = values[0]
    rows = [dict(zip(hdr, r + [""] * (len(hdr) - len(r)))) for r in values[1:]]
    targets = [(i, r, group_of(r)) for i, r in enumerate(rows) if str(r.get("Active", "")).strip().lower() not in INACTIVE]
    for g in ("ADMIN", "CLASS", "OTHER"):
        ids = [r["ID"] for _, r, gg in targets if gg == g]
        print(f"{g}: {len(ids)}개 — {', '.join(ids[:8])}{' …' if len(ids) > 8 else ''}")
    print(f"건너뜀(사용 중지): {[r['ID'] for r in rows if str(r.get('Active', '')).strip().lower() in INACTIVE]} | 만료일: {expires or '없음'}")
    if "--apply" not in argv:
        print("\n점검만 했습니다. 반영하려면 --apply --expires YYYY-MM-DD")
        return

    stamp = now_kst().strftime("%Y%m%d_%H%M%S")
    path = os.path.expanduser(f"~/data/pbst_users_backup_{stamp}.json")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(values, f, ensure_ascii=False)
    print(f"백업: {path}")

    if "PwExpires" not in hdr:
        hdr = hdr + ["PwExpires"]
        ws.resize(cols=max(ws.col_count, len(hdr)))
        ws.update(range_name="A1", values=[hdr], value_input_option="RAW")
    pc, ec = hdr.index("Password") + 1, hdr.index("PwExpires") + 1
    hashes = {g: None for g in pw}
    updates = []
    for i, _r, g in targets:
        hashes[g] = hash_password(pw[g])  # 계정마다 새 salt
        updates.append({"range": rowcol_to_a1(i + 2, pc), "values": [[hashes[g]]]})
        updates.append({"range": rowcol_to_a1(i + 2, ec), "values": [[expires]]})
    ws.batch_update(updates, value_input_option="RAW")
    print(f"완료: {len(targets)}개 계정 비밀번호 변경, 만료일 {expires or '없음'}")


if __name__ == "__main__":
    main(sys.argv[1:])
