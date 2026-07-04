#!/usr/bin/env python3
"""GitHub에 변경사항을 push하는 스크립트"""
import subprocess
import sys
import os
from pathlib import Path

def run_git(cmd, cwd=None):
    """Git 명령어 실행"""
    git_exe = r"C:\Users\dctm1\AppData\Local\GitHubDesktop\app-3.6.1\resources\app\git\cmd\git.exe"
    full_cmd = cmd.replace("git ", f'"{git_exe}" ')

    try:
        result = subprocess.run(
            full_cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=cwd
        )
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, "", str(e)

def main():
    project_dir = Path(__file__).parent
    os.chdir(project_dir)

    print("=" * 60)
    print("GitHub Push 작업 시작")
    print("=" * 60)

    # 1. 상태 확인
    print("\n[1] Git 상태 확인...")
    code, stdout, stderr = run_git("git status --short")
    if code != 0:
        print(f"[ERROR] 오류: {stderr}")
        return 1

    if not stdout.strip():
        print("[OK] 변경사항이 없습니다.")
        return 0

    print("변경된 파일:")
    for line in stdout.strip().split('\n'):
        print(f"  {line}")

    # 2. 모든 변경사항 staging
    print("\n[2] 변경사항을 staging 중...")
    code, stdout, stderr = run_git("git add -A")
    if code != 0:
        print(f"[ERROR] Add 실패: {stderr}")
        return 1
    print("[OK] 모든 변경사항이 staging되었습니다.")

    # 3. Commit
    print("\n[3] Commit 중...")
    commit_msg = """TOEFL Writing 답변 저장 시스템 구현

- toefl/index.html: Writing 섹션에 Save 버튼 추가
- toefl/responses.json: 답변 저장소 생성
- server.py: /api/feedback (Claude API 피드백), /api/save-response (답변 저장) 엔드포인트 추가"""

    code, stdout, stderr = run_git(f'git commit -m "{commit_msg}"')
    if code != 0:
        print(f"[ERROR] Commit 실패: {stderr}")
        return 1
    print("[OK] Commit이 완료되었습니다.")
    print(stdout)

    # 4. Push
    print("\n[4] GitHub에 Push 중...")
    code, stdout, stderr = run_git("git push origin main")
    if code != 0:
        print(f"[ERROR] Push 실패: {stderr}")
        return 1
    print("[OK] GitHub에 Push가 완료되었습니다.")
    print(stdout)

    print("\n" + "=" * 60)
    print("[OK] 모든 작업이 완료되었습니다!")
    print("[URL] 배포 URL: https://dctm1011-gif.github.io/yongs-ai-study/")
    print("=" * 60)

    return 0

if __name__ == "__main__":
    sys.exit(main())
