"""학년도별 비식별 연구용 데이터 파일을 만든다(읽기 전용: 시트에는 아무것도 쓰지 않는다).

사용법 (backend/ 에서, backend 가상환경):
  python ../scripts/build_year_archive.py            # ~/data/archive/ 에 학년도별 CSV 생성 + 누출 점검
  python ../scripts/build_year_archive.py --year 2025 # 한 학년도만
  python ../scripts/build_year_archive.py --final --handover   # 학년도 마감: '잠정' 표시 없이 + 인수인계 파일(JSON) 생성

비식별 원칙 (위기행동 기록 Log_Main 기준)
- 뺀다: 학생명·학생코드·코드번호·입력교사명·Log_ID·타임스탬프·특기사항·승인 메타·정확한 날짜.
- 바꾼다: 학생 → 가명 ID(키는 ~/data/private/archive_key 에만, 같은 학생은 학년도가 달라도 같은 ID),
          날짜 → 학년도·연월·학년도 주차(3월 1일 기준), 자유서술이 섞인 칸 → 5건 미만 값은 '기타'.
- 출력 뒤 실명·교사명·학생코드가 한 칸이라도 남으면 파일을 지우고 실패로 끝낸다.
"""
import csv, hashlib, hmac, json, os, re, secrets, sys, collections
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
from app.services import sheets as S  # noqa: E402

HOME = os.path.expanduser("~")
OUT = os.path.join(HOME, "data", "archive")
KEY_PATH = os.path.join(HOME, "data", "private", "archive_key")
MAP_PATH = os.path.join(HOME, "data", "pbst_alias_map.json")
MIN_N = 5  # 값이 이 건수 미만이면 '기타'로 묶는다(자유서술·희귀 값 제거)
CAT_COLS = ["시간대", "장소", "행동유형", "기능", "배경사건", "선행사건", "후속결과"]  # 쉼표로 여러 값이 올 수 있는 칸
SINGLE_COLS = ["강도", "물리적제지여부", "발생횟수", "Source"]


