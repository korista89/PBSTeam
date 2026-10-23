"""매일 아침 관리자 브리핑 '오늘의 10줄'을 텔레그램으로 보낸다(수업일만).

사용법 (backend/ 에서, backend 가상환경):
  python ../scripts/daily_briefing_telegram.py           # 보내기
  python ../scripts/daily_briefing_telegram.py --dry     # 보내지 않고 화면에만 출력

- 봇 토큰·받는 채팅은 박프로 봇(hermes) .env 의 TELEGRAM_BOT_TOKEN, TELEGRAM_HOME_CHANNEL
  (없으면 TELEGRAM_ALLOWED_USERS 첫 번째)을 쓴다. 값은 출력하지 않는다.
- 학생은 별칭·학생코드로만 나온다(시트에 실명 없음).
"""
import os
import sys
import time

import requests
from dotenv import dotenv_values

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.core.time import today_kst  # noqa: E402
from app.services.briefing import build_briefing  # noqa: E402
from app.services.sheets import fetch_all_records, fetch_student_status, get_holidays_from_config, fetch_approval_states  # noqa: E402

HERMES_ENV = os.path.expanduser("~/workspace/cowork/hermes/.env")
SITE = "https://pbs-team.vercel.app/briefing"


def main():
    from app.core.time import now_kst
    today = today_kst()
    if now_kst().hour >= 12 and "--force" not in sys.argv:
        print(f"{today} 정오 이후(컴퓨터가 꺼져 있다 늦게 실행됨) — 아침 브리핑 보내지 않음")
        return
    holidays = get_holidays_from_config() or []
    if today.weekday() >= 5 or today.isoformat() in {str(h)[:10] for h in holidays}:
        print(f"{today} 수업일 아님 — 보내지 않음")
        return
    b = build_briefing(fetch_all_records(force_refresh=True), fetch_student_status(), holidays, today, signoffs=fetch_approval_states())
    text = "\n".join(
        [f"🗞️ 경은PBST 관리자 브리핑 ({today.month}. {today.day}.)", ""]
        + [f"{i}. {line}" for i, line in enumerate(b["ten_lines"], 1)]
        + ["", f"자세히 보기: {SITE}"]
    )
    if "--dry" in sys.argv:
        print(text)
        return
    env = dotenv_values(HERMES_ENV)
    token = env.get("TELEGRAM_BOT_TOKEN")
    chat = env.get("TELEGRAM_HOME_CHANNEL") or (env.get("TELEGRAM_ALLOWED_USERS") or "").split(",")[0].strip()
    if not token or not chat:
        sys.exit("hermes .env 에 TELEGRAM_BOT_TOKEN 또는 받는 채팅(TELEGRAM_HOME_CHANNEL)이 없습니다.")
    r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                      json={"chat_id": chat, "text": text, "disable_web_page_preview": True}, timeout=20)
    print(f"{today} 전송 결과: {r.status_code} {r.json().get('ok')}")
    r.raise_for_status()


if __name__ == "__main__":
    # 시트 읽기 한도는 운영 사이트와 같이 쓴다. 한도 초과면 잠시 쉬었다 다시 한다.
    for attempt in range(5):
        try:
            main()
            break
        except Exception as e:
            if "429" not in str(e) and "Quota" not in str(e) and "unavailable" not in str(e).lower():
                raise
            print(f"시트 읽기 한도 초과 — {30 * (attempt + 1)}초 뒤 재시도")
            time.sleep(30 * (attempt + 1))
    else:
        sys.exit("시트 읽기 재시도 초과")
