"""Vercel Python 함수 번들 크기 감시.

의존성이 250MB를 넘으면 Vercel은 배포 때 넣지 않고 서버가 켜질 때마다 /tmp에 설치한다.
/tmp가 차면 설치가 실패해 모든 API가 500을 낸다(2026-10-26 로그인 불가 사고).
"""
import os
import shutil
import subprocess
import tempfile
import unittest


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Vercel은 진입점(backend/app/main.py)과 가장 가까운 파일을 읽는다.
DEPLOY_REQS = os.path.join(PROJECT_ROOT, "backend", "app", "requirements.txt")
COPIES = [
    os.path.join(PROJECT_ROOT, "requirements.txt"),
    os.path.join(PROJECT_ROOT, "backend", "requirements.txt"),
]
# 한도 250MB에서 앱 코드·런타임 여유 50MB를 뺀 값
BUDGET_MB = 200


def _dir_mb(path):
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            fp = os.path.join(root, f)
            if not os.path.islink(fp):
                total += os.path.getsize(fp)
    return total / 1024 / 1024


class DeployBundleTests(unittest.TestCase):
    def test_requirements_copies_match_deploy_file(self):
        with open(DEPLOY_REQS, encoding="utf-8") as f:
            expected = f.read()
        for path in COPIES:
            with open(path, encoding="utf-8") as f:
                self.assertEqual(f.read(), expected, f"{path} 가 backend/app/requirements.txt 와 다르다")

    @unittest.skipUnless(shutil.which("uv"), "uv 없음")
    def test_installed_dependencies_fit_vercel_budget(self):
        with tempfile.TemporaryDirectory() as target:
            subprocess.run(
                ["uv", "pip", "install", "-q", "--target", target,
                 "--python-platform", "x86_64-manylinux_2_28", "--python-version", "3.12",
                 "-r", DEPLOY_REQS],
                check=True,
            )
            size = _dir_mb(target)
        self.assertLess(size, BUDGET_MB, f"배포 의존성 {size:.0f}MB — {BUDGET_MB}MB 초과. 안 쓰는 패키지를 빼라")


if __name__ == "__main__":
    unittest.main()
