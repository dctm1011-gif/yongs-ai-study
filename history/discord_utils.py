"""Discord 알림 및 yes/no 응답 유틸리티.

사용법:
  from discord_utils import notify, ask_yes_no

  notify("배포 완료!")
  result = ask_yes_no("논문 5개를 추가합니다. 계속할까요?")
  # True=yes, False=no, None=timeout
"""
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

CONFIG_FILE = Path(__file__).parent.parent / "paper_search" / "discord_config.json"
API_BASE = "https://discord.com/api/v10"


def _cfg() -> dict:
    return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))


def _request(method: str, path: str, data: dict | None = None) -> dict | list | None:
    cfg = _cfg()
    url = f"{API_BASE}{path}"
    body = json.dumps(data).encode("utf-8") if data else None
    headers = {
        "Authorization": f"Bot {cfg['bot_token']}",
        "Content-Type": "application/json",
        "User-Agent": "DiscordBot (https://github.com/yong, 1.0)",
    }
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body_err = e.read().decode("utf-8", errors="ignore")
        print(f"[Discord] HTTP {e.code}: {body_err[:300]}")
        return None
    except Exception as e:
        print(f"[Discord] 요청 실패: {e}")
        return None


def notify(text: str) -> str | None:
    """Discord 채널에 알림 전송. 메시지 ID 반환."""
    cfg = _cfg()
    result = _request("POST", f"/channels/{cfg['channel_id']}/messages", {"content": text})
    if result:
        return result.get("id")
    return None


def ask_yes_no(question: str, timeout: int = 300, default: bool | None = None) -> bool | None:
    """
    Discord에 yes/no 질문 전송 후 답변 대기 (폴링).

    Args:
        question: 질문 텍스트
        timeout:  답변 대기 시간 (초, 기본 300초)
        default:  timeout 시 반환할 기본값 (None이면 None 반환)

    Returns:
        True  = yes/y/네/응
        False = no/n/아니
        None  = timeout 또는 전송 실패
    """
    cfg = _cfg()
    channel_id = cfg["channel_id"]

    msg = notify(
        f"🤖 **질문**: {question}\n"
        f"> `yes` 또는 `no` 로 답해주세요. ({timeout}초 내)\n"
        f"> 답변 없으면 {'기본값: ' + ('yes' if default is True else 'no') if default is not None else '중단'}"
    )
    if msg is None:
        print("[Discord] 질문 전송 실패 - 기본값으로 진행")
        return default

    after_id = msg
    deadline = time.time() + timeout

    while time.time() < deadline:
        time.sleep(5)
        msgs = _request("GET", f"/channels/{channel_id}/messages?after={after_id}&limit=20")
        if not msgs:
            continue

        for m in msgs:
            if m.get("author", {}).get("bot"):
                continue
            content = m.get("content", "").strip().lower()
            if content in ("yes", "y", "네", "응", "ㅇ", "ok"):
                notify(f"✅ 답변 수신: **{content}** → 계속 진행!")
                return True
            elif content in ("no", "n", "아니", "노", "ㄴ"):
                notify(f"❌ 답변 수신: **{content}** → 중단.")
                return False
            # 봇 메시지 말고 다른 메시지 있으면 after_id 갱신
            after_id = m["id"]

    notify(
        f"⏱️ {timeout}초 초과 — "
        + (f"기본값 **{'yes' if default is True else 'no'}** 으로 진행." if default is not None else "중단.")
    )
    return default


if __name__ == "__main__":
    # 테스트
    print("Discord 연결 테스트...")
    mid = notify("🔧 discord_utils.py 테스트 메시지입니다. Claude Code에서 보낸 알림이에요!")
    if mid:
        print(f"전송 성공! 메시지 ID: {mid}")
    else:
        print("전송 실패.")