def key() -> bytes:
    os.makedirs(os.path.dirname(KEY_PATH), exist_ok=True)
    if not os.path.exists(KEY_PATH):
        fd = os.open(KEY_PATH, os.O_WRONLY | os.O_CREAT, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(secrets.token_hex(32))
    return open(KEY_PATH).read().strip().encode()


def letters(b: bytes, n: int) -> str:
    """바이트 → 영문 대문자 n자(숫자가 섞여 학생코드와 우연히 겹치는 일을 막는다)."""
    return "".join(chr(65 + x % 26) for x in b[:n])


def hak_year(d: str):
    if len(d) < 10 or d[4] != "-":
        return None
    y, m = int(d[:4]), int(d[5:7])
    return y if m >= 3 else y - 1


def tokens(v: str, col: str = ""):
    if col == "행동유형":  # '신체적공격행동: 타인 밀치기, ...' → 앞의 분류명만(설명 속 쉼표로 쪼개지지 않게)
        v = ", ".join(x.split(":")[0].strip() for x in re.split(r"(?<=[가-힣\)])\s*,\s*(?=[가-힣]+행동)", str(v)))
    return [t.strip() for t in re.split(r"[,;/]\s*|\s{2,}", str(v)) if t.strip()] if v else []


def main():
    only = int(sys.argv[sys.argv.index("--year") + 1]) if "--year" in sys.argv else None
    recs = S.fetch_all_records(force_refresh=True)
    k = key()
    # 값 빈도(전 학년도 합산) → 희귀 값은 '기타'
    freq = {c: collections.Counter() for c in CAT_COLS}
    for r in recs:
        for c in CAT_COLS:
            for t in tokens(r.get(c, ""), c):
                freq[c][t] += 1
    keep = {c: {t for t, n in freq[c].items() if n >= MIN_N} for c in CAT_COLS}

    rows = collections.defaultdict(list)
    for r in recs:
        d = str(r.get("행동발생날짜") or r.get("발생날짜") or "")[:10]
        y = hak_year(d)
        if y is None or (only and y != only):
            continue
        sid = "P" + letters(hmac.new(k, str(r.get("학생코드", "")).encode(), hashlib.sha256).digest(), 6)
        dd = date.fromisoformat(d)
        week = (dd - date(y, 3, 1)).days // 7 + 1
        out = {"학년도": y, "연월": d[:7], "학년도주차": week, "학생ID": sid}
        for c in CAT_COLS:
            out[c] = " | ".join(t if t in keep[c] else "기타" for t in tokens(r.get(c, ""), c))
        for c in SINGLE_COLS:
            out[c] = str(r.get(c, "")).strip()
        rows[y].append(out)

    os.makedirs(OUT, exist_ok=True)
    cols = ["학년도", "연월", "학년도주차", "학생ID"] + CAT_COLS + SINGLE_COLS
    made = []
    for y, rs in sorted(rows.items()):
        rs.sort(key=lambda o: (o["연월"], o["학년도주차"], o["학생ID"]))
        last = max(o["연월"] for o in rs)
        name = f"{y}학년도 경은PBS 데이터" + ("" if "--final" in sys.argv or y < date.today().year - (0 if date.today().month >= 3 else 1) else f"(잠정, {last}까지)")
        path = os.path.join(OUT, name + ".csv")
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows(rs)
        os.chmod(path, 0o600)
        made.append((path, len(rs), len({o["학생ID"] for o in rs})))

    # 누출 점검: 실명·교사명·학생코드가 출력 어디에도 없어야 한다
    m = json.load(open(MAP_PATH, encoding="utf8"))
    bad = {n for n in list(m.get("alias", {}).keys()) if len(n) >= 2}
    bad |= {str(r.get("입력교사명", "")).strip() for r in recs if len(str(r.get("입력교사명", "")).strip()) >= 2}
    codes = {str(r.get("학생코드", "")).strip() for r in recs if str(r.get("학생코드", "")).strip()}
    leaks = 0
    for path, _, _ in made:
        for row in csv.DictReader(open(path, encoding="utf-8-sig")):
            for col, v in row.items():
                hit = any(n in v for n in bad) or any(re.search(rf"(?<!\d){re.escape(c)}(?!\d)", v) for c in codes)
                if hit:
                    leaks += 1
                    print(f"  누출 의심: {os.path.basename(path)} 칸={col} 값길이={len(v)} (값은 출력하지 않음)")
    if leaks:
        for path, _, _ in made:
            os.remove(path)
        sys.exit(f"누출 점검 실패({leaks}건) — 파일을 모두 지웠습니다.")
    for path, n, s in made:
        print(f"{os.path.basename(path)}: {n}행, 학생 {s}명 — 누출 점검 통과")
    if "--handover" in sys.argv:
        handover()


def handover():
    """~/data/archive 의 학년도별 CSV(이미 점검 통과)를 모아 인수인계 파일 하나로 묶는다.
    시트에서 폐기된 이전 학년도는 CSV 에서 가져오므로, 매년 CSV 를 지우지 말고 보관한다."""
    best = {}
    for fn in sorted(os.listdir(OUT)):
        m = re.match(r"(\d{4})학년도 경은PBS 데이터(\(잠정.*\))?\.csv$", fn)
        if m and (m.group(1) not in best or not m.group(2)):  # 최종본이 잠정본보다 우선
            best[m.group(1)] = fn
    recs = []
    for y in sorted(best):
        recs += list(csv.DictReader(open(os.path.join(OUT, best[y]), encoding="utf-8-sig")))
    ys = sorted(best)
    doc = {"형식": "경은PBS-인수인계", "버전": 1, "생성일": date.today().isoformat(), "학년도": [int(y) for y in ys],
           "안내": "학생ID(P+영문6자)는 가명입니다. 사이트 '학생 Tier 현황 → 인수인계 연결'에서 현재 학생과 짝지어 쓰세요. 이 파일은 외부 서버·메신저에 올리지 말고 학교 관리 저장소에만 두세요.",
           "기록": recs}
    path = os.path.join(OUT, f"경은PBS 인수인계 자료({ys[0]}~{ys[-1]}학년도).json")
    with open(path, "w", encoding="utf8") as f:
        json.dump(doc, f, ensure_ascii=False)
    os.chmod(path, 0o600)
    print(f"{os.path.basename(path)}: 학년도 {', '.join(ys)}, 기록 {len(recs)}행")


if __name__ == "__main__":
    main()
