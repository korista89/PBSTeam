# PBSTeam — 특수학교 PBIS 통합관리플랫폼

이 저장소에서 작업할 때 먼저 읽는다. 여기 적힌 것은 실제 저장소를 확인해 기록한 사실이다.

## 무엇을 하는 프로그램인가

특수학교 긍정적 행동지원(PBIS)을 Tier 1·2·3 단계로 관리하는 웹 플랫폼이다.
전교생 행동 통계(Big 5), CICO 점검표와 수행률, 학생별 개별 중재 계획을 다루고,
학교행동중재지원팀 회의록과 FBA 기반 기능 추론을 AI로 생성한다.

## 구조

| 위치 | 내용 |
|---|---|
| `backend/app/` | FastAPI 애플리케이션. `main.py`, `schemas.py`, `api/`, `services/`, `core/`, `domain/`, `adapters/`, `data/` |
| `frontend/src/` | Next.js 14.2.0 + TypeScript 클라이언트 |
| `tests/` | `test_ai_fba_contract.py`, `test_sheet_sync.py` |
| `scripts/` | 운영 스크립트(`anonymize_sheet.py`, `daily_briefing_telegram.py`). 일회성 스크립트는 `scripts/_archive/` |
| `docs/` | 설계 문서 |
| 루트 `01.~12. *.txt` | PBSTeam 2.0 재설계 기획 문서. 코드가 아니라 사양서다 |

데이터 저장소는 **Google Sheets**다. 일반적인 RDB가 아니므로 스키마 변경 비용이 다르다.

### 운영 시트 구성 (2026-11-01 재구조화)

- 운영 시트(`SHEET_URL`)는 18탭. 사람이 보는 탭은 `TierStatus`·`CICO_설정`·`날짜 관리`·`Log_Main`만 보이고 나머지는 숨김이다(앱은 숨긴 탭도 읽는다).
- CICO는 월별 탭(3월·4월…)이 아니라 `CICO_설정`(학년도·월·학생·목표 순번·기록방식)·`CICO_기록`(날짜·학생·목표·교시·값)·`CICO_달력`(월별 기록일) 3개 표다.
  `adapters/sheets/cico_store.py`의 `MonthSheet`가 예전 월별 탭 모양을 만들어 주므로 `get_worksheet_fuzzy(sheet, "10월")`로 연다. 월별 탭을 새로 만들지 않는다.
- CICO 기록 방식은 일별(기본)과 분포도기록지(교시별, 초등은 3교시 뒤·그 외는 4교시 뒤 점심) 중 고른다.
- **Tier는 월별로 관리한다(2026-11-14).** 단계마다 그 달 출처는 하나다: CICO=`CICO_설정`의 그 달 줄, SST=그 달 운영 중인 `SST_프로그램`(학년도 최대 6개) 대상, Tier3·Tier3+=`Tier3_월별`(정정은 상태='제외'). 모두 숨김 탭이고 앱이 처음 저장할 때 만든다.
  Tier1관리는 운영계획 Ⅰ(보편적 행동지원)을 따른다: 고정 자료 `backend/app/data/tier1_plan.json`(장소별 IEP 세부목표·교수 전략·토큰 단계·경은마트·실행충실도 12문항), 숨김 탭 `Tier1_교수기록`(주×학급)·`Tier1_토큰집계`(월×학급 1000원 수량, 담임 입력)·`Tier1_충실도`(학기×학급, 0/1/2, 80% 미만 지원). 담임은 자기 학급만 입력.
  프로그램 표(숨김 탭): `Tier1_프로그램`(범위·표적 행동, 성과=10명당 표적 행동), `SST_프로그램`(최대 6개), `Tier3+_프로그램`(학생 1명·최대 20개, 연계기관). SST·Tier3+는 `sst.ProgramBook`을 같이 쓴다. Tier3+ '단계'는 여전히 `Tier3_월별`이 출처다.
  TierStatus의 Tier2(CICO)·Tier2(SST)·Tier3·Tier3+ 칸은 **이번 달의 거울**이다(사이트 다른 화면이 읽음). 관리 탭에서 이번 달 표를 바꾸면 `tier_monthly.mirror_after_change`가 그 탭의 칸만, 바뀐 학생만 맞춘다. 전교생 차이는 Tier현황 탭에서 사람이 보고 '모두 반영'할 때만 쓴다. 그 달 표가 없는 단계는 거울에 쓰지 않는다. Tier3+ 학생은 Tier3 칸도 O(관례). TierStatus 칸을 직접 쓰는 새 코드를 만들지 않는다.
- 그림말누리제(`PW_*`·`평가문장`)는 별도 파일 `PW_SHEET_URL`(`open_pw_sheet()`). 옛 월별 탭·안 쓰는 탭은 보관 파일 `26경은PBST 보관 (2026-11-01 정리)`에 있다.

## 실행

```bash
# 백엔드 (backend/ 에서)
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://localhost:8000

# 프론트엔드 (frontend/ 에서)
npm install
npm run dev                            # next dev
```

프론트는 `NEXT_PUBLIC_API_URL=http://localhost:8000` 를 `frontend/.env.local` 에서 읽는다.

## 절대 하지 말 것

