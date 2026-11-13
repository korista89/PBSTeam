"""이전 학년도 원자료를 운영 시트에서 폐기하고, 연도 비교용 '학년도_요약' 탭만 남긴다.

사용법 (backend/ 에서, backend 가상환경):
  python ../scripts/retire_prior_years.py --year 2024 --year 2025          # 점검만(쓰기 없음)
  python ../scripts/retire_prior_years.py --year 2024 --year 2025 --apply  # 백업 → 요약 탭 기록 → 행 삭제 → 검증

순서(--apply): ① 폐기 대상 행과 연결된 Approvals 행을 ~/data/private 에 백업(권한 600)
              ② '학년도_요약' 탭에 학년도·연월별 집계 기록(실명·학생코드 없음) ③ 요약이 잘 들어갔는지 확인한 뒤에만
              ④ Log_Main·Approvals 의 해당 행 삭제(그 사이 시트가 바뀌었으면 중단) ⑤ 남은 행 검증.
학년도는 3월~다음해 2월(2025학년도 = 2025-03 ~ 2026-02). 요약에는 학생 수만 넣고 학생 식별 값은 넣지 않는다.
"""
import collections, json, os, re, sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
from app.services import sheets as S  # noqa: E402

SUMMARY_TAB = "학년도_요약"
DIMS = ["행동유형", "장소", "시간대", "강도", "기능", "물리적제지여부"]
MIN_N = 5


def hak_year(d: str):
    d = S.normalize_date_string(d) if d else ""  # 시트에는 '2025. 9. 17' 형태로 들어 있다
    if len(d) < 10 or d[4] != "-":
        return None
    y, m = int(d[:4]), int(d[5:7])
    return y if m >= 3 else y - 1


def toks(col: str, v: str):
    v = str(v or "")
    if col == "행동유형":
        v = ", ".join(x.split(":")[0].strip() for x in re.split(r"(?<=[가-힣\)])\s*,\s*(?=[가-힣]+행동)", v))
    if col in ("강도", "물리적제지여부"):
        return [v.strip()] if v.strip() else []
    return [t.strip() for t in re.split(r"[,;/]\s*|\s{2,}", v) if t.strip()]


