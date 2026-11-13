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
