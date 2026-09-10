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
| `scripts/`, `backend/*.py` | 일회성 마이그레이션·점검 스크립트 (`recreate_dashboard.py`, `fix_cico_empties.py` 등) |
| `docs/` | 설계 문서 |
| 루트 `01.~12. *.txt` | PBSTeam 2.0 재설계 기획 문서. 코드가 아니라 사양서다 |

데이터 저장소는 **Google Sheets**다. 일반적인 RDB가 아니므로 스키마 변경 비용이 다르다.

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
- 커밋·푸시는 사용자가 명시적으로 요청할 때만 한다.

## 스키마를 건드릴 때

백엔드 Pydantic 모델과 프론트 TypeScript 타입이 짝을 이룬다.
저장소에 `verify_schema_alignment.py` 와 `test_normalization_and_prompts.py` 가 있으니,
스키마를 바꾸면 이 둘을 돌려 어긋남을 먼저 확인한다.

## 스킬

전역 스킬은 `~/.codex/skills/` 에 있고 이 프로젝트에서도 그대로 쓴다.
행동중재 도메인 문서(FBA·BIP·IEP·운영계획서)를 만들 일이 생기면 해당 스킬을 열고,
코드 작업은 이 문서의 규칙을 따른다.
