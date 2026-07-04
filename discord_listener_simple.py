"""
논문봇 - 간단한 버전
!inject [n] - 논문 n개 추가
!deploy - 배포
!status - 상태
"""
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "history"))

from discord_utils import notify, _request, _cfg

POLL_INTERVAL = 10
STATE_FILE = ROOT / "paper_search" / "discord_listener_state.json"

def log(msg):
    ts = time.strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{ts}] {msg}")

def load_last_id():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())["last_id"]
        except:
            pass
    return None

def save_last_id(msg_id):
    STATE_FILE.write_text(json.dumps({"last_id": msg_id}))

def handle_command(content):
    """명령 처리"""
    content = content.strip()
    log(f"명령: {content[:50]}")

    if content.lower().startswith("!inject"):
        parts = content.split()
        n = int(parts[1]) if len(parts) > 1 else 10
        notify(f"📄 논문 {n}개 추가 시작...")

        try:
            result = subprocess.run(
                [sys.executable, str(ROOT / "history" / "inject_papers.py"), str(n)],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                timeout=300
            )
            if result.returncode == 0:
                notify(f"✅ 논문 {n}개 추가 완료!")
            else:
                notify(f"❌ 오류: {result.stderr[:200]}")
        except Exception as e:
            notify(f"❌ 오류: {str(e)[:200]}")

    elif content.lower() == "!deploy":
        notify("🚀 배포 시작...")
        try:
            result = subprocess.run(
                ["netlify", "deploy", "--prod"],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                timeout=60
            )
            if result.returncode == 0:
                notify("✅ 배포 완료!")
            else:
                notify(f"❌ 배포 오류: {result.stderr[:200]}")
        except Exception as e:
            notify(f"❌ 오류: {str(e)[:200]}")

    elif content.lower() == "!status":
        try:
            index = ROOT / "history" / "index.html"
            html = index.read_text(encoding="utf-8", errors="ignore")
            import re
            m = re.search(r'<div class="stat-num">(\d+)</div>', html)
            count = int(m.group(1)) if m else 0
            notify(f"📊 현재 논문 수: **{count}개**")
        except Exception as e:
            notify(f"❌ 상태 조회 오류: {e}")

    elif content.lower() == "!help":
        notify("""📚 **논문봇 명령어**
`!inject [n]` - 논문 n개 추가 (기본 10)
`!deploy` - Netlify 배포
`!status` - 현재 논문 수
`!help` - 도움말""")

    else:
        notify(f"❓ 알 수 없는 명령: {content}\n`!help` 입력 바람")

def main():
    log("논문봇 시작")
    notify("🟢 논문봇이 온라인입니다!")

    last_id = load_last_id()
    cfg = _cfg()
    channel_id = cfg["channel_id"]

    log(f"채널: {channel_id}, 마지막 ID: {last_id}")

    while True:
        try:
            url = f"/channels/{channel_id}/messages?limit=10"
            if last_id:
                url += f"&after={last_id}"

            msgs = _request("GET", url)

            if msgs and isinstance(msgs, list):
                for msg in reversed(msgs):
                    mid = msg["id"]

                    # 봇 메시지 무시
                    if msg.get("author", {}).get("bot"):
                        last_id = mid
                        continue

                    content = msg.get("content", "").strip()
                    username = msg.get("author", {}).get("username", "unknown")

                    if content:
                        log(f"{username}: {content[:50]}")
                        handle_command(content)

                    last_id = mid

                save_last_id(last_id)

        except Exception as e:
            log(f"오류: {e}")

        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("종료")