def main():
    years = {int(sys.argv[i + 1]) for i, a in enumerate(sys.argv) if a == "--year"}
    apply = "--apply" in sys.argv
    if not years:
        sys.exit("--year 를 하나 이상 주세요.")
    ws = S.get_main_worksheet()
    sh = ws.spreadsheet
    vals = ws.get_all_values()
    h = vals[0]
    di, li, si = h.index("행동발생날짜"), h.index("Log_ID"), h.index("학생코드")
    rows = {i + 1: r for i, r in enumerate(vals) if i > 0 and len(r) > di and hak_year(r[di]) in years}
    if not rows:
        sys.exit("폐기 대상 행이 없습니다.")
    nums = sorted(rows)
    contiguous = nums[-1] - nums[0] + 1 == len(nums)
    ids = {r[li] for r in rows.values()}
    aws = sh.worksheet("Approvals")
    appr = aws.get_all_values()
    a_rows = [i + 1 for i, r in enumerate(appr) if i > 0 and r and r[0] in ids]
    print(f"Log_Main 대상 {len(rows)}행(연속={contiguous}, {nums[0]}~{nums[-1]}행), Approvals 대상 {len(a_rows)}행, 학년도 {sorted(years)}")

    # 요약 집계(희귀 값은 '기타') — 시트 머리글이 길어서 앱이 쓰는 정규화 기록(시간대·장소·행동유형…)으로 센다
    norm = {str(x.get("Log_ID")): x for x in S.fetch_all_records(force_refresh=True)}
    val = lambda r, c: norm.get(r[li], {}).get(c, "")
    freq = {c: collections.Counter() for c in DIMS}
    for r in rows.values():
        for c in DIMS:
            for t in toks(c, val(r, c)):
                freq[c][t] += 1
    out = [["학년도", "연월", "항목", "값", "건수", "학생수"]]
    groups = collections.defaultdict(lambda: collections.defaultdict(lambda: [0, set()]))
    for r in rows.values():
        d = S.normalize_date_string(r[di])
        ym = d[:7]
        y = hak_year(d)
        key = (y, ym)
        g = groups[key]
        g[("전체", "전체")][0] += 1
        g[("전체", "전체")][1].add(r[si])
        for c in DIMS:
            for t in toks(c, val(r, c)):
                v = t if freq[c][t] >= MIN_N else "기타"
                g[(c, v)][0] += 1
                g[(c, v)][1].add(r[si])
    for (y, ym) in sorted(groups):
        for (c, v), (n, st) in sorted(groups[(y, ym)].items()):
            out.append([y, ym, c, v, n, len(st)])
    # 날짜별 전체 합계(학교 전체, 학생 식별 없음) — 연도 비교 차트·브리핑 '작년 같은 기간'이 원자료 없이 계속 동작하게 한다
    daily = collections.defaultdict(lambda: [0, set()])
    for r in rows.values():
        d = S.normalize_date_string(r[di])
        daily[d][0] += 1
        daily[d][1].add(r[si])
    for d in sorted(daily):
        out.append([hak_year(d), d[:7], "일별전체", d, daily[d][0], len(daily[d][1])])
    print(f"요약 {len(out) - 1}행 생성(연월 {len(groups)}개, 항목 {len({(r[2], r[3]) for r in out[1:]})}종)")
    if not apply:
        print("점검만 했습니다(쓰기 없음). 실제 반영은 --apply")
        return

    # ① 백업
    os.makedirs(os.path.expanduser("~/data/private"), exist_ok=True)
    bp = os.path.expanduser(f"~/data/private/prior_years_raw_{datetime.now():%Y%m%d_%H%M}.json")
    fd = os.open(bp, os.O_WRONLY | os.O_CREAT, 0o600)
    with os.fdopen(fd, "w", encoding="utf8") as f:
        json.dump({"years": sorted(years), "log_main_header": h, "log_main": {str(k): v for k, v in rows.items()},
                   "approvals_header": appr[0], "approvals": {str(i): appr[i - 1] for i in a_rows}}, f, ensure_ascii=False)
    print("백업:", bp)
    # ② 요약 탭(기존 같은 학년도 행은 교체)
    try:
        sw = sh.worksheet(SUMMARY_TAB)
        old = sw.get_all_values()
        keep = [r for r in old[1:] if r and str(r[0]) not in {str(y) for y in years}]
    except Exception:
        sw = sh.add_worksheet(SUMMARY_TAB, rows=2000, cols=6)
        keep = []
    allrows = [out[0]] + keep + out[1:]
    sw.clear()
    sw.update(range_name="A1", values=allrows, value_input_option="RAW")
    back = sw.get_all_values()
    if len(back) != len(allrows):
        sys.exit("요약 탭 기록 확인 실패 — 행 삭제는 하지 않았습니다.")
    try:
        sw.hide()
    except Exception:
        pass
    print(f"요약 탭 기록 확인: {len(back) - 1}행")
    # ④ 삭제(그 사이 시트가 바뀌었으면 중단)
    now = ws.get_all_values()
    for n, r in rows.items():
        if n > len(now) or now[n - 1][li] != r[li]:
            sys.exit("그 사이 Log_Main 이 바뀌었습니다 — 삭제하지 않았습니다. 다시 실행하세요.")
    def blocks(nums):
        nums = sorted(nums, reverse=True)
        res, start, prev = [], None, None
        for n in nums:
            if start is None:
                start = prev = n
            elif n == prev - 1:
                prev = n
            else:
                res.append((prev, start)); start = prev = n
        if start is not None:
            res.append((prev, start))
        return res  # (첫 행, 끝 행) 아래쪽부터
    reqs = []
    for sheet, nums_ in ((aws, a_rows), (ws, list(rows))):
        for a, b in blocks(nums_):
            reqs.append({"deleteDimension": {"range": {"sheetId": sheet.id, "dimension": "ROWS", "startIndex": a - 1, "endIndex": b}}})
    sh.batch_update({"requests": reqs})
    # ⑤ 검증
    after = ws.get_all_values()
    left = [r for i, r in enumerate(after) if i > 0 and len(r) > di and hak_year(r[di]) in years]
    left_a = [r for i, r in enumerate(aws.get_all_values()) if i > 0 and r and r[0] in ids]
    print(f"삭제 후 남은 대상 행: Log_Main {len(left)}, Approvals {len(left_a)} (둘 다 0이어야 함)")
    if left or left_a:
        sys.exit("검증 실패")
    print("완료")


if __name__ == "__main__":
    main()
