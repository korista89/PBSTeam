"""시트 운영 Apps Script(apps_script/pbst_sheet_ops.gs)의 계산이 사이트(파이썬)와 같은지 무작위 자료로 대조한다."""
import json
import random
import shutil
import subprocess
from pathlib import Path

import pytest

from app.services.sheets import _calculate_cico_rate, get_business_days

GS = Path(__file__).resolve().parent.parent / "apps_script" / "pbst_sheet_ops.gs"
SCALES = ["O/X(발생)", "0점/1점/2점", "0~5", "0~7교시", "1~100회", "1~100분"]
VALUES = {"O/X(발생)": ["O", "X"], "0점/1점/2점": ["0점", "1점", "2점"], "0~5": list("012345"),
          "0~7교시": list("01234567"), "1~100회": ["3", "10", "45", "100"], "1~100분": ["5", "30", "90"]}
GOALS = ["90% 이상", "80% 이상", "50% 이상", "50% 이하", "20% 이하", "10% 이하", "80% 이상(주3회)", " 70 % 이상 ", "", "기준 미정", "%%30이하"]
SLOTS = ["1교시", "2교시", "3교시", "점심", "4교시", "5교시", "6교시", "7교시"]


def run_js(expr_body: str, payload):
    if not shutil.which("node"):
        pytest.skip("node 없음")
    code = (f"const mod = require({json.dumps(str(GS))});\n"
            f"const input = JSON.parse(require('fs').readFileSync(0, 'utf8'));\n{expr_body}")
    tmp = GS.parent / "_parity_tmp.js"
    tmp.write_text(code, encoding="utf-8")
    try:
        # .gs 확장자를 node가 모르므로 같은 내용을 .js로 복사해 불러온다
        js = GS.with_suffix(".js")
        js.write_text(GS.read_text(encoding="utf-8"), encoding="utf-8")
        tmp.write_text(code.replace(json.dumps(str(GS)), json.dumps(str(js))), encoding="utf-8")
        out = subprocess.run(["node", str(tmp)], input=json.dumps(payload), capture_output=True, text=True, timeout=60)
        assert out.returncode == 0, out.stderr
        return json.loads(out.stdout)
    finally:
        tmp.unlink(missing_ok=True)
        GS.with_suffix(".js").unlink(missing_ok=True)


def random_students(n=3000, seed=7):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        scale = rnd.choice(SCALES)
        days = {f"10-{d:02d}": (rnd.choice(VALUES[scale] + ["", "-"]) if rnd.random() < 0.8 else "") for d in range(1, 1 + rnd.randint(0, 22))}
        s = {"척도": scale, "목표행동 유형": rnd.choice(["증가 목표행동", "감소 목표행동"]), "목표 달성 기준": rnd.choice(GOALS),
             "입력 기준": rnd.choice(["", "0", "20", "50회", "abc", "10회회", " 30분 ", "약 20"]), "days": days}
        if rnd.random() < 0.3:
            s["기록방식"] = "분포도"
            s["periods"] = {d: {p: rnd.choice(["O", "X"]) for p in rnd.sample(SLOTS, rnd.randint(0, 8))} for d in days}
        out.append(s)
    return out


def test_rate_matches_site():
    students = random_students()
    js = run_js("console.log(JSON.stringify(input.map(s => { const c = mod.calcRate_(s); return [c.rate, c.achieved, c.inputDays]; })));", students)
    for s, (rate, achieved, input_days) in zip(students, js):
        py = _calculate_cico_rate(s)
        assert (py["rate_str"], py["achieved"], py["input_days"]) == (rate, achieved, input_days), s


def test_business_days_match_site():
    holidays = ["2026-10-03", "2026-10-09", "12-25", "2027-01-01", "2026-05-05"]
    months = [(2026, m) for m in range(3, 13)] + [(2027, 1), (2027, 2)]
    js = run_js("console.log(JSON.stringify(input.months.map(([y, m]) => mod.businessDays_(y, m, input.h))));",
                {"months": months, "h": holidays})
    assert js == [list(get_business_days(y, m, holidays)) for y, m in months]
