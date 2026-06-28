"""
일일 자동 논문 업데이트 (매일 새벽 05:00).
Windows Task Scheduler "YongAIStudyWeeklyUpdate" 에서 실행됨.
0. GitHub prefs.json → user_prefs.json 동기화 (모바일 좋아요 반영)
1. batch_search.py 로 새 논문 검색
2. inject_papers.py 로 HTML 업데이트 + GitHub Pages 배포
"""
import base64
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT         = Path(__file__).parent
PAPER_SEARCH = ROOT / "paper_search"
PYTHON       = sys.executable
GH_PREFS_URL = "https://api.github.com/repos/dctm1011-gif/yongs-ai-study/contents/prefs.json"
PREFS_FILE   = PAPER_SEARCH / "user_prefs.json"

def _gh_token():
    tok = os.environ.get("GH_PREFS_TOKEN", "")
    if tok:
        return tok
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as k:
            val, _ = winreg.QueryValueEx(k, "GH_PREFS_TOKEN")
            return val
    except Exception:
        return ""

sys.path.insert(0, str(ROOT / "history"))
try:
    from discord_utils import notify
except Exception:
    def notify(text): pass


def run(cmd, cwd):
    result = subprocess.run(cmd, cwd=cwd, shell=True)
    return result.returncode == 0


def sync_prefs_from_github():
    """GitHub prefs.json의 최신 좋아요/삭제 상태를 로컬 user_prefs.json에 반영."""
    try:
        req = urllib.request.Request(
            GH_PREFS_URL,
            headers={"Authorization": f"Bearer {_gh_token()}", "Accept": "application/vnd.github+json"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            meta = json.loads(resp.read().decode())
        content = base64.b64decode(meta["content"].replace("\n", "")).decode("utf-8")
        prefs = json.loads(content)
        # 로컬과 비교: liked/deleted 합집합 (더 많은 쪽 우선)
        local = json.loads(PREFS_FILE.read_text(encoding="utf-8")) if PREFS_FILE.exists() else {}
        local_liked    = set(local.get("liked", []))
        remote_liked   = set(prefs.get("liked", []))
        local_deleted  = set(local.get("deleted", []))
        remote_deleted = set(prefs.get("deleted", []))
        merged = {
            "liked":        list(local_liked  | remote_liked),
            "deleted":      list(local_deleted | remote_deleted),
            "read":         list(set(local.get("read", [])) | set(prefs.get("read", []))),
            "hide_liked":   prefs.get("hide_liked", local.get("hide_liked", False)),
            "last_updated": prefs.get("last_updated", ""),
        }
        PREFS_FILE.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
        added_likes = len(remote_liked - local_liked)
        print(f"  동기화 완료: liked {len(merged['liked'])}개 (새 좋아요 {added_likes}개 반영)")
        return added_likes
    except Exception as e:
        print(f"  GitHub 동기화 실패 (계속 진행): {e}")
        return 0


def main():
    from datetime import date
    today = date.today().strftime('%m/%d')
    notify(f"🌅 **일일 논문 자동 업데이트 시작** ({today} 새벽 5시)\n> 모바일 동기화 → 논문 검색 → 배포 중...")
    print("=== 일일 자동 업데이트 시작 ===")

    print("\n[0/3] GitHub prefs.json → user_prefs.json 동기화...")
    new_likes = sync_prefs_from_github()

    print("\n[1/3] 새 논문 배치 검색...")
    ok = run(f'"{PYTHON}" batch_search.py', PAPER_SEARCH)
    if not ok:
        print("배치 검색 실패 — inject 단계로 진행")
        notify("⚠️ 배치 검색 실패 — inject 단계로 계속 진행해요.")

    print("\n[2/3] 논문 주입 + paper-N.html 생성 + GitHub Pages 배포...")
    run(f'"{PYTHON}" history/inject_papers.py 20', ROOT)

    print("\n=== 완료 ===")


if __name__ == "__main__":
    main()
