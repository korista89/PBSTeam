"""실명 대응표(~/data/pbst_alias_map.json)에 빠진 학생 한 명을 채운다. 실명은 화면·로그에 찍지 않는다.

사용법 (저장소 루트에서): 학생 실명을 복사(Ctrl+C)한 뒤
  backend/.venv/bin/python scripts/add_real_name.py 1013
- 실명은 Windows 클립보드에서 읽는다(채팅·명령줄에 이름을 쓰지 않게).
- 운영 시트의 그 학생 표기(별칭)와 실명을 가린 모양이 같아야 저장한다(오타·다른 학생 방지).
- 저장 전 파일을 .bak_YYYYMMDDHHMM 으로 남긴다.
"""
import json
import os
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.core.privacy import mask_name  # noqa: E402

PATH = os.path.expanduser("~/data/pbst_alias_map.json")


def clipboard() -> str:
    out = subprocess.run(["powershell.exe", "-NoProfile", "-Command",
                          "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard"],
                         capture_output=True, timeout=20)
    return out.stdout.decode("utf-8", "ignore").strip()


def main(code: str):
    from app.services.sheets import fetch_student_status
    st = next((s for s in fetch_student_status() if str(s.get("학생코드", "")).strip() == code), None)
    if not st:
        sys.exit(f"학생코드 {code}를 TierStatus에서 찾지 못했습니다.")
    label = str(st.get("학생이름", "")).strip()
    real = clipboard()
    if not real or "\n" in real or len(real) > 10:
        sys.exit("클립보드에 학생 이름 한 개만 복사한 뒤 다시 실행하세요.")
    if mask_name(real) != label.split("-")[0]:
        sys.exit(f"복사한 이름을 가리면 '{mask_name(real)}'인데 시트 표기는 '{label}'입니다. 저장하지 않았습니다.")
    data = json.load(open(PATH, encoding="utf-8"))
    if real in data["alias"] and code in data["codes"].get(real, []):
        sys.exit(f"이미 들어 있습니다({label}).")
    shutil.copy2(PATH, PATH + time.strftime(".bak_%Y%m%d%H%M"))
    data["alias"][real] = label
    data["codes"].setdefault(real, [])
    if code not in data["codes"][real]:
        data["codes"][real].append(code)
    fd = os.open(PATH + ".tmp", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(PATH + ".tmp", PATH)
    print(f"저장했습니다: 학생코드 {code} · {st.get('학급', '')} · 표기 {label} (실명 {len(real)}글자). 대응표 {len(data['alias'])}명")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1].strip())