- `backend/.env` 와 `backend/service_account.json` 을 **커밋하지 않는다.** `.gitignore`에 이미 들어 있다.
  이 두 파일에는 Google 서비스 계정 자격증명과 OpenAI API 키가 들어 있다.
- 실제 학생 데이터가 든 시트를 대상으로 파괴적 스크립트(`fix_*.py`, `recreate_*.py`)를
  확인 없이 돌리지 않는다. 이름이 `fix`·`recreate`·`migrate`로 시작하면 전부 여기 해당한다.

## 커밋·배포

- 작업이 끝나면 **항상 커밋하고 `main`에 푸시해 배포한다**(2026-11-13 사용자 지시, 매번 따로 묻지 않는다).
- 작업 전부터 있던 커밋 안 된 변경은 섞지 않고 이번에 바꾼 파일만 올린다. 비밀값·실명 자료가 보이면 멈추고 알린다.
- 푸시 뒤 Vercel 반영(`gespbs.com`)을 확인하고 보고한다.

## 계정과 열람 범위 (2026-11-17)

- 역할은 관리자(admin)·담임(class_teacher)·**과정부장(division_head)**·**늘봄실장(afterschool)** 네 가지다. 과정부장은 Users.ClassID에 과정명(초등저학년=유치원·초1·초2, 초등고학년, 중학교, 고등학교, 전공과)을 적는다.
- 범위 판정은 `api/deps.py`의 `user_scope`·`in_scope`·`student_in_scope`·`narrow_scope` 하나로 한다. 새 코드에서 `user_class == ...`로 학급을 직접 비교하지 않는다. 결재(require_admin)는 관리자 전용 그대로다.
- 늘봄실장은 숨김 탭 `늘봄_참여학생`의 학생만 기록·조회하고, 늘봄 시간 기록은 시간대 `11구간: 늘봄(교내 방과후)`이다.

## 개인정보 보호 (2026-11-25)

- `PRIVACY_MODE`(환경변수, 기본 `2026_HYBRID_RBAC`) — `2027_FULL_ZERO_PII`면 인쇄 사유 선택 등이 켜진다. `/auth/me`가 프론트에 알린다.
- 계정은 직책·학급 1:1 아이디. 겸임은 Users의 `Roles`(쉼표)·`AssignedClasses`(쉼표, ClassID 대신) 칸. 권한 계산은 `deps.account_profile` 하나로 한다.
  `pbst_staff`(기능 담당자)는 배정 학급이 없으면 admin처럼 동작하되 계정 관리(`require_account_admin`)는 못 한다. 이관은 `scripts/migrate_accounts.py`.
- 국외 AI 호출은 `_call_llm` 한 곳을 지난다: 별칭·학생코드를 '학생A'로 바꿔 보내고 답에서 되돌린다(`services/ai_privacy.py`). 차트 해석은 `chart_payload`로 집계만 보낸다.
- 감사로그는 숨김 탭 `접속기록`(덧붙이기만, 줄마다 HMAC 서명). 고치거나 지우는 코드를 만들지 않는다. 인쇄 버튼은 `window.print()` 대신 `PrintGuard`의 `requestPrint()`.
- 인쇄물 실명은 인쇄 화면에서 직접 입력(`RealNameInput`)한 값으로만 바꾼다. 저장·전송하지 않는다.

## 학생 이름

시트(Log_Main·TierStatus·월별 탭·PW_어휘데이터 등)에는 실명이 아니라 **별칭**(김O준, 이O, 겹치면 김O준-1011)만 저장한다.
규칙은 `backend/app/core/privacy.py` 와 프런트 `utils.ts`의 `maskName`이 같아야 한다.
이름을 시트에 쓰는 새 코드는 `mask_name`/`alias_for`를 거친다. 일괄 변환·점검은 `scripts/anonymize_sheet.py`(기본은 점검만, `--apply`, `--verify`).
실명↔별칭 대응표는 저장소 밖 `~/data/pbst_alias_map.json`에만 둔다.
예약 작업(WSL systemd --user): `pbst-anonymize.timer`(새 실명 가림, `--incremental`), `pbst-briefing.timer`(평일 07:30 브리핑 텔레그램). 로그는 `~/data/pbst_*.log`.

## 백엔드 의존성

Vercel은 `backend/app/requirements.txt`를 읽는다. 루트·`backend/` 사본과 내용이 같아야 한다.
설치 크기가 250MB를 넘으면 매 시작마다 런타임 설치→공간 부족→전 API 500이 난다. 새 패키지는 `tests/test_deploy_bundle.py`(200MB 예산)를 통과해야 한다.

## 스키마를 건드릴 때

백엔드 Pydantic 모델과 프론트 TypeScript 타입이 짝을 이룬다.
저장소에 `verify_schema_alignment.py` 와 `test_normalization_and_prompts.py` 가 있으니,
스키마를 바꾸면 이 둘을 돌려 어긋남을 먼저 확인한다.

## 스킬

전역 스킬은 `~/.codex/skills/` 에 있고 이 프로젝트에서도 그대로 쓴다.
행동중재 도메인 문서(FBA·BIP·IEP·운영계획서)를 만들 일이 생기면 해당 스킬을 열고,
코드 작업은 이 문서의 규칙을 따른다.
