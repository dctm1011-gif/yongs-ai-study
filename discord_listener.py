"""
Discord 명령어 리스너 (백그라운드 폴링).
Discord 채널에서 !inject, !update, !status 등 명령어 수신 → 실행.

Task Scheduler로 로그인 시 자동 시작:
  python discord_listener.py

지원 명령어:
  !inject [n]   논문 n개 추가 + 배포 (기본 10)
  !update       주간 전체 업데이트 (배치검색 + inject + 배포)
  !deploy       Netlify 배포만
  !status       현재 논문 수 / 시스템 상태
  !help         명령어 목록
"""
import json
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

# pythonw.exe는 stdout/stderr가 None → 로그 파일로 리다이렉트
_LOG = Path(__file__).parent / "paper_search" / "discord_listener.log"
if sys.stdout is None:
    sys.stdout = open(_LOG, "a", encoding="utf-8", buffering=1)
    sys.stderr = sys.stdout

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "history"))

from discord_utils import notify, _request, _cfg

POLL_INTERVAL = 10  # 초
PYTHON = sys.executable
STATE_FILE = ROOT / "paper_search" / "discord_listener_state.json"

_running_job = None  # (thread, name) — 현재 실행 중인 작업


def load_last_id() -> str | None:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())["last_id"]
        except Exception:
            pass
    return None


def save_last_id(msg_id: str):
    STATE_FILE.write_text(json.dumps({"last_id": msg_id}))


def get_paper_count() -> int:
    index = ROOT / "history" / "index.html"
    if not index.exists():
        return 0
    html = index.read_text(encoding="utf-8", errors="ignore")
    m = re.search(r'<div class="stat-num">(\d+)</div>\s*<div class="stat-label">저장된 논문', html)
    return int(m.group(1)) if m else 0


def _run_in_bg(name: str, cmd: list | str, shell: bool = False):
    """장시간 명령을 백그라운드 스레드로 실행 + 진행 중 상태 알림."""
    global _running_job

    def _worker():
        global _running_job
        start = time.time()

        def _ticker():
            while _running_job and _running_job[1] == name:
                elapsed = int(time.time() - start)
                if elapsed > 0 and elapsed % 60 == 0:
                    notify(f"⏳ `{name}` 진행 중... {elapsed // 60}분 경과")
                time.sleep(5)

        t = threading.Thread(target=_ticker, daemon=True)
        t.start()

        result = subprocess.run(
            cmd, cwd=ROOT, shell=shell,
            capture_output=True, text=True, encoding="utf-8", errors="ignore"
        )
        _running_job = None
        elapsed = int(time.time() - start)
        if result.returncode == 0:
            count = get_paper_count()
            notify(f"✅ `{name}` 완료! ({elapsed}초 소요, 논문 {count}개)")
        else:
            notify(f"❌ `{name}` 실패 ({elapsed}초)\n```\n{(result.stderr or result.stdout)[-300:]}\n```")

    thread = threading.Thread(target=_worker, daemon=True, name=name)
    _running_job = (thread, name)
    thread.start()


def handle_command(content: str, author: str):
    global _running_job
    content = content.strip()
    parts = content.split()
    cmd = parts[0].lower()
    args = parts[1:]

    notify(f"📥 `{content}` 명령 수신 (from {author})")

    if cmd == "!help":
        notify(
            "**📋 사용 가능한 명령어**\n"
            "> `!inject [n]` — 논문 n개 추가 + 배포 (기본 10)\n"
            "> `!update` — 배치검색 + inject + 배포\n"
            "> `!deploy` — Netlify 배포만\n"
            "> `!status` — 현재 상태 확인\n"
            "> `!help` — 이 목록"
        )

    elif cmd == "!status":
        count = get_paper_count()
        job_info = f"\n> 실행 중: `{_running_job[1]}`" if _running_job else ""
        notify(
            f"**📊 현재 상태**\n"
            f"> 저장된 논문: **{count}개**\n"
            f"> 포털: https://illustrious-cuchufli-7c4e58.netlify.app/history/"
            f"{job_info}"
        )

    elif cmd == "!inject":
        if _running_job:
            notify(f"⚠️ 이미 `{_running_job[1]}` 실행 중이에요. 완료 후 다시 시도해주세요.")
            return
        n = int(args[0]) if args and args[0].isdigit() else 10
        notify(f"🔄 논문 {n}개 추가 시작... (백그라운드, 완료 시 알림)")
        _run_in_bg("inject", [PYTHON, "history/inject_papers.py", str(n)])

    elif cmd == "!update":
        if _running_job:
            notify(f"⚠️ 이미 `{_running_job[1]}` 실행 중이에요. 완료 후 다시 시도해주세요.")
            return
        notify("🔄 주간 업데이트 시작... (백그라운드, 1분마다 진행 알림)")
        _run_in_bg("update", [PYTHON, "auto_update.py"])

    elif cmd == "!deploy":
        if _running_job:
            notify(f"⚠️ 이미 `{_running_job[1]}` 실행 중이에요.")
            return
        notify("🚀 Netlify 배포 시작...")
        _run_in_bg("deploy", "netlify deploy --prod", shell=True)

    else:
        notify(f"❓ 알 수 없는 명령: `{cmd}` — `!help` 로 목록 확인")


def main():
    notify("🟢 Discord 리스너 시작됨. `!help` 로 명령어 확인.")
    cfg = _cfg()
    channel_id = cfg["channel_id"]

    last_id = load_last_id()

    # last_id 없으면 현재 최신 메시지 이후부터 감지
    if not last_id:
        msgs = _request("GET", f"/channels/{channel_id}/messages?limit=1")
        if msgs:
            last_id = msgs[0]["id"]
            save_last_id(last_id)

    print(f"[listener] 폴링 시작 (interval={POLL_INTERVAL}s, last_id={last_id})")

    while True:
        try:
            url = f"/channels/{channel_id}/messages?limit=10"
            if last_id:
                url += f"&after={last_id}"
            msgs = _request("GET", url)

            if msgs:
                # Discord는 최신순으로 반환 → 오래된 것부터 처리
                for msg in reversed(msgs):
                    mid = msg["id"]
                    author = msg.get("author", {})
                    if author.get("bot"):
                        last_id = mid
                        continue
                    content = msg.get("content", "").strip()
                    if content.startswith("!"):
                        handle_command(content, author.get("username", "?"))
                    last_id = mid

                save_last_id(last_id)

        except Exception as e:
            print(f"[listener] 오류: {e}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
