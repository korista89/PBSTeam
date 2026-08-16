#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
[경은PBST] 로컬 AI (Ollama) 상태 확인 및 Vercel 연동 터널링 도구
=============================================================
이 스크립트는 선생님 PC의 Ollama(qwen3.5-custom) 상태를 점검하고,
Vercel 배포 사이트(https://pbs-team.vercel.app/)에서도
선생님 PC의 로컬 AI를 100% 무료/보안 상태로 활용할 수 있도록 지원합니다.
"""

import os
import sys
import json
import urllib.request
import urllib.error

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

OLLAMA_URL = os.environ.get("LOCAL_LLM_URL", "http://localhost:11434")

print("=" * 65)
print("🤖 [경은PBST] 로컬 AI (Ollama) 엔진 상태 점검")
print("=" * 65)

try:
    req = urllib.request.Request(f"{OLLAMA_URL}/api/tags", headers={"User-Agent": "PBS-Checker/1.0"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        models = [m.get("name") for m in data.get("models", [])]
        print(f"✅ Ollama 로컬 서버 정상 작동 중! ({OLLAMA_URL})")
        print("📦 설치된 AI 모델 목록:")
        for m in models:
            is_custom = "⭐ (기본 사용)" if "qwen3.5-custom" in m else ""
            print(f"   - {m} {is_custom}")
            
except urllib.error.URLError as e:
    print(f"❌ Ollama 로컬 서버에 연결할 수 없습니다. ({OLLAMA_URL})")
    print("   💡 터미널에서 'ollama serve' 또는 Ollama 앱을 실행해주세요.")
    sys.exit(1)

print("\n" + "-" * 65)
print("💡 안내사항:")
print("1. 로컬 개발 환경(npm run dev): 자동으로 localhost:11434 (qwen3.5-custom)를 호출합니다.")
print("2. Vercel 배포 환경: 로컬 AI를 외부 Vercel과 연결하려면 Cloudflare Tunnel 또는 ngrok을 실행한 후,")
print("   Vercel 환경변수 'LOCAL_LLM_URL'에 해당 터널 URL을 등록하시면 됩니다.")
print("=" * 65)
