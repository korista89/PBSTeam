# 보관 스크립트

예전에 한 번 쓰고 끝난 마이그레이션·점검 스크립트다. 배포에 포함되지 않는다.
`fix`·`recreate`·`migrate`·`reset`으로 시작하는 파일은 운영 시트를 바꾸므로 확인 없이 돌리지 않는다.
`do_push.py`·`push_fix.py`는 `git add -A` 후 push까지 하므로 쓰지 않는다.
돌려야 하면 `backend/`에서 실행한다: `cd backend && .venv/bin/python ../scripts/_archive/setup_sheets.py`
