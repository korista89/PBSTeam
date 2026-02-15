# 특수학교 PBIS 통합관리플랫폼

본 프로젝트는 특수학교의 긍정적 행동지원(PBIS)을 위한 통합 관리 플랫폼입니다.
Tier 1, 2, 3 단계별 학생 행동 중재를 체계적으로 지원하며, AI 기반의 회의록 및 리포트 자동 생성 기능을 제공합니다.

## ✨ 주요 기능

### 1. 📊 대시보드
- **Tier 1 (보편적 지원)**: 전교생 행동 데이터 통계 (Big 5 분석), 월별 추세 그래프
- **Tier 2 (표적 집단 지원)**: CICO(Check-In/Check-Out) 점검표, 자동 수행률 계산
- **Tier 3 (개별화 지원)**: 학생별 개별화 중재 계획 및 심층 분석 리포트

### 2. 🤖 AI 기반 회의록 및 분석
- 학교행동중재지원팀 회의 효율화를 위한 AI 에이전트 도입
- 회의 안건 자동 생성, 진행 순서 가이드, 결정 사항 요약
- 학생 행동 데이터(FBA) 기반의 기능 추론 및 중재 전략 제안

### 3. 🔐 사용자 및 권한 관리
- **관리자**: 전체 학생/학급 관리, 데이터 갱신, 계정 초기화
- **교사**: 본인 학급 학생 관리, 상담 일지 작성, CICO 데이터 입력
- **게시판**: 공지사항 공유 (관리자 작성, 전체 열람)

## 🛠 기술 스택

- **Frontend**: Next.js 14, TypeScript, Recharts, Axios
- **Backend**: FastAPI, Python 3.10+, Pandas, OpenAI API
- **Database**: Google Sheets (NoSQL처럼 활용)
- **Design**: CSS Modules, Responsive Design

## 🚀 설치 및 실행 방법

### 사전 요구사항
- Node.js 18+ (Next.js 14 호환)
- Python 3.10+
- Google Cloud Service Account (`service_account.json`)
- OpenAI API Key

### 1. Backend 설정
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**.env 파일 설정 (`backend/.env`)**
```env
GOOGLE_SERVICE_ACCOUNT_JSON={"type": "service_account", ...} # 또는 경로 지정
SHEET_URL=https://docs.google.com/spreadsheets/d/your-sheet-id
OPENAI_API_KEY=sk-proj-your-key
```

**실행**
```bash
uvicorn app.main:app --reload
```

### 2. Frontend 설정
```bash
cd frontend
npm install
```

**.env.local 파일 설정 (`frontend/.env.local`)**
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**실행**
```bash
npm run dev
```

## 📂 프로젝트 구조

```
.
├── backend/            # FastAPI 서버
│   ├── app/            # 애플리케이션 코드
│   │   ├── api/        # API 엔드포인트
│   │   ├── services/   # 비즈니스 로직 (Sheets, AI, Analysis)
│   │   └── core/       # 설정 및 유틸리티
│   └── requirements.txt
├── frontend/           # Next.js 클라이언트
│   ├── src/app/        # 페이지 및 컴포넌트
│   └── public/         # 정적 자산
└── README.md           # 프로젝트 문서
```

## 📝 라이선스
MIT License
