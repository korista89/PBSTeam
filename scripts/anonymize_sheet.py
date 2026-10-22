"""운영 시트의 학생 실명을 별칭으로 일괄 치환한다.

사용법 (backend/ 에서, backend 가상환경):
  python ../scripts/anonymize_sheet.py            # 점검만(쓰기 없음). 바뀔 셀 수만 보고
  python ../scripts/anonymize_sheet.py --apply    # 실제 반영
  python ../scripts/anonymize_sheet.py --verify   # 반영 후 잔존 실명 점검(읽기 전용)
  python ../scripts/anonymize_sheet.py --incremental  # 예약 작업용: 새로 들어온 실명만 가림(대응표 유지)
  ※ 최초 변환 뒤에는 대응표(실명→별칭)를 덮어쓰지 않도록 --apply 는 --rebuild 를 함께 줘야 실행된다.

- 실명↔별칭 대응표는 저장소 밖 ~/data/pbst_alias_map.json 에만 둔다(권한 600). 저장소·로그에 실명을 쓰지 않는다.
- 이름은 학생 이름 열과 자유서술 열에서만 치환한다. 교사 이름 열(입력교사명·Author 등)과 Users 탭은 건드리지 않는다.
- 수식 셀은 건드리지 않는다(값이 따라온다). 바뀐 셀만 RAW 로 쓴다.
"""
import json
import os
import re
import sys
import time

import gspread
from google.oauth2.service_account import Credentials

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.core.privacy import anonymize_text, build_alias_map, mask_name  # noqa: E402

SHEET_ID = "1pMQIowYYBIk-6owcJqCNK5mA8GtssEEr6XdUq8gC9Cs"
MAP_PATH = os.path.expanduser("~/data/pbst_alias_map.json")
SKIP_TABS = {"Users", "날짜 관리", "평가문장"}
SKIP_COLS = {"입력교사명", "Author", "RecordedBy", "입력자", "ID", "Password", "작성자", "UpdatedBy"}
# 이름 자체가 들어 있는 열(전체 셀이 이름 또는 '이름(코드)')
NAME_COLS = {"학생명", "학생이름", "학생명(코드)", "Name"}


def retry(fn, *a, **k):
    for i in range(8):
        try:
            return fn(*a, **k)
        except gspread.exceptions.APIError as e:
            if "429" in str(e) or "500" in str(e) or "503" in str(e):
                time.sleep(15 + 5 * i)
                continue
            raise
    raise RuntimeError("API 재시도 초과")


def connect(write):
    scope = "https://www.googleapis.com/auth/spreadsheets" + ("" if write else ".readonly")
    creds = Credentials.from_service_account_file("service_account.json", scopes=[scope])
    return gspread.authorize(creds).open_by_key(SHEET_ID)


# 새 실명이 들어올 수 있는 탭(구글폼·자유서술). 월별·그림말 탭은 사이트가 TierStatus 별칭으로 만든다.
INCREMENTAL_TABS = ["Log_Main", "TierStatus", "BIP", "MeetingNotes", "PW_협의록"]


def read_all(sh, only=None):
    data = {}
    for ws in sh.worksheets():
        if only and ws.title not in only:
            continue
        data[ws.title] = (ws, retry(ws.get_all_values, value_render_option="FORMULA"))
        time.sleep(1.2)
    return data


def collect_names(data):
    """TierStatus(학생이름·학생코드)가 기준. 다른 탭에만 있는 이름도 포함."""
    n2c = {}
    _, ts = data["TierStatus"]
    ni, ci = ts[0].index("학생이름"), ts[0].index("학생코드")
    for r in ts[1:]:
        if len(r) > ni and isinstance(r[ni], str) and r[ni].strip():
            n2c.setdefault(r[ni].strip(), []).append(r[ci])
    for tab, (ws, rows) in data.items():
        if tab in SKIP_TABS or tab == "TierStatus":
            continue
        for k, h in enumerate(rows[0] if rows else []):
            if h not in NAME_COLS:
                continue
            for r in rows[1:]:
                if len(r) > k and isinstance(r[k], str) and r[k].strip() and not r[k].startswith("="):
                    v = re.sub(r"\(\d+\)$", "", r[k].strip()).strip()
                    n2c.setdefault(v, [])
    return n2c


