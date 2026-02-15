# Python 3.9 이미지 사용
FROM python:3.9-slim

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 의존성 설치 (필요한 경우)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 의존성 파일 복사 및 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY . .

# 구글 인증 파일이 있다면 복사 (보안 주의: 실제 배포시엔 Secret Manager 권장)
# COPY service_account.json .

# 포트 노출
EXPOSE 8000

# 실행 명령 (uvicorn)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