def plan(data, alias, mask_unknown=False):
    """{탭: [(행,열,새값)]}. mask_unknown: 대응표에 없는 새 이름도 이름 열에서는 규칙대로 가린다."""
    known_aliases = set(alias.values())
    changes = {}
    for tab, (ws, rows) in data.items():
        if tab in SKIP_TABS or not rows:
            continue
        hdr = rows[0]
        for ri in range(1, len(rows)):
            row = rows[ri]
            for ci, cell in enumerate(row):
                if not isinstance(cell, str) or not cell or cell.startswith("=") or (ci < len(hdr) and hdr[ci] in SKIP_COLS):
                    continue
                if ci < len(hdr) and hdr[ci] in NAME_COLS:
                    m = re.match(r"^(.*?)(\(\d+\))?$", cell.strip())
                    base = m.group(1).strip()
                    new = alias.get(base)
                    if not new and mask_unknown and base not in known_aliases and mask_name(base) != base:
                        new = mask_name(base)
                    new = (new + (m.group(2) or "")) if new else cell
                else:
                    new = anonymize_text(cell, alias)
                if new != cell:
                    changes.setdefault(tab, []).append((ri, ci, new))
    return changes


def a1(ri, ci):
    s, n = "", ci + 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return f"{s}{ri + 1}"


def apply(sh, changes):
    for tab, cells in changes.items():
        ws = sh.worksheet(tab)
        for i in range(0, len(cells), 3000):
            part = cells[i:i + 3000]
            body = [{"range": f"'{tab}'!{a1(r, c)}", "values": [[v]]} for r, c, v in part]
            retry(sh.values_batch_update, {"valueInputOption": "RAW", "data": body})
            time.sleep(2)
        print(f"  {tab}: {len(cells)}셀 반영")


def main():
    mode = ("incremental" if "--incremental" in sys.argv else "apply" if "--apply" in sys.argv
            else "verify" if "--verify" in sys.argv else "dry")
    sh = connect(mode in ("apply", "incremental"))
    if mode == "incremental":
        saved = json.load(open(MAP_PATH))
        changes = plan(read_all(sh, INCREMENTAL_TABS), saved["alias"], mask_unknown=True)
        stamp = time.strftime("%Y-%m-%d %H:%M")
        print(f"[{stamp}] 새 실명 셀:", {t: len(c) for t, c in changes.items()} or "없음")
        if changes:
            apply(sh, changes)
        return
    if mode in ("dry", "apply") and os.path.exists(MAP_PATH) and "--rebuild" not in sys.argv:
        sys.exit(f"대응표 {MAP_PATH} 가 이미 있습니다. 새 실명만 가리려면 --incremental, 전체 재작성은 --rebuild 를 붙이세요.")
    if mode == "verify":
        saved = json.load(open(MAP_PATH))
        data = read_all(sh)
        left = plan(data, saved["alias"])
        bad = {t: len(c) for t, c in left.items()}
        print("잔존 실명 셀:", bad or "없음")
        # 교사 이름 열에 학생 동명이인이 있는 건 의도적으로 남긴다(별도 집계)
        pat = re.compile("|".join(map(re.escape, sorted(saved["alias"], key=len, reverse=True))))
        for tab, (ws, rows) in data.items():
            if tab in SKIP_TABS or not rows:
                continue
            n = sum(1 for r in rows[1:] for c, x in enumerate(r)
                    if rows[0][c:c + 1] and rows[0][c] in SKIP_COLS and pat.search(x or ""))
            if n:
                print(f"  (참고) {tab} 교사 이름 열의 동명이인 셀 {n}개 — 학생 이름 아님, 유지")
        sys.exit(1 if bad else 0)

    data = read_all(sh)
    n2c = collect_names(data)
    alias = build_alias_map(n2c)
    os.makedirs(os.path.dirname(MAP_PATH), exist_ok=True)
    fd = os.open(MAP_PATH, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump({"alias": alias, "codes": n2c}, f, ensure_ascii=False)
    changes = plan(data, alias)
    print(f"이름 {len(alias)}개 → 별칭, 서로 다른 별칭 {len(set(alias.values()))}개")
    for tab, cells in changes.items():
        print(f"  {tab}: {len(cells)}셀")
    if mode == "apply":
        apply(sh, changes)
        print("반영 완료. --verify 로 점검하세요.")


if __name__ == "__main__":
    main()
